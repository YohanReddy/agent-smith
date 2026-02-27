"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type Agent = {
  _id: Id<"agents">;
  name: string;
  model: string;
  tools: string[];
  memoryMode: string;
  maxSteps: number;
  workflowType?: string | null;
};

type Step = {
  _id: Id<"steps">;
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

interface Props {
  agent: Agent;
  activeRunId: Id<"runs"> | null;
  onRunStarted: (runId: Id<"runs">) => void;
}

function fmtMs(ms: number) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function fmtTok(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

// Step type → border color
const STEP_TYPE_COLORS: Record<string, string> = {
  plan: "border-blue-800/70",
  worker: "border-amber-800/70",
  synthesis: "border-emerald-800/70",
  classification: "border-purple-800/70",
  response: "border-zinc-700",
  evaluation: "border-yellow-800/70",
  generation: "border-zinc-700",
  improvement: "border-cyan-800/70",
  chain: "border-zinc-700",
  standard: "border-zinc-800",
};

// Step type → label color
const STEP_TYPE_LABEL: Record<string, string> = {
  plan: "text-blue-600",
  worker: "text-amber-600",
  synthesis: "text-emerald-600",
  classification: "text-purple-500",
  response: "text-zinc-500",
  evaluation: "text-yellow-600",
  generation: "text-zinc-500",
  improvement: "text-cyan-600",
  chain: "text-zinc-500",
  standard: "text-zinc-600",
};

const isStandardWorkflow = (wt?: string | null) =>
  !wt || wt === "standard";

export function RunConsole({ agent, activeRunId, onRunStarted }: Props) {
  const [input, setInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [streamedText, setStreamedText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevStepsLen = useRef(0);

  const steps = useQuery(api.runs.listSteps, activeRunId ? { runId: activeRunId } : "skip");
  const activeRun = useQuery(api.runs.get, activeRunId ? { id: activeRunId } : "skip");

  // Clear streamed text when a new step appears in Convex
  useEffect(() => {
    if (steps && steps.length > prevStepsLen.current) {
      prevStepsLen.current = steps.length;
      setStreamedText("");
    }
  }, [steps?.length]);

  useEffect(() => {
    if (steps?.length || streamedText) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [steps?.length, streamedText]);

  // Poll for run completion when using workflow (non-streaming)
  useEffect(() => {
    if (!isRunning) return;
    if (activeRun?.status === "completed" || activeRun?.status === "failed") {
      setIsRunning(false);
    }
  }, [activeRun?.status, isRunning]);

  async function handleRun() {
    if (!input.trim() || isRunning) return;
    setIsRunning(true);
    setStreamedText("");
    setError(null);
    prevStepsLen.current = 0;

    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: agent._id, input }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Request failed");
        setIsRunning(false);
        return;
      }

      const runId = res.headers.get("X-Run-Id") as Id<"runs"> | null;

      // Workflow agents return JSON { runId } — completion tracked via Convex
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const data = (await res.json()) as { runId?: string };
        const rid = (runId ?? data.runId) as Id<"runs"> | null;
        if (rid) onRunStarted(rid);
        // isRunning will be cleared when activeRun.status changes (see useEffect above)
        return;
      }

      // Standard agent — plain text stream
      if (runId) onRunStarted(runId);
      if (res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          if (chunk) setStreamedText((prev) => prev + chunk);
        }
      }
      setIsRunning(false);
      setStreamedText("");
    } catch (e) {
      setError(String(e));
      setIsRunning(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleRun();
  }

  const runStatus = activeRun?.status;
  const isCompleted = runStatus === "completed";
  const isFailed = runStatus === "failed";
  const isHistorical = activeRun && !isRunning && activeRun.status !== "running";
  const workflowLabel = agent.workflowType ?? "standard";

  return (
    <div className="flex flex-col h-full">
      {/* Agent header bar */}
      <div className="px-5 py-2.5 border-b border-zinc-800 flex items-center gap-2.5 shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
        <span className="text-sm font-medium text-zinc-200">{agent.name}</span>
        <span className="text-[11px] text-zinc-600 font-mono">{agent.model}</span>
        <span
          className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ml-1 ${
            workflowLabel === "standard"
              ? "text-zinc-700 border-zinc-800"
              : "text-blue-700 border-blue-900/50 bg-blue-950/20"
          }`}
        >
          {workflowLabel}
        </span>
        {isStandardWorkflow(agent.workflowType) && agent.tools.length > 0 && (
          <span className="text-[10px] text-zinc-700 font-mono ml-auto">
            {agent.tools.join(" · ")}
          </span>
        )}
      </div>

      {/* Output area */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 font-mono">
        {(!steps || steps.length === 0) && !isRunning && !error && (
          <p className="text-zinc-800 text-xs">enter a prompt below and press run ↓</p>
        )}

        {isHistorical && activeRun && (
          <div className="text-[10px] text-zinc-700 border-b border-zinc-800/50 pb-2">
            viewing run · {new Date(activeRun._creationTime).toLocaleString()}
          </div>
        )}

        {/* Completed steps */}
        {steps?.map((step) => (
          <StepBlock key={step._id} step={step as Step} />
        ))}

        {/* Live streaming text (standard workflow only) */}
        {isRunning && streamedText && (
          <div className="border-l-2 border-emerald-600/40 pl-3">
            <div className="text-[10px] text-emerald-700 mb-1.5">streaming</div>
            <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
              {streamedText}
              <span className="animate-pulse text-emerald-500 ml-px">▋</span>
            </p>
          </div>
        )}

        {/* Thinking / processing indicator */}
        {isRunning && !streamedText && (
          <div className="flex items-center gap-2 text-xs text-zinc-700">
            <span className="inline-block animate-spin">⟳</span>
            <span>
              {isStandardWorkflow(agent.workflowType) ? "thinking..." : `running ${workflowLabel} workflow...`}
            </span>
          </div>
        )}

        {/* Run summary */}
        {isCompleted && activeRun && (
          <div className="text-[10px] text-zinc-700 border-t border-zinc-800/40 pt-2 mt-1">
            ✓ completed · {fmtTok(activeRun.totalTokens ?? 0)} tok ·{" "}
            {fmtMs(activeRun.durationMs ?? 0)}
          </div>
        )}

        {(isFailed || error) && (
          <div className="border-l-2 border-red-900 pl-3 text-xs text-red-500">
            {activeRun?.error ?? error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-zinc-800 px-5 py-4 shrink-0">
        <textarea
          className="w-full bg-zinc-900/60 border border-zinc-800 focus:border-zinc-600 rounded text-sm text-zinc-200 placeholder-zinc-700 px-3 py-2.5 resize-none outline-none transition-colors font-sans leading-relaxed"
          rows={3}
          placeholder="Enter a prompt… (⌘↵ to run)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isRunning}
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px] text-zinc-700 font-mono">
            memory: {agent.memoryMode}
            {isStandardWorkflow(agent.workflowType) && ` · max ${agent.maxSteps} steps`}
          </span>
          <button
            onClick={handleRun}
            disabled={!input.trim() || isRunning}
            className="px-4 py-1.5 text-[11px] font-medium uppercase tracking-widest bg-emerald-700 hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded transition-colors"
          >
            {isRunning ? (
              <span className="flex items-center gap-1.5">
                <span className="animate-spin inline-block">⟳</span> running
              </span>
            ) : (
              "▶ run"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function StepBlock({ step }: { step: Step }) {
  const tokens = (step.inputTokens ?? 0) + (step.outputTokens ?? 0);
  const hasTools = !!step.toolCalls?.length;
  const borderColor =
    STEP_TYPE_COLORS[step.stepType ?? "standard"] ?? "border-zinc-800";
  const labelColor =
    STEP_TYPE_LABEL[step.stepType ?? "standard"] ?? "text-zinc-600";

  return (
    <div className={`border-l-2 pl-3 ${hasTools ? "border-amber-800/70" : borderColor}`}>
      {/* Step meta */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-[10px] text-zinc-700">step {step.stepNumber}</span>
        {step.stepName && (
          <span className={`text-[10px] font-medium ${labelColor}`}>{step.stepName}</span>
        )}
        {step.stepType && step.stepType !== "standard" && !step.stepName && (
          <span className={`text-[10px] ${labelColor}`}>{step.stepType}</span>
        )}
        {step.durationMs != null && (
          <span className="text-[10px] text-zinc-800">· {fmtMs(step.durationMs)}</span>
        )}
        {tokens > 0 && (
          <span className="text-[10px] text-zinc-800">· {fmtTok(tokens)} tok</span>
        )}
        {step.groupId && (
          <span className="text-[10px] text-zinc-800 ml-auto font-mono">∥ parallel</span>
        )}
      </div>

      {/* Tool calls (standard workflow) */}
      {step.toolCalls?.map((tc, i) => {
        let args: unknown = tc.args;
        let result: unknown = tc.result;
        try { args = JSON.parse(tc.args); } catch {}
        try { result = JSON.parse(tc.result); } catch {}

        const argStr =
          typeof args === "object" && args !== null
            ? JSON.stringify(args).slice(0, 120)
            : String(args).slice(0, 120);
        const resultStr =
          typeof result === "string"
            ? result.slice(0, 600)
            : JSON.stringify(result).slice(0, 600);

        return (
          <div key={i} className="mb-2.5">
            <div className="text-[11px] text-amber-600 mb-1">
              ⟳ {tc.toolName}
              <span className="text-zinc-700 ml-1 font-normal">({argStr})</span>
            </div>
            <div className="pl-3 border-l border-zinc-800/80 text-[11px]">
              <span className="text-zinc-700">→ </span>
              <span className="text-zinc-500 leading-relaxed">{resultStr}</span>
            </div>
          </div>
        );
      })}

      {/* Text output */}
      {step.text && (
        <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">{step.text}</p>
      )}
    </div>
  );
}
