"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Streamdown } from "streamdown";

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

const isStandardWorkflow = (wt?: string | null) => !wt || wt === "standard";

export function RunConsole({ agent, activeRunId, onRunStarted }: Props) {
  const [input, setInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [streamedText, setStreamedText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  const steps = useQuery(api.runs.listSteps, activeRunId ? { runId: activeRunId } : "skip");
  const activeRun = useQuery(api.runs.get, activeRunId ? { id: activeRunId } : "skip");

  useEffect(() => {
    if (steps?.length || streamedText) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [steps?.length, streamedText]);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const visibleSteps = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!steps?.length || !outputRef.current) return;
    observerRef.current?.disconnect();
    visibleSteps.current.clear();

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            visibleSteps.current.add(entry.target.id);
          } else {
            visibleSteps.current.delete(entry.target.id);
          }
        });

        if (visibleSteps.current.size > 0) {
          const all = Array.from(visibleSteps.current);
          const topmost = all.reduce((best, id) => {
            const a = document.getElementById(best);
            const b = document.getElementById(id);
            if (!a || !b) return best;
            return a.getBoundingClientRect().top <= b.getBoundingClientRect().top ? best : id;
          });
          setActiveStepId(topmost);
        }
      },
      { root: outputRef.current, threshold: 0.1 },
    );

    steps.forEach((step) => {
      const element = document.getElementById(`step-${step._id}`);
      if (element) observer.observe(element);
    });

    observerRef.current = observer;
    return () => observer.disconnect();
  }, [steps]);

  const scrollToStep = useCallback((stepId: string) => {
    document.getElementById(`step-${stepId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  async function handleRun() {
    if (!input.trim() || isRunning) return;
    setIsRunning(true);
    setStreamedText("");
    setError(null);

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
      const contentType = res.headers.get("content-type") ?? "";

      if (contentType.includes("application/json")) {
        const data = (await res.json()) as { runId?: string };
        const workflowRunId = (runId ?? data.runId) as Id<"runs"> | null;
        if (workflowRunId) onRunStarted(workflowRunId);
        return;
      }

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

  const workflowLabel = useMemo(() => agent.workflowType ?? "standard", [agent.workflowType]);
  const toolSummary = useMemo(() => agent.tools.join(" · "), [agent.tools]);
  const runStatus = activeRun?.status;
  const isCompleted = runStatus === "completed";
  const isFailed = runStatus === "failed";
  const isWorkflowTerminal = runStatus === "completed" || runStatus === "failed" || runStatus === "stopped";
  const isEffectivelyRunning = isRunning && !(activeRun && isWorkflowTerminal);
  const isHistorical = !!activeRun && !isEffectivelyRunning && activeRun.status !== "running";

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-2.5 border-b border-zinc-800 flex items-center gap-2.5 shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" aria-hidden />
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
          <span className="text-[10px] text-zinc-700 font-mono ml-auto">{toolSummary}</span>
        )}
      </div>

      {steps && steps.length > 1 && (
        <div className="border-b border-zinc-800/60 px-5 py-1.5 flex gap-1.5 overflow-x-auto scrollbar-none shrink-0">
          {steps.map((step) => {
            const color = STEP_TYPE_LABEL[step.stepType ?? "standard"] ?? "text-zinc-600";
            const isActive = activeStepId === `step-${step._id}`;
            return (
              <button
                key={step._id}
                type="button"
                onClick={() => scrollToStep(String(step._id))}
                className={`shrink-0 text-[10px] font-mono px-2 py-0.5 rounded border transition-colors whitespace-nowrap ${
                  isActive
                    ? `${color} border-zinc-600 bg-zinc-800/60`
                    : "text-zinc-700 border-zinc-800/60 hover:text-zinc-400 hover:border-zinc-700"
                }`}
              >
                {step.stepName ?? `step ${step.stepNumber}`}
              </button>
            );
          })}
        </div>
      )}

      <div ref={outputRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4 font-mono">
        {(!steps || steps.length === 0) && !isEffectivelyRunning && !error && (
          <p className="text-zinc-800 text-xs">enter a prompt below and press run ↓</p>
        )}

        {isHistorical && activeRun && (
          <div className="text-[10px] text-zinc-700 border-b border-zinc-800/50 pb-2">
            viewing run · {new Date(activeRun._creationTime).toLocaleString()}
          </div>
        )}

        {steps?.map((step) => (
          <StepBlock key={step._id} id={`step-${step._id}`} step={step as Step} />
        ))}

        {isEffectivelyRunning && streamedText && (
          <div className="border-l-2 border-emerald-600/40 pl-3">
            <div className="text-[10px] text-emerald-700 mb-1.5">streaming</div>
            <Streamdown
              className="text-sm text-zinc-300 leading-relaxed"
              controls={false}
              isAnimating
              caret="block"
            >
              {streamedText}
            </Streamdown>
          </div>
        )}

        {isEffectivelyRunning && !streamedText && (
          <div className="flex items-center gap-2 text-xs text-zinc-700">
            <span className="inline-block animate-spin" aria-hidden>
              ⟳
            </span>
            <span>
              {isStandardWorkflow(agent.workflowType) ? "thinking…" : `running ${workflowLabel} workflow…`}
            </span>
          </div>
        )}

        {isCompleted && activeRun && (
          <div className="text-[10px] text-zinc-700 border-t border-zinc-800/40 pt-2 mt-1">
            ✓ completed · {fmtTok(activeRun.totalTokens ?? 0)} tok · {fmtMs(activeRun.durationMs ?? 0)}
          </div>
        )}

        {(isFailed || error) && <div className="border-l-2 border-red-900 pl-3 text-xs text-red-500">{activeRun?.error ?? error}</div>}

        <div ref={bottomRef} />
      </div>

      <div className="border-t border-zinc-800 px-5 py-4 shrink-0">
        <textarea
          className="w-full bg-zinc-900/60 border border-zinc-800 focus-visible:border-zinc-600 focus-visible:ring-2 focus-visible:ring-zinc-700 rounded text-sm text-zinc-200 placeholder-zinc-700 px-3 py-2.5 resize-none transition-colors font-sans leading-relaxed"
          rows={3}
          placeholder="Enter a prompt… (Ctrl/Cmd+Enter to run)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isEffectivelyRunning}
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px] text-zinc-700 font-mono">
            memory: {agent.memoryMode}
            {isStandardWorkflow(agent.workflowType) && ` · max ${agent.maxSteps} steps`}
          </span>
          <button
            type="button"
            onClick={handleRun}
            disabled={!input.trim() || isEffectivelyRunning}
            className="px-4 py-1.5 text-[11px] font-medium uppercase tracking-widest bg-emerald-700 hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded transition-colors"
          >
            {isEffectivelyRunning ? (
              <span className="flex items-center gap-1.5">
                <span className="animate-spin inline-block" aria-hidden>
                  ⟳
                </span>
                running
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

type ToolPreview = { toolName: string; argPreview: string; resultPreview: string };

function parsePreview(value: string, maxLength: number) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed === "string") return parsed.slice(0, maxLength);
    return JSON.stringify(parsed).slice(0, maxLength);
  } catch {
    return value.slice(0, maxLength);
  }
}

const StepBlock = memo(function StepBlock({ step, id }: { step: Step; id?: string }) {
  const tokens = (step.inputTokens ?? 0) + (step.outputTokens ?? 0);
  const hasTools = !!step.toolCalls?.length;
  const borderColor = STEP_TYPE_COLORS[step.stepType ?? "standard"] ?? "border-zinc-800";
  const labelColor = STEP_TYPE_LABEL[step.stepType ?? "standard"] ?? "text-zinc-600";

  const toolPreviews = useMemo<ToolPreview[]>(() => {
    if (!step.toolCalls?.length) return [];
    return step.toolCalls.map((toolCall) => ({
      toolName: toolCall.toolName,
      argPreview: parsePreview(toolCall.args, 120),
      resultPreview: parsePreview(toolCall.result, 600),
    }));
  }, [step.toolCalls]);

  return (
    <div id={id} className={`border-l-2 pl-3 ${hasTools ? "border-amber-800/70" : borderColor}`}>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-[10px] text-zinc-700">step {step.stepNumber}</span>
        {step.stepName && <span className={`text-[10px] font-medium ${labelColor}`}>{step.stepName}</span>}
        {step.stepType && step.stepType !== "standard" && !step.stepName && (
          <span className={`text-[10px] ${labelColor}`}>{step.stepType}</span>
        )}
        {step.durationMs != null && <span className="text-[10px] text-zinc-800">· {fmtMs(step.durationMs)}</span>}
        {tokens > 0 && <span className="text-[10px] text-zinc-800">· {fmtTok(tokens)} tok</span>}
        {step.groupId && <span className="text-[10px] text-zinc-800 ml-auto font-mono">∥ parallel</span>}
      </div>

      {toolPreviews.map((tool, index) => (
        <div key={`${tool.toolName}-${index}`} className="mb-2.5">
          <div className="text-[11px] text-amber-600 mb-1">
            ⟳ {tool.toolName}
            <span className="text-zinc-700 ml-1 font-normal">({tool.argPreview})</span>
          </div>
          <div className="pl-3 border-l border-zinc-800/80 text-[11px]">
            <span className="text-zinc-700">→ </span>
            <span className="text-zinc-500 leading-relaxed">{tool.resultPreview}</span>
          </div>
        </div>
      ))}

      {step.text && (
        <Streamdown
          mode="static"
          className="text-sm text-zinc-300 leading-relaxed"
          controls={false}
        >
          {step.text}
        </Streamdown>
      )}
    </div>
  );
});
