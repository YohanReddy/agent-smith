/**
 * Parallel workflow: independent workers analyze the same input concurrently,
 * then a synthesizer combines their outputs.
 *
 * workflowConfig JSON:
 * {
 *   "workers": [
 *     { "name": "Security", "systemPrompt": "You are a security expert. Analyze for vulnerabilities." },
 *     { "name": "Performance", "systemPrompt": "You are a performance expert. Identify bottlenecks." },
 *     { "name": "Quality", "systemPrompt": "You are a code quality expert. Review readability." }
 *   ],
 *   "synthesize": "You are a tech lead. Synthesize the expert reviews into a concise summary with key actions."
 * }
 */
import { generateText } from "ai";
import { getModel, parseConfig, writeStep, type WorkflowContext, type WorkflowResult } from "./types";

type Worker = { name: string; systemPrompt: string };
type ParallelConfig = { workers: Worker[]; synthesize?: string };

const DEFAULT_WORKERS: Worker[] = [
  { name: "Analyst A", systemPrompt: "You are a thorough analyst. Provide a detailed analysis." },
  { name: "Analyst B", systemPrompt: "You are a critical analyst. Focus on risks and edge cases." },
];

export async function runParallel(ctx: WorkflowContext): Promise<WorkflowResult> {
  const { agent, input, runId, convex } = ctx;
  const config = parseConfig<ParallelConfig>(agent.workflowConfig, { workers: DEFAULT_WORKERS });
  const workers = config.workers?.length ? config.workers : DEFAULT_WORKERS;
  const synthesizerPrompt =
    config.synthesize ??
    "You are a synthesizer. Combine the following expert analyses into a coherent summary.";
  const model = getModel(agent.model);
  const groupId = `parallel-${Date.now()}`;

  let totalTokens = 0;

  // Run all workers in parallel
  const workerResults = await Promise.all(
    workers.map(async (worker, i) => {
      const t0 = Date.now();
      const { text, usage } = await generateText({
        model,
        system: worker.systemPrompt,
        prompt: input,
      });

      totalTokens += (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);

      await writeStep(convex, {
        runId,
        stepNumber: i + 1,
        stepName: worker.name,
        stepType: "worker",
        groupId,
        text,
        inputTokens: usage?.inputTokens,
        outputTokens: usage?.outputTokens,
        durationMs: Date.now() - t0,
        finishReason: "stop",
      });

      return { name: worker.name, output: text };
    }),
  );

  // Synthesize results
  const synthesisInput = workerResults
    .map((r) => `## ${r.name}\n${r.output}`)
    .join("\n\n");

  const t0 = Date.now();
  const { text: synthesis, usage: synthUsage } = await generateText({
    model,
    system: synthesizerPrompt,
    prompt: `Original input:\n${input}\n\nExpert analyses:\n${synthesisInput}`,
  });

  totalTokens += (synthUsage?.inputTokens ?? 0) + (synthUsage?.outputTokens ?? 0);

  await writeStep(convex, {
    runId,
    stepNumber: workers.length + 1,
    stepName: "Synthesis",
    stepType: "synthesis",
    text: synthesis,
    inputTokens: synthUsage?.inputTokens,
    outputTokens: synthUsage?.outputTokens,
    durationMs: Date.now() - t0,
    finishReason: "stop",
  });

  return { output: synthesis, totalTokens };
}
