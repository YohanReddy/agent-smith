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
    return <div className="px-4 py-3 text-zinc-700 text-xs font-mono">loading…</div>;
  }

  if (agents.length === 0) {
    return (
      <div className="px-4 py-8 text-zinc-700 text-xs font-mono text-center leading-loose">
        no agents yet
      </div>
    );
  }

  return (
    <div className="py-1">
      {agents.map((agent) => {
        const isSelected = agent._id === selectedId;
        return (
          <button
            key={agent._id}
            type="button"
            className={`group relative block w-full text-left cursor-pointer transition-all border-l-2 ${
              isSelected
                ? "border-emerald-500 bg-zinc-900"
                : "border-transparent hover:border-zinc-700 hover:bg-zinc-900/40"
            }`}
            onClick={() => onSelect(agent._id)}
          >
            <div className="px-3 py-2.5 pr-16">
              <div
                className={`text-sm font-medium leading-none mb-1 truncate ${
                  isSelected ? "text-zinc-100" : "text-zinc-400"
                }`}
              >
                {agent.name}
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[10px] text-zinc-700 font-mono truncate">{agent.model}</span>
                {agent.workflowType && agent.workflowType !== "standard" && (
                  <span className="text-[9px] font-mono px-1 py-px rounded border text-blue-700 border-blue-900/50 bg-blue-950/20 shrink-0">
                    {agent.workflowType}
                  </span>
                )}
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
                className="text-[10px] text-zinc-500 hover:text-zinc-200 px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded transition-colors"
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
                className="text-[10px] text-red-600 hover:text-red-400 px-1.5 py-0.5 bg-zinc-800 border border-zinc-800 rounded transition-colors"
              >
                ×
              </button>
            </div>
          </button>
        );
      })}
    </div>
  );
}
