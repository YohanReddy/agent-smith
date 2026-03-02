"use client";

import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Streamdown } from "streamdown";
import { WorkflowGraph } from "@/app/components/workflow-graph";
import { getStoredApiKeys } from "./api-keys-panel";

type Agent = {
  _id: Id<"agents">;
  name: string;
  model: string;
  tools: string[];
  memoryMode: string;
  maxSteps: number;
  workflowType?: string | null;
};

type HitlPendingApproval = {
  id: string;
  toolCallId: string;
  toolName: string;
  input: unknown;
  createdAt: number;
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

export interface RunConsoleHandle {
  focusPrompt: () => void;
  run: () => void;
  toggleView: () => void;
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
  response: "border-[var(--muted)]",
  evaluation: "border-yellow-800/70",
  generation: "border-[var(--muted)]",
  improvement: "border-cyan-800/70",
  approval: "border-amber-800/70",
  chain: "border-[var(--muted)]",
  standard: "border-[var(--border)]",
};

const STEP_TYPE_LABEL: Record<string, string> = {
  plan: "text-blue-600",
  worker: "text-amber-600",
  synthesis: "text-emerald-600",
  classification: "text-purple-500",
  response: "text-[var(--muted)]",
  evaluation: "text-yellow-600",
  generation: "text-[var(--muted)]",
  improvement: "text-cyan-600",
  approval: "text-amber-600",
  chain: "text-[var(--muted)]",
  standard: "text-[var(--muted)]",
};

const isLinearWorkflow = (wt?: string | null) => !wt || wt === "standard" || wt === "hitl";

function parseHitlState(raw: string | null | undefined): { pendingApprovals: HitlPendingApproval[] } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { pendingApprovals?: unknown };
    if (!Array.isArray(parsed.pendingApprovals)) return null;
    const pendingApprovals = parsed.pendingApprovals.filter((item): item is HitlPendingApproval => {
      if (!item || typeof item !== "object") return false;
      const value = item as Record<string, unknown>;
      return (
        typeof value.id === "string" &&
        typeof value.toolCallId === "string" &&
        typeof value.toolName === "string" &&
        typeof value.createdAt === "number"
      );
    });
    return { pendingApprovals };
  } catch {
    return null;
  }
}

export const RunConsole = forwardRef<RunConsoleHandle, Props>(function RunConsole(
  { agent, activeRunId, onRunStarted }: Props,
  ref,
) {
  const [input, setInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [streamedText, setStreamedText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [canScrollToTop, setCanScrollToTop] = useState(false);
  const [approvalInFlightId, setApprovalInFlightId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<"output" | "workflow">(
    isLinearWorkflow(agent.workflowType) ? "output" : "workflow",
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  const handleRun = useCallback(async () => {
    if (!input.trim() || isRunning) return;
    if (!isLinearWorkflow(agent.workflowType)) setActiveView("workflow");
    setIsRunning(true);
    setStreamedText("");
    setError(null);

    try {
      const { anthropic: anthropicKey, openai: openaiKey } = getStoredApiKeys();
      const res = await fetch("/api/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(anthropicKey ? { "X-Anthropic-Api-Key": anthropicKey } : {}),
          ...(openaiKey ? { "X-OpenAI-Api-Key": openaiKey } : {}),
        },
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
  }, [agent._id, agent.workflowType, input, isRunning, onRunStarted]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleRun();
  }

  const workflowLabel = useMemo(() => agent.workflowType ?? "standard", [agent.workflowType]);
  const toolSummary = useMemo(() => agent.tools.join(" · "), [agent.tools]);
  const runStatus = activeRun?.status;
  const hitlState = useMemo(
    () => parseHitlState((activeRun as (typeof activeRun & { hitlState?: string }) | undefined)?.hitlState),
    [activeRun],
  );
  const pendingApprovals = hitlState?.pendingApprovals ?? [];
  const isHitlWorkflow = agent.workflowType === "hitl";
  const isCompleted = runStatus === "completed";
  const isFailed = runStatus === "failed";
  const isWorkflowTerminal = runStatus === "completed" || runStatus === "failed" || runStatus === "stopped";
  const isEffectivelyRunning = isRunning && !(activeRun && isWorkflowTerminal);
  const isHistorical = !!activeRun && !isEffectivelyRunning && activeRun.status !== "running";
  const hasChatOpen = Boolean(activeRunId || (steps && steps.length > 0) || streamedText);
  const shouldShowViewSwitcher = !isLinearWorkflow(agent.workflowType) && hasChatOpen;

  useImperativeHandle(
    ref,
    () => ({
      focusPrompt: () => {
        inputRef.current?.focus();
      },
      run: () => {
        void handleRun();
      },
      toggleView: () => {
        if (shouldShowViewSwitcher) {
          setActiveView((view) => (view === "workflow" ? "output" : "workflow"));
        }
      },
    }),
    [handleRun, shouldShowViewSwitcher],
  );

  async function handleHitlApproval(approvalId: string, approved: boolean) {
    if (!activeRunId || approvalInFlightId) return;
    setApprovalInFlightId(approvalId);
    setError(null);
    try {
      const { anthropic: anthropicKey, openai: openaiKey } = getStoredApiKeys();
      const res = await fetch("/api/run/hitl/approve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(anthropicKey ? { "X-Anthropic-Api-Key": anthropicKey } : {}),
          ...(openaiKey ? { "X-OpenAI-Api-Key": openaiKey } : {}),
        },
        body: JSON.stringify({ runId: activeRunId, approvalId, approved }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Approval request failed");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setApprovalInFlightId(null);
    }
  }

  function handleOutputScroll(e: React.UIEvent<HTMLDivElement>) {
    setCanScrollToTop(e.currentTarget.scrollTop > 120);
  }

  function scrollToTop() {
    outputRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-2.5 border-b border-[var(--border)] flex items-center gap-2.5 shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" aria-hidden />
        <span className="text-sm font-medium text-[var(--foreground)]">{agent.name}</span>
        <span className="text-[11px] text-[var(--muted)] font-mono">{agent.model}</span>
        <span
          className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ml-1 ${
            workflowLabel === "standard"
              ? "text-[var(--muted)] border-[var(--border)]"
              : "text-blue-700 border-blue-900/50 bg-blue-950/20"
          }`}
        >
          {workflowLabel}
        </span>
        {isLinearWorkflow(agent.workflowType) && agent.tools.length > 0 && (
          <span className="text-[10px] text-[var(--muted)] font-mono ml-auto">{toolSummary}</span>
        )}
      </div>

      {steps && steps.length > 1 && (
        <div className="border-b border-[var(--border)] px-5 py-1.5 flex gap-1.5 overflow-x-auto scrollbar-none shrink-0">
          {steps.map((step) => {
            const color = STEP_TYPE_LABEL[step.stepType ?? "standard"] ?? "text-[var(--muted)]";
            const isActive = activeStepId === `step-${step._id}`;
            return (
              <button
                key={step._id}
                type="button"
                onClick={() => scrollToStep(String(step._id))}
                className={`shrink-0 text-[10px] font-mono px-2 py-0.5 rounded border transition-colors whitespace-nowrap ${
                  isActive
                    ? `${color} border-[var(--muted)] bg-[var(--panel-soft)]`
                    : "text-[var(--muted)] border-[var(--border)] hover:text-[var(--foreground)] hover:border-[var(--muted)]"
                }`}
              >
                {step.stepName ?? `step ${step.stepNumber}`}
              </button>
            );
          })}
        </div>
      )}
      {shouldShowViewSwitcher && (
        <div className="border-b border-[var(--border)] px-5 py-2 flex items-center justify-between shrink-0">
          <span className="text-[10px] text-[var(--muted)] uppercase tracking-widest font-mono">View</span>
          <div className="inline-flex border border-[var(--border)] rounded overflow-hidden">
            <button
              type="button"
              onClick={() => setActiveView("workflow")}
              className={`px-2.5 py-1 text-[10px] font-mono transition-colors ${
                activeView === "workflow"
                  ? "bg-[var(--panel-soft)] text-[var(--foreground)]"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              workflow
            </button>
            <button
              type="button"
              onClick={() => setActiveView("output")}
              className={`px-2.5 py-1 text-[10px] font-mono border-l border-[var(--border)] transition-colors ${
                activeView === "output"
                  ? "bg-[var(--panel-soft)] text-[var(--foreground)]"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              output
            </button>
          </div>
        </div>
      )}

      {!isLinearWorkflow(agent.workflowType) && activeView === "workflow" ? (
        <div className="flex-1 p-5">
          {steps && steps.length > 0 ? (
            <WorkflowGraph steps={steps as Step[]} status={runStatus} className="h-full min-h-[360px]" />
          ) : (
            <div className="h-full border border-[var(--border)] rounded-lg bg-[var(--panel)] flex items-center justify-center">
              <p className="text-xs text-[var(--muted)] font-mono">workflow map will appear once steps start</p>
            </div>
          )}
        </div>
      ) : (
        <div ref={outputRef} onScroll={handleOutputScroll} className="relative flex-1 overflow-y-auto px-5 py-4 space-y-4 font-mono">
        {(!steps || steps.length === 0) && !isEffectivelyRunning && !error && (
          <p className="text-[var(--muted-soft)] text-xs">enter a prompt below and press run ↓</p>
        )}

        {isHistorical && activeRun && (
          <div className="text-[10px] text-[var(--muted)] border-b border-[var(--border)] pb-2">
            viewing run · {new Date(activeRun._creationTime).toLocaleString()}
          </div>
        )}

        {isHitlWorkflow && pendingApprovals.length > 0 && (
          <div className="border border-amber-900/40 bg-amber-950/20 rounded p-3 space-y-2">
            <div className="text-[10px] text-amber-600 uppercase tracking-widest font-mono">approval required</div>
            {pendingApprovals.map((approval) => (
              <div key={approval.id} className="border-l-2 border-amber-700/60 pl-3 py-1">
                <div className="text-xs text-[var(--muted-strong)] mb-1">
                  <span className="text-amber-600 font-mono">{approval.toolName}</span>{" "}
                  <span className="text-[var(--muted)]">({parsePreview(JSON.stringify(approval.input ?? {}), 140)})</span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleHitlApproval(approval.id, true)}
                    disabled={!!approvalInFlightId}
                    className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider rounded border border-emerald-700/60 text-emerald-500 hover:bg-emerald-950/30 disabled:opacity-60"
                  >
                    approve
                  </button>
                  <button
                    type="button"
                    onClick={() => handleHitlApproval(approval.id, false)}
                    disabled={!!approvalInFlightId}
                    className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider rounded border border-red-900/60 text-red-500 hover:bg-red-950/30 disabled:opacity-60"
                  >
                    deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {steps?.map((step) => (
          <StepBlock key={step._id} id={`step-${step._id}`} step={step as Step} />
        ))}

        {isEffectivelyRunning && streamedText && (
          <div className="border-l-2 border-emerald-600/40 pl-3">
            <div className="text-[10px] text-emerald-700 mb-1.5">streaming</div>
            <Streamdown
              className="streamdown-console text-sm leading-relaxed"
              controls={false}
              isAnimating
              caret="block"
            >
              {streamedText}
            </Streamdown>
          </div>
        )}

        {isEffectivelyRunning && !streamedText && (
          <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <span className="inline-block animate-spin" aria-hidden>
              ⟳
            </span>
            <span>
              {isLinearWorkflow(agent.workflowType) ? "thinking…" : `running ${workflowLabel} workflow…`}
            </span>
          </div>
        )}

        {isCompleted && activeRun && (
          <div className="text-[10px] text-[var(--muted)] border-t border-[var(--border)] pt-2 mt-1">
            ✓ completed · {fmtTok(activeRun.totalTokens ?? 0)} tok · {fmtMs(activeRun.durationMs ?? 0)}
          </div>
        )}

        {(isFailed || error) && <div className="border-l-2 border-red-900 pl-3 text-xs text-red-500">{activeRun?.error ?? error}</div>}

        {hasChatOpen && canScrollToTop && (
          <button
            type="button"
            onClick={scrollToTop}
            className="sticky bottom-2 ml-auto block text-[10px] font-mono text-[var(--muted)] hover:text-[var(--foreground)] border border-[var(--border)] hover:border-[var(--muted)] px-2 py-1 rounded bg-[var(--panel)]/90 transition-colors"
            aria-label="Go to top"
            title="Go to top"
          >
            ↑ top
          </button>
        )}

        <div ref={bottomRef} />
      </div>
      )}

      <div className="border-t border-[var(--border)] px-5 py-4 shrink-0">
        <textarea
          ref={inputRef}
          className="w-full bg-[var(--panel-soft)] border border-[var(--border)] focus-visible:border-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--muted)]/40 rounded text-sm text-[var(--foreground)] placeholder-[var(--muted)] px-3 py-2.5 resize-none transition-colors font-sans leading-relaxed"
          rows={3}
          placeholder="Enter a prompt… (Ctrl/Cmd+Enter to run)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isEffectivelyRunning}
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px] text-[var(--muted)] font-mono">
            memory: {agent.memoryMode}
            {isLinearWorkflow(agent.workflowType) && ` · max ${agent.maxSteps} steps`}
          </span>
          <button
            type="button"
            onClick={handleRun}
            disabled={!input.trim() || isEffectivelyRunning}
            title="Run prompt (Ctrl/Cmd+Enter)"
            className="px-4 py-1.5 text-[11px] font-medium uppercase tracking-widest bg-emerald-700 hover:bg-emerald-600 disabled:bg-[var(--panel-soft)] disabled:text-[var(--muted)] text-white rounded transition-colors"
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
});

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
  const borderColor = STEP_TYPE_COLORS[step.stepType ?? "standard"] ?? "border-[var(--border)]";
  const labelColor = STEP_TYPE_LABEL[step.stepType ?? "standard"] ?? "text-[var(--muted)]";

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
        <span className="text-[10px] text-[var(--muted)]">step {step.stepNumber}</span>
        {step.stepName && <span className={`text-[10px] font-medium ${labelColor}`}>{step.stepName}</span>}
        {step.stepType && step.stepType !== "standard" && !step.stepName && (
          <span className={`text-[10px] ${labelColor}`}>{step.stepType}</span>
        )}
        {step.durationMs != null && <span className="text-[10px] text-[var(--muted-soft)]">· {fmtMs(step.durationMs)}</span>}
        {tokens > 0 && <span className="text-[10px] text-[var(--muted-soft)]">· {fmtTok(tokens)} tok</span>}
        {step.groupId && <span className="text-[10px] text-[var(--muted-soft)] ml-auto font-mono">∥ parallel</span>}
      </div>

      {toolPreviews.map((tool, index) => (
        <div key={`${tool.toolName}-${index}`} className="mb-2.5">
          <div className="text-[11px] text-amber-600 mb-1">
            ⟳ {tool.toolName}
            <span className="text-[var(--muted)] ml-1 font-normal">({tool.argPreview})</span>
          </div>
          <div className="pl-3 border-l border-[var(--border)] text-[11px]">
            <span className="text-[var(--muted)]">→ </span>
            <span className="text-[var(--muted-strong)] leading-relaxed">{tool.resultPreview}</span>
          </div>
        </div>
      ))}

      {step.text && (
        <Streamdown
          mode="static"
          className="streamdown-console text-sm leading-relaxed"
          controls={false}
        >
          {step.text}
        </Streamdown>
      )}
    </div>
  );
});
