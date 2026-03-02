/**
 * Evaluator-Optimizer workflow: generates a response, evaluates quality with structured output,
 * and iteratively improves until a passing score is reached.
 *
 * workflowConfig JSON:
 * {
 *   "maxIterations": 3,
 *   "passingScore": 8,
 *   "evaluatorSystemPrompt": "You are a strict quality evaluator. Be critical and specific."
 * }
 *
 * The agent's systemPrompt is used for generation and improvement.
 */
import { generateText, Output } from "ai";
import { z } from "zod";
import { getModel, parseConfig, writeStep, type WorkflowContext, type WorkflowResult } from "./types";

type EvaluatorConfig = {
  maxIterations?: number;
  passingScore?: number;
  evaluatorSystemPrompt?: string;
};

const evaluationSchema = z.object({
  score: z.number().min(1).max(10).describe("Overall quality score from 1-10"),
  strengths: z.array(z.string()).describe("What the response does well"),
  issues: z.array(z.string()).describe("Specific problems to fix"),
  improvementDirections: z.array(z.string()).describe("Concrete instructions for improvement"),
});
const evaluatorConfigSchema = z.object({
  maxIterations: z.number().int().min(1).max(10).optional(),
  passingScore: z.number().min(1).max(10).optional(),
  evaluatorSystemPrompt: z.string().optional(),
});

export async function runEvaluator(ctx: WorkflowContext): Promise<WorkflowResult> {
  const { agent, input, runId, convex } = ctx;
  const config = parseConfig<EvaluatorConfig>(agent.workflowConfig, evaluatorConfigSchema, {});
  const maxIterations = config.maxIterations ?? 3;
  const passingScore = config.passingScore ?? 8;
  const evaluatorSystemPrompt =
    config.evaluatorSystemPrompt ??
    "You are a rigorous quality evaluator. Score responses critically and identify specific, actionable improvements.";
  const model = getModel(agent.model, ctx.apiKeys);

  let totalTokens = 0;
  let stepNum = 0;
  let currentResponse = "";

  // Initial generation
  stepNum++;
  const t0 = Date.now();
  const { text: initial, usage: initUsage } = await generateText({
    model,
    system: agent.systemPrompt,
    prompt: input,
  });

  totalTokens += (initUsage?.inputTokens ?? 0) + (initUsage?.outputTokens ?? 0);
  currentResponse = initial;

  await writeStep(convex, {
    runId,
    stepNumber: stepNum,
    stepName: "Generate",
    stepType: "generation",
    text: initial,
    inputTokens: initUsage?.inputTokens,
    outputTokens: initUsage?.outputTokens,
    durationMs: Date.now() - t0,
    finishReason: "stop",
  });

  // Evaluation-improvement loop
  for (let i = 0; i < maxIterations; i++) {
    // Evaluate
    stepNum++;
    const te = Date.now();
    const { output: evaluation, usage: evalUsage } = await generateText({
      model,
      system: evaluatorSystemPrompt,
      output: Output.object({ schema: evaluationSchema }),
      prompt: `Evaluate this response to the request: "${input}"\n\nResponse:\n${currentResponse}`,
    });

    totalTokens += (evalUsage?.inputTokens ?? 0) + (evalUsage?.outputTokens ?? 0);

    const evalSummary = [
      `Score: ${evaluation.score}/10`,
      evaluation.strengths.length ? `✓ ${evaluation.strengths.join(", ")}` : "",
      evaluation.issues.length ? `✗ ${evaluation.issues.join("; ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    await writeStep(convex, {
      runId,
      stepNumber: stepNum,
      stepName: `Evaluate (${evaluation.score}/10)`,
      stepType: "evaluation",
      text: evalSummary,
      inputTokens: evalUsage?.inputTokens,
      outputTokens: evalUsage?.outputTokens,
      durationMs: Date.now() - te,
      finishReason: "stop",
    });

    // Pass threshold reached — stop
    if (evaluation.score >= passingScore) break;

    // Last iteration — don't improve, just stop
    if (i === maxIterations - 1) break;

    // Improve
    stepNum++;
    const ti = Date.now();
    const improvementInstructions = evaluation.improvementDirections.join("\n- ");
    const { text: improved, usage: impUsage } = await generateText({
      model,
      system: agent.systemPrompt,
      prompt: `Improve your previous response based on this feedback:\n\n${improvementInstructions}\n\nOriginal request: ${input}\n\nPrevious response:\n${currentResponse}`,
    });

    totalTokens += (impUsage?.inputTokens ?? 0) + (impUsage?.outputTokens ?? 0);
    currentResponse = improved;

    await writeStep(convex, {
      runId,
      stepNumber: stepNum,
      stepName: `Improve (iter ${i + 1})`,
      stepType: "improvement",
      text: improved,
      inputTokens: impUsage?.inputTokens,
      outputTokens: impUsage?.outputTokens,
      durationMs: Date.now() - ti,
      finishReason: "stop",
    });
  }

  return { output: currentResponse, totalTokens };
}
