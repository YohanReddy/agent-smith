"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

interface Props {
  selectedId: Id<"agents"> | null;
  onSelect: (id: Id<"agents"> | null) => void;
  onEdit: (id: Id<"agents">) => void;
}

export function AgentList({ selectedId, onSelect, onEdit }: Props) {
  const agents = useQuery(api.agents.list);
  const remove = useMutation(api.agents.remove);

  if (!agents) {
    return <div className="px-4 py-3 text-[var(--muted)] text-xs font-mono">loading…</div>;
  }

  if (agents.length === 0) {
    return (
      <div className="px-4 py-8 text-[var(--muted)] text-xs font-mono text-center leading-loose">
        no agents yet
      </div>
    );
  }

  return (
    <div className="py-1">
      {agents.map((agent) => {
        const isSelected = agent._id === selectedId;
        return (
          <div
            key={agent._id}
            role="button"
            tabIndex={0}
            className={`group relative block w-full text-left cursor-pointer transition-all border-l-2 ${
              isSelected
                ? "border-emerald-500 bg-[var(--panel-soft)]"
                : "border-transparent hover:border-[var(--muted)] hover:bg-[var(--panel-soft)]/60"
            }`}
            onClick={() => onSelect(agent._id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(agent._id);
              }
            }}
          >
            <div className="px-3 py-2.5 pr-16">
              <div
                className={`text-sm font-medium leading-none mb-1 truncate ${
                  isSelected ? "text-[var(--foreground)]" : "text-[var(--muted)]"
                }`}
              >
                {agent.name}
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[10px] text-[var(--muted)] font-mono truncate">{agent.model}</span>
                <span
                  className={`text-[9px] font-mono px-1 py-px rounded border shrink-0 ${
                    agent.workflowType && agent.workflowType !== "standard"
                      ? "text-blue-700 border-blue-900/50 bg-blue-950/20"
                      : "text-[var(--muted)] border-[var(--border)] bg-[var(--panel-soft)]"
                  }`}
                >
                  {agent.workflowType ?? "standard"}
                </span>
              </div>
            </div>

            <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex gap-1">
              <button
                type="button"
                aria-label={`Edit agent ${agent.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(agent._id);
                }}
                className="text-[10px] text-[var(--muted)] hover:text-[var(--foreground)] px-1.5 py-0.5 bg-[var(--panel-soft)] border border-[var(--border)] rounded transition-colors"
              >
                edit
              </button>
              <button
                type="button"
                aria-label={`Delete agent ${agent.name}`}
                onClick={async (e) => {
                  e.stopPropagation();
                  if (confirm(`Delete "${agent.name}"?`)) {
                    await remove({ id: agent._id });
                    if (isSelected) onSelect(null);
                  }
                }}
                className="text-[10px] text-red-600 hover:text-red-500 px-1.5 py-0.5 bg-[var(--panel-soft)] border border-[var(--border)] rounded transition-colors"
              >
                ×
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
