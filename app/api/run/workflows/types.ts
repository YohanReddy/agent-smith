import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { ConvexHttpClient } from "convex/browser";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export type AgentDoc = {
  _id: Id<"agents">;
  name: string;
  model: string;
  systemPrompt: string;
  tools: string[];
  memoryMode: string;
  maxSteps: number;
  workflowType?: string | null;
  workflowConfig?: string | null;
  latestVersion: number;
};

export interface WorkflowContext {
  agent: AgentDoc;
  input: string;
  runId: Id<"runs">;
  convex: ConvexHttpClient;
  startedAt: number;
}

export interface WorkflowResult {
  output: string;
  totalTokens: number;
}

export function getModel(modelId: string) {
  if (modelId.startsWith("claude-")) return anthropic(modelId);
  if (
    modelId.startsWith("gpt-") ||
    modelId.startsWith("o1") ||
    modelId.startsWith("o3")
  ) {
    return openai(modelId);
  }
  throw new Error(`Unknown model: ${modelId}`);
}

export type StepParams = {
  runId: Id<"runs">;
  stepNumber: number;
  stepName?: string;
  stepType?: string;
  groupId?: string;
  text?: string;
  toolCalls?: Array<{ toolName: string; args: string; result: string }>;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
  finishReason?: string;
};

export async function writeStep(convex: ConvexHttpClient, params: StepParams) {
  await convex.mutation(api.runs.addStep, params);
}

export function parseConfig<T>(
  raw: string | null | undefined,
  schema: z.ZodType<T>,
  fallback: T,
): T {
  if (!raw?.trim()) return fallback;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid workflow config JSON");
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid workflow config: ${result.error.issues[0]?.message ?? "schema mismatch"}`);
  }
  return result.data;
}
