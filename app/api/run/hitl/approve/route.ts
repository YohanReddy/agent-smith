import { NextRequest, NextResponse } from "next/server";
import type { ModelMessage, ToolApprovalResponse } from "ai";
import { ConvexHttpClient } from "convex/browser";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { persistMemory } from "../../memory";
import { parseHitlState, runHitlTurn, serializeHitlState } from "../../workflows/hitl";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const requestSchema = z.object({
  runId: z.string().min(1),
  approvalId: z.string().min(1),
  approved: z.boolean(),
  reason: z.string().trim().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const parsedBody = requestSchema.safeParse(await req.json());
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { runId, approvalId, approved, reason } = parsedBody.data;
  const typedRunId = runId as Id<"runs">;
  const startedAt = Date.now();

  try {
    const run = await convex.query(api.runs.get, { id: typedRunId });
    if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });
    if (run.status !== "running") {
      return NextResponse.json({ error: "Run is not awaiting approval" }, { status: 400 });
    }

    const hitlState = parseHitlState((run as typeof run & { hitlState?: string }).hitlState);
    if (!hitlState) {
      return NextResponse.json({ error: "Run has no HITL state" }, { status: 400 });
    }

    const pending = hitlState.pendingApprovals.find((item) => item.id === approvalId);
    if (!pending) {
      return NextResponse.json({ error: "Approval request not found" }, { status: 404 });
    }

    const agent = await convex.query(api.agents.get, { id: run.agentId });
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

    const approvalPart: ToolApprovalResponse = {
      type: "tool-approval-response",
      approvalId,
      approved,
      ...(reason ? { reason } : {}),
    };

    const nextMessages: ModelMessage[] = [
      ...hitlState.messages,
      { role: "tool", content: [approvalPart] },
    ];

    const turn = await runHitlTurn({
      agent,
      messages: nextMessages,
      convex,
      agentId: String(run.agentId),
    });

    const existingSteps = await convex.query(api.runs.listSteps, { runId: typedRunId });
    let stepNumber = existingSteps.length + 1;
    for (const step of turn.steps) {
      await convex.mutation(api.runs.addStep, {
        runId: typedRunId,
        stepNumber: stepNumber++,
        stepName: step.stepName,
        stepType: step.stepType,
        text: step.text,
        toolCalls: step.toolCalls,
        inputTokens: step.inputTokens,
        outputTokens: step.outputTokens,
        finishReason: step.finishReason,
      });
    }

    if (turn.pendingApprovals.length > 0) {
      await convex.mutation(api.runs.setHitlState, {
        id: typedRunId,
        hitlState: serializeHitlState({
          messages: turn.nextMessages,
          pendingApprovals: turn.pendingApprovals,
        }),
      });
      return NextResponse.json({ runId, pendingApprovals: turn.pendingApprovals.length });
    }

    await convex.mutation(api.runs.complete, {
      id: typedRunId,
      output: turn.output,
      totalTokens: turn.totalTokens,
      durationMs: (run.durationMs ?? 0) + (Date.now() - startedAt),
    });
    await persistMemory(convex, run.agentId, agent.memoryMode, run.input, turn.output);
    return NextResponse.json({ runId, completed: true });
  } catch (err) {
    await convex.mutation(api.runs.fail, {
      id: typedRunId,
      error: String(err),
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
