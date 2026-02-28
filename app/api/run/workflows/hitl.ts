import { generateText, stepCountIs, type ModelMessage, type StepResult, type ToolSet } from "ai";
import { ConvexHttpClient } from "convex/browser";
import { z } from "zod";
import { getEnabledTools } from "@/tools";
import type { AgentDoc } from "./types";
import { getModel } from "./types";

const hitlConfigSchema = z.object({
  autoApproveTools: z.array(z.string()).optional(),
});

const parsedHitlStateSchema = z.object({
  messages: z.array(z.unknown()),
  pendingApprovals: z.array(
    z.object({
      id: z.string(),
      toolCallId: z.string(),
      toolName: z.string(),
      input: z.unknown(),
      createdAt: z.number(),
    }),
  ),
});

export type HitlPendingApproval = {
  id: string;
  toolCallId: string;
  toolName: string;
  input: unknown;
  createdAt: number;
};

export type HitlState = {
  messages: ModelMessage[];
  pendingApprovals: HitlPendingApproval[];
};

export type HitlStepRecord = {
  stepName?: string;
  stepType?: string;
  text?: string;
  toolCalls?: Array<{ toolName: string; args: string; result: string }>;
  inputTokens?: number;
  outputTokens?: number;
  finishReason?: string;
};

type HitlTurnResult = {
  output: string;
  totalTokens: number;
  steps: HitlStepRecord[];
  nextMessages: ModelMessage[];
  pendingApprovals: HitlPendingApproval[];
};

function parseHitlConfig(raw: string | null | undefined) {
  if (!raw?.trim()) return { autoApproveTools: [] as string[] };
  const parsed = JSON.parse(raw) as unknown;
  const result = hitlConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid workflow config: ${result.error.issues[0]?.message ?? "schema mismatch"}`);
  }
  return { autoApproveTools: result.data.autoApproveTools ?? [] };
}

function normalizeToolOutput(raw: unknown) {
  if (raw == null) return null;
  if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
    return raw;
  }
  return raw;
}

function serializeStep(step: StepResult<ToolSet>): HitlStepRecord {
  const approvalByToolCallId = new Map<string, string>();
  for (const part of step.content) {
    if (part.type === "tool-approval-request") {
      approvalByToolCallId.set(part.toolCall.toolCallId, part.approvalId);
    }
  }

  const resultByToolCallId = new Map<string, unknown>();
  for (const result of step.toolResults) {
    resultByToolCallId.set(result.toolCallId, normalizeToolOutput(result.output));
  }

  const toolCalls = step.toolCalls.map((toolCall) => {
    const approvalId = approvalByToolCallId.get(toolCall.toolCallId);
    const output = resultByToolCallId.has(toolCall.toolCallId)
      ? resultByToolCallId.get(toolCall.toolCallId)
      : approvalId
        ? { state: "approval-requested", approvalId }
        : null;

    return {
      toolName: toolCall.toolName,
      args: JSON.stringify(toolCall.input ?? {}),
      result: JSON.stringify(output),
    };
  });

  const hasApprovalRequests = approvalByToolCallId.size > 0;
  return {
    stepName: hasApprovalRequests ? "Await Approval" : "HITL Agent",
    stepType: hasApprovalRequests ? "approval" : "standard",
    text: step.text || undefined,
    toolCalls: toolCalls.length ? toolCalls : undefined,
    inputTokens: step.usage.inputTokens,
    outputTokens: step.usage.outputTokens,
    finishReason: step.finishReason,
  };
}

function collectPendingApprovals(steps: StepResult<ToolSet>[]): HitlPendingApproval[] {
  const pending: HitlPendingApproval[] = [];
  const seen = new Set<string>();

  for (const step of steps) {
    for (const part of step.content) {
      if (part.type !== "tool-approval-request") continue;
      if (seen.has(part.approvalId)) continue;
      seen.add(part.approvalId);
      pending.push({
        id: part.approvalId,
        toolCallId: part.toolCall.toolCallId,
        toolName: part.toolCall.toolName,
        input: part.toolCall.input,
        createdAt: Date.now(),
      });
    }
  }

  return pending;
}

export function parseHitlState(raw: string | null | undefined): HitlState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    const result = parsedHitlStateSchema.safeParse(parsed);
    if (!result.success) return null;
    return {
      messages: result.data.messages as ModelMessage[],
      pendingApprovals: result.data.pendingApprovals,
    };
  } catch {
    return null;
  }
}

export function serializeHitlState(state: HitlState) {
  return JSON.stringify(state);
}

export async function runHitlTurn({
  agent,
  messages,
  convex,
  agentId,
}: {
  agent: AgentDoc;
  messages: ModelMessage[];
  convex: ConvexHttpClient;
  agentId: string;
}): Promise<HitlTurnResult> {
  const config = parseHitlConfig(agent.workflowConfig);
  const autoApproveSet = new Set(config.autoApproveTools);
  const approvalRequiredToolNames = agent.tools.filter((toolName) => !autoApproveSet.has(toolName));
  const tools = getEnabledTools(agent.tools, convex, agentId, { approvalRequiredToolNames });
  const hasTools = Object.keys(tools).length > 0;

  const result = await generateText({
    model: getModel(agent.model),
    system:
      `${agent.systemPrompt}\n\n` +
      "When a tool execution is not approved by the user, do not retry it. " +
      "Inform the user that the action was not performed.",
    messages,
    ...(hasTools ? { tools } : {}),
    stopWhen: stepCountIs(agent.maxSteps),
  });

  const typedSteps = result.steps as StepResult<ToolSet>[];
  const pendingApprovals = collectPendingApprovals(typedSteps);
  const steps = typedSteps.map(serializeStep);

  return {
    output: result.text,
    totalTokens: result.totalUsage.totalTokens ?? 0,
    steps,
    nextMessages: [...messages, ...result.response.messages],
    pendingApprovals,
  };
}
