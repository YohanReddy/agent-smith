"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

interface Props {
  agentId: Id<"agents">;
  activeRunId: Id<"runs"> | null;
  onViewRun: (runId: Id<"runs">) => void;
  onRunDeleted?: (runId: Id<"runs">) => void;
}

type RunStatus = "running" | "completed" | "failed" | "stopped";

function StatusIcon({ status }: { status: RunStatus }) {
  switch (status) {
    case "completed":
      return <span className="text-emerald-600">✓</span>;
    case "failed":
      return <span className="text-red-600">✕</span>;
    case "running":
      return <span className="animate-spin inline-block text-[var(--muted)] text-[11px]">⟳</span>;
    case "stopped":
      return <span className="text-[var(--muted)]">■</span>;
  }
}

function fmtMs(ms: number) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function fmtTok(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export function RunHistory({ agentId, activeRunId, onViewRun, onRunDeleted }: Props) {
  const runs = useQuery(api.runs.list, { agentId });
  const removeRun = useMutation(api.runs.remove);
  const [open, setOpen] = useState(true);

  async function handleDelete(e: React.MouseEvent, runId: Id<"runs">) {
    e.stopPropagation();
    await removeRun({ id: runId });
    if (runId === activeRunId) onRunDeleted?.(runId);
  }

  if (!runs || runs.length === 0) return null;

  return (
    <div className="border-t border-[var(--border)] bg-[var(--panel-muted)] shrink-0">
      <button
        type="button"
        className="w-full flex items-center justify-between px-5 py-2 text-[10px] text-[var(--muted)] hover:text-[var(--foreground)] font-mono uppercase tracking-widest transition-colors"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span>history · {runs.length} run{runs.length !== 1 ? "s" : ""}</span>
        <span className="text-[var(--muted-soft)]" aria-hidden>
          {open ? "▼" : "▲"}
        </span>
      </button>

      {open && (
        <div className="overflow-y-auto max-h-[180px]">
          {runs.map((run) => (
            <div
              key={run._id}
              role="button"
              tabIndex={0}
              onClick={() => onViewRun(run._id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onViewRun(run._id);
                }
              }}
              className={`group w-full text-left flex items-center gap-3 px-5 py-1.5 text-[11px] font-mono cursor-pointer transition-colors hover:bg-[var(--panel-soft)] ${
                run._id === activeRunId ? "bg-[var(--panel-soft)]" : ""
              }`}
            >
              <span className="w-3 shrink-0 text-center">
                <StatusIcon status={run.status as RunStatus} />
              </span>
              <span className="flex-1 text-[var(--muted-strong)] truncate min-w-0">{run.input}</span>
              {run.totalTokens != null && <span className="text-[var(--muted)] shrink-0">{fmtTok(run.totalTokens)}</span>}
              {run.durationMs != null && <span className="text-[var(--muted)] shrink-0">{fmtMs(run.durationMs)}</span>}
              <span className="text-[var(--muted-soft)] shrink-0">
                {new Date(run._creationTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
              <button
                type="button"
                onClick={(e) => handleDelete(e, run._id)}
                className="opacity-0 group-hover:opacity-100 text-[var(--muted)] hover:text-red-500 transition-all ml-1 shrink-0 leading-none"
                aria-label="Delete run"
                title="Delete run"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
