import { NextRequest, NextResponse } from "next/server";
import { streamText, stepCountIs } from "ai";
import { ConvexHttpClient } from "convex/browser";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getEnabledTools } from "@/tools";
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
const fullMemoryTurnSchema = z.array(
  z.object({
    role: z.union([z.literal("user"), z.literal("assistant")]),
    content: z.string(),
  }),
);
const FULL_MEMORY_TURN_LIMIT = 40;
const SUMMARY_MEMORY_MAX_CHARS = 30_000;
type ConversationTurn = { role: "user" | "assistant"; content: string };

function parseFullMemory(raw: string | undefined): ConversationTurn[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    const result = fullMemoryTurnSchema.safeParse(parsed);
    return result.success ? result.data : [];
  } catch {
    return [];
  }
}

function formatSummaryMemory(existing: string | undefined, input: string, output: string) {
  const entry = `[${new Date().toISOString()}]\nInput: ${input.slice(0, 200)}\nOutput: ${output.slice(0, 500)}`;
  const next = existing ? `${existing}\n\n---\n${entry}` : entry;
  return next.slice(-SUMMARY_MEMORY_MAX_CHARS);
}

function formatFullMemory(existing: string | undefined, input: string, output: string) {
  const turns = parseFullMemory(existing);
  const nextTurns = [...turns, { role: "user" as const, content: input }, { role: "assistant" as const, content: output }]
    .slice(-FULL_MEMORY_TURN_LIMIT);
  return JSON.stringify(nextTurns);
}

async function persistMemory(
  agentId: Id<"agents">,
  mode: "none" | "summary" | "full",
  input: string,
  output: string,
) {
  if (!output || mode === "none") return;
  const existing = await convex.query(api.memory.get, { agentId });
  const content =
    mode === "full"
      ? formatFullMemory(existing?.content, input, output)
      : formatSummaryMemory(existing?.content, input, output);
  await convex.mutation(api.memory.set, { agentId, content });
}

function renderFullMemoryForPrompt(raw: string | undefined) {
  const turns = parseFullMemory(raw);
  if (!turns.length) return "(no memory yet)";
  return turns
    .map((turn) => `${turn.role === "user" ? "User" : "Assistant"}: ${turn.content}`)
    .join("\n\n");
}

export async function POST(req: NextRequest) {
  const parsedBody = requestSchema.safeParse(await req.json());
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { agentId, input } = parsedBody.data;
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
    const ctx = { agent: agentWithResolvedPrompt, input: workflowInput, runId, convex, startedAt };

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

          await persistMemory(typedAgentId, agent.memoryMode, input, result.output);
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
    const history = agent.memoryMode === "full" ? parseFullMemory(memoryDoc?.content) : [];
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      ...history.map((turn) => ({ role: turn.role, content: turn.content })),
      { role: "user", content: input },
    ];

    const result = streamText({
      model: getModel(agent.model),
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

        await persistMemory(typedAgentId, agent.memoryMode, input, text);
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
