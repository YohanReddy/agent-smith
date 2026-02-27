/**
 * Chain workflow: sequential LLM calls where each step's output feeds the next.
 *
 * workflowConfig JSON:
 * {
 *   "steps": [
 *     { "name": "Draft", "systemPrompt": "You are a content writer. Write a first draft." },
 *     { "name": "Critique", "systemPrompt": "You are an editor. Identify weaknesses." },
 *     { "name": "Revise", "systemPrompt": "You are a writer. Revise based on the critique." }
 *   ]
 * }
 *
 * If no steps are configured, falls back to two steps: Draft → Polish.
 */
import { generateText } from "ai";
import { z } from "zod";
import { getModel, parseConfig, writeStep, type WorkflowContext, type WorkflowResult } from "./types";

type ChainStep = { name: string; systemPrompt: string };
type ChainConfig = { steps?: ChainStep[] };
const chainStepSchema = z.object({
  name: z.string().min(1),
  systemPrompt: z.string().min(1),
});
const chainConfigSchema = z.object({
  steps: z.array(chainStepSchema).optional(),
});

const DEFAULT_STEPS: ChainStep[] = [
  { name: "Draft", systemPrompt: "You are a helpful assistant. Respond to the user's request." },
  { name: "Polish", systemPrompt: "You are an editor. Improve the following response for clarity, accuracy, and tone. Return only the improved text." },
];

export async function runChain(ctx: WorkflowContext): Promise<WorkflowResult> {
  const { agent, input, runId, convex } = ctx;
  const config = parseConfig<ChainConfig>(agent.workflowConfig, chainConfigSchema, {
    steps: DEFAULT_STEPS,
  });
  const steps = config.steps?.length ? config.steps : DEFAULT_STEPS;
  const model = getModel(agent.model);

  let currentContent = input;
  let totalTokens = 0;
  let stepNum = 0;

  for (const step of steps) {
    stepNum++;
    const t0 = Date.now();

    const { text, usage } = await generateText({
      model,
      system: step.systemPrompt,
      prompt: currentContent,
    });

    totalTokens += (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);

    await writeStep(convex, {
      runId,
      stepNumber: stepNum,
      stepName: step.name,
      stepType: "chain",
      text,
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
      durationMs: Date.now() - t0,
      finishReason: "stop",
    });

    // Each step's output becomes the next step's input
    currentContent = text;
  }

  return { output: currentContent, totalTokens };
}
