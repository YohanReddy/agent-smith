import { NextRequest, NextResponse } from "next/server";
import { streamText, stepCountIs, type ModelMessage } from "ai";
import { ConvexHttpClient } from "convex/browser";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getEnabledTools } from "@/tools";
import { parseFullMemory, persistMemory, renderFullMemoryForPrompt } from "./memory";
import { runHitlTurn, serializeHitlState } from "./workflows/hitl";
import { getModel } from "./workflows/types";
import { runChain } from "./workflows/chain";
import { runParallel } from "./workflows/parallel";
import { runOrchestrator } from "./workflows/orchestrator";
import { runEvaluator } from "./workflows/evaluator";
import { runRouter } from "./workflows/router";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
const requestSchema = z.object({
  agentId: z.string().min(1),
  input: z.string().trim().min(1).max(20_000),
});

export async function POST(req: NextRequest) {
  const parsedBody = requestSchema.safeParse(await req.json());
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { agentId, input } = parsedBody.data;
  const apiKeys = {
    anthropic: req.headers.get("X-Anthropic-Api-Key") ?? undefined,
    openai: req.headers.get("X-OpenAI-Api-Key") ?? undefined,
  };
  const startedAt = Date.now();
  let runId: Id<"runs"> | null = null;

  try {
    const typedAgentId = agentId as Id<"agents">;
    const agent = await convex.query(api.agents.get, { id: typedAgentId });
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const workflowType = agent.workflowType ?? "standard";
    const memoryDoc = await convex.query(api.memory.get, { agentId: typedAgentId });
    const fullMemoryPrompt = agent.memoryMode === "full"
      ? renderFullMemoryForPrompt(memoryDoc?.content)
      : memoryDoc?.content ?? "(no memory yet)";

    // Resolve {{memory}} in system prompt for summary/full modes.
    let systemPrompt = agent.systemPrompt;
    if (agent.memoryMode !== "none" && systemPrompt.includes("{{memory}}")) {
      systemPrompt = systemPrompt.replace("{{memory}}", fullMemoryPrompt);
    }
    const agentWithResolvedPrompt = { ...agent, systemPrompt };

    runId = await convex.mutation(api.runs.create, {
      agentId: typedAgentId,
      agentVersion: agent.latestVersion,
      input,
    });

    const workflowInput =
      agent.memoryMode === "full" && memoryDoc?.content
        ? `Conversation history:\n${renderFullMemoryForPrompt(memoryDoc.content)}\n\nCurrent input:\n${input}`
        : input;
    const ctx = { agent: agentWithResolvedPrompt, input: workflowInput, runId, convex, startedAt, apiKeys };
    const history = agent.memoryMode === "full" ? parseFullMemory(memoryDoc?.content) : [];

    if (workflowType === "hitl") {
      const initialMessages: ModelMessage[] = [
        ...history.map((turn) =>
          turn.role === "user"
            ? { role: "user" as const, content: [{ type: "text" as const, text: turn.content }] }
            : { role: "assistant" as const, content: [{ type: "text" as const, text: turn.content }] },
        ),
        { role: "user", content: [{ type: "text" as const, text: input }] },
      ];

      try {
        const turn = await runHitlTurn({
          agent: agentWithResolvedPrompt,
          messages: initialMessages,
          convex,
          agentId,
          apiKeys,
        });

        for (let i = 0; i < turn.steps.length; i++) {
          const step = turn.steps[i];
          await convex.mutation(api.runs.addStep, {
            runId,
            stepNumber: i + 1,
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
            id: runId,
            hitlState: serializeHitlState({
              messages: turn.nextMessages,
              pendingApprovals: turn.pendingApprovals,
            }),
          });
          return NextResponse.json({ runId }, { headers: { "X-Run-Id": runId } });
        }

        await convex.mutation(api.runs.complete, {
          id: runId,
          output: turn.output,
          totalTokens: turn.totalTokens,
          durationMs: Date.now() - startedAt,
        });
        await persistMemory(convex, typedAgentId, agent.memoryMode, input, turn.output);
        return NextResponse.json({ runId }, { headers: { "X-Run-Id": runId } });
      } catch (err) {
        await convex.mutation(api.runs.fail, {
          id: runId,
          error: String(err),
          durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: String(err) }, { status: 500 });
      }
    }

    // Non-standard workflows: execute async and return run metadata.
    if (workflowType !== "standard") {
      const runWorkflow = {
        chain: runChain,
        parallel: runParallel,
        orchestrator: runOrchestrator,
        evaluator: runEvaluator,
        router: runRouter,
      }[workflowType];

      if (!runWorkflow) {
        return NextResponse.json({ error: `Unknown workflow: ${workflowType}` }, { status: 400 });
      }

      // Run async — respond immediately with runId, let Convex reactivity handle UI updates
      (async () => {
        try {
          const result = await runWorkflow(ctx);
          await convex.mutation(api.runs.complete, {
            id: runId!,
            output: result.output,
            totalTokens: result.totalTokens,
            durationMs: Date.now() - startedAt,
          });

          await persistMemory(convex, typedAgentId, agent.memoryMode, input, result.output);
        } catch (err) {
          await convex.mutation(api.runs.fail, {
            id: runId!,
            error: String(err),
            durationMs: Date.now() - startedAt,
          });
        }
      })();

      return NextResponse.json({ runId }, { headers: { "X-Run-Id": runId } });
    }

    // Standard workflow: streamText with tool loop
    let stepCounter = 0;
    let lastStepTime = Date.now();
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    const enabledTools = getEnabledTools(agent.tools, convex, agentId);
    const hasTools = Object.keys(enabledTools).length > 0;
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      ...history.map((turn) => ({ role: turn.role, content: turn.content })),
      { role: "user", content: input },
    ];

    const result = streamText({
      model: getModel(agent.model, apiKeys),
      system: systemPrompt,
      messages,
      ...(hasTools ? { tools: enabledTools } : {}),
      stopWhen: stepCountIs(agent.maxSteps),
      onStepFinish: async ({ text, toolCalls, toolResults, usage, finishReason }) => {
        const now = Date.now();
        const stepDurationMs = now - lastStepTime;
        lastStepTime = now;
        stepCounter++;

        totalInputTokens += usage?.inputTokens ?? 0;
        totalOutputTokens += usage?.outputTokens ?? 0;

        const serializedToolCalls = toolCalls?.map((tc, i) => ({
          toolName: tc.toolName,
          args: JSON.stringify((tc as { input?: unknown }).input ?? {}),
          result: JSON.stringify(
            (toolResults as Array<{ output?: unknown }> | undefined)?.[i]?.output ?? null,
          ),
        }));

        await convex.mutation(api.runs.addStep, {
          runId: runId!,
          stepNumber: stepCounter,
          stepType: "standard",
          text: text || undefined,
          toolCalls: serializedToolCalls?.length ? serializedToolCalls : undefined,
          inputTokens: usage?.inputTokens,
          outputTokens: usage?.outputTokens,
          durationMs: stepDurationMs,
          finishReason: finishReason ?? undefined,
        });
      },
      onFinish: async ({ text, usage }) => {
        const durationMs = Date.now() - startedAt;
        const totalTokens =
          (usage?.inputTokens ?? totalInputTokens) +
          (usage?.outputTokens ?? totalOutputTokens);

        await convex.mutation(api.runs.complete, {
          id: runId!,
          output: text,
          totalTokens,
          durationMs,
        });

        await persistMemory(convex, typedAgentId, agent.memoryMode, input, text);
      },
    });

    const streamResponse = result.toTextStreamResponse();
    const headers = new Headers(streamResponse.headers);
    headers.set("X-Run-Id", runId);
    return new Response(streamResponse.body, { status: streamResponse.status, headers });
  } catch (err) {
    if (runId) {
      await convex.mutation(api.runs.fail, {
        id: runId,
        error: String(err),
        durationMs: Date.now() - startedAt,
      });
    }
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
