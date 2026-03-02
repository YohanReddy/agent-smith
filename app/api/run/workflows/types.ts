import { anthropic, createAnthropic } from "@ai-sdk/anthropic";
import { openai, createOpenAI } from "@ai-sdk/openai";
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

export interface ApiKeys {
  anthropic?: string;
  openai?: string;
}

export interface WorkflowContext {
  agent: AgentDoc;
  input: string;
  runId: Id<"runs">;
  convex: ConvexHttpClient;
  startedAt: number;
  apiKeys?: ApiKeys;
}

export interface WorkflowResult {
  output: string;
  totalTokens: number;
}

export function getModel(modelId: string, apiKeys?: ApiKeys) {
  if (modelId.startsWith("claude-")) {
    const provider = apiKeys?.anthropic ? createAnthropic({ apiKey: apiKeys.anthropic }) : anthropic;
    return provider(modelId);
  }
  if (
    modelId.startsWith("gpt-") ||
    modelId.startsWith("o1") ||
    modelId.startsWith("o3")
  ) {
    const provider = apiKeys?.openai ? createOpenAI({ apiKey: apiKeys.openai }) : openai;
    return provider(modelId);
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
