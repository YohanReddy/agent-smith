/**
 * Orchestrator-Worker workflow: an orchestrator LLM plans the work (structured output),
 * then specialized workers execute each planned item in parallel.
 *
 * workflowConfig JSON:
 * {
 *   "workerSystemPrompt": "You are an implementation specialist. Execute the assigned task precisely."
 * }
 *
 * The agent's systemPrompt is used for the orchestrator (planner).
 */
import { generateText, Output } from "ai";
import { z } from "zod";
import { getModel, parseConfig, writeStep, type WorkflowContext, type WorkflowResult } from "./types";

type OrchestratorConfig = { workerSystemPrompt?: string };

const planSchema = z.object({
  tasks: z.array(
    z.object({
      name: z.string().describe("Short name for this task"),
      description: z.string().describe("What the worker should do"),
      focus: z.string().describe("The specific aspect or angle to focus on"),
    }),
  ),
  context: z.string().describe("Shared context that all workers need"),
});

export async function runOrchestrator(ctx: WorkflowContext): Promise<WorkflowResult> {
  const { agent, input, runId, convex } = ctx;
  const config = parseConfig<OrchestratorConfig>(agent.workflowConfig, {});
  const workerSystemPrompt =
    config.workerSystemPrompt ??
    "You are a skilled specialist. Execute the assigned task and provide a thorough, focused response.";
  const model = getModel(agent.model);

  let totalTokens = 0;

  // Step 1: Orchestrator plans the work
  const t0 = Date.now();
  const { output: plan, usage: planUsage } = await generateText({
    model,
    system: agent.systemPrompt,
    output: Output.object({ schema: planSchema }),
    prompt: `Analyze this request and break it into 2-4 focused parallel tasks:\n\n${input}`,
  });

  totalTokens += (planUsage?.inputTokens ?? 0) + (planUsage?.outputTokens ?? 0);

  await writeStep(convex, {
    runId,
    stepNumber: 1,
    stepName: "Plan",
    stepType: "plan",
    text: `Planned ${plan.tasks.length} tasks:\n${plan.tasks.map((t: { name: string; description: string }, i: number) => `${i + 1}. **${t.name}**: ${t.description}`).join("\n")}`,
    inputTokens: planUsage?.inputTokens,
    outputTokens: planUsage?.outputTokens,
    durationMs: Date.now() - t0,
    finishReason: "stop",
  });

  const groupId = `workers-${Date.now()}`;

  // Steps 2..n: Workers execute in parallel
  const workerResults = await Promise.all(
    plan.tasks.map(async (task: { name: string; description: string; focus: string }, i: number) => {
      const tw = Date.now();
      const { text, usage } = await generateText({
        model,
        system: workerSystemPrompt,
        prompt: `Context: ${plan.context}\n\nYour task: ${task.name}\n${task.description}\n\nFocus on: ${task.focus}\n\nOriginal request: ${input}`,
      });

      totalTokens += (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);

      await writeStep(convex, {
        runId,
        stepNumber: i + 2,
        stepName: task.name,
        stepType: "worker",
        groupId,
        text,
        inputTokens: usage?.inputTokens,
        outputTokens: usage?.outputTokens,
        durationMs: Date.now() - tw,
        finishReason: "stop",
      });

      return { name: task.name, output: text };
    }),
  );

  // Final step: Synthesize all worker outputs
  const ts = Date.now();
  const workerSummary = workerResults
    .map((r: { name: string; output: string }) => `## ${r.name}\n${r.output}`)
    .join("\n\n");

  const { text: synthesis, usage: synthUsage } = await generateText({
    model,
    system: "You are a senior synthesizer. Combine the specialist outputs into a coherent, comprehensive response.",
    prompt: `Original request: ${input}\n\nSpecialist outputs:\n${workerSummary}`,
  });

  totalTokens += (synthUsage?.inputTokens ?? 0) + (synthUsage?.outputTokens ?? 0);

  await writeStep(convex, {
    runId,
    stepNumber: plan.tasks.length + 2,
    stepName: "Synthesis",
    stepType: "synthesis",
    text: synthesis,
    inputTokens: synthUsage?.inputTokens,
    outputTokens: synthUsage?.outputTokens,
    durationMs: Date.now() - ts,
    finishReason: "stop",
  });

  return { output: synthesis, totalTokens };
}
