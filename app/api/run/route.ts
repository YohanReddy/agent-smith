import { NextRequest, NextResponse } from "next/server";
import { streamText, stepCountIs } from "ai";
import { ConvexHttpClient } from "convex/browser";
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

export async function POST(req: NextRequest) {
  const { agentId, input } = (await req.json()) as { agentId: string; input: string };
  const startedAt = Date.now();
  let runId: Id<"runs"> | null = null;

  try {
    const agent = await convex.query(api.agents.get, { id: agentId as Id<"agents"> });
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Resolve {{memory}} in system prompt
    let systemPrompt = agent.systemPrompt;
    if (agent.memoryMode !== "none" && systemPrompt.includes("{{memory}}")) {
      const memory = await convex.query(api.memory.get, { agentId: agentId as Id<"agents"> });
      systemPrompt = systemPrompt.replace("{{memory}}", memory?.content ?? "(no memory yet)");
    }
    const agentWithResolvedPrompt = { ...agent, systemPrompt };

    runId = await convex.mutation(api.runs.create, {
      agentId: agentId as Id<"agents">,
      agentVersion: agent.latestVersion,
      input,
    });

    const workflowType = agent.workflowType ?? "standard";
    const ctx = { agent: agentWithResolvedPrompt, input, runId, convex, startedAt };

    // Non-standard workflows: run synchronously, return JSON
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

          if (agent.memoryMode === "summary" && result.output) {
            const existing = await convex.query(api.memory.get, {
              agentId: agentId as Id<"agents">,
            });
            const entry = `[${new Date().toISOString()}]\nInput: ${input.slice(0, 200)}\nOutput: ${result.output.slice(0, 500)}`;
            await convex.mutation(api.memory.set, {
              agentId: agentId as Id<"agents">,
              content: existing?.content ? `${existing.content}\n\n---\n${entry}` : entry,
            });
          }
        } catch (err) {
          await convex.mutation(api.runs.fail, {
            id: runId!,
            error: String(err),
            durationMs: Date.now() - startedAt,
          });
        }
      })();

      return NextResponse.json({ runId });
    }

    // Standard workflow: streamText with tool loop
    let stepCounter = 0;
    let lastStepTime = Date.now();
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    const enabledTools = getEnabledTools(agent.tools, convex, agentId);
    const hasTools = Object.keys(enabledTools).length > 0;

    const result = streamText({
      model: getModel(agent.model),
      system: systemPrompt,
      messages: [{ role: "user", content: input }],
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

        if (agent.memoryMode === "summary" && text) {
          const existing = await convex.query(api.memory.get, {
            agentId: agentId as Id<"agents">,
          });
          const entry = `[${new Date().toISOString()}]\nInput: ${input.slice(0, 200)}\nOutput: ${text.slice(0, 500)}`;
          await convex.mutation(api.memory.set, {
            agentId: agentId as Id<"agents">,
            content: existing?.content ? `${existing.content}\n\n---\n${entry}` : entry,
          });
        }
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
