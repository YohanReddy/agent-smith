"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AgentList } from "./components/agent-list";
import { AgentBuilder } from "./components/agent-builder";
import { RunConsole } from "./components/run-console";
import { RunHistory } from "./components/run-history";
import { ThemeToggle } from "./components/theme-toggle";

export default function Home() {
  const [selectedAgentId, setSelectedAgentId] = useState<Id<"agents"> | null>(null);
  const [builderState, setBuilderState] = useState<"new" | Id<"agents"> | null>(null);
  const [activeRunId, setActiveRunId] = useState<Id<"runs"> | null>(null);

  const selectedAgent = useQuery(api.agents.get, selectedAgentId ? { id: selectedAgentId } : "skip");
  const selectedAgentRuns = useQuery(api.runs.list, selectedAgentId ? { agentId: selectedAgentId } : "skip");

  function selectAgent(id: Id<"agents"> | null) {
    setSelectedAgentId(id);
    setActiveRunId(null);
  }
  const displayedRunId = activeRunId ?? selectedAgentRuns?.[0]?._id ?? null;

  return (
    <div className="h-screen bg-[var(--background)] text-[var(--foreground)] flex flex-col overflow-hidden select-none">
      <header className="border-b border-[var(--border)] px-4 h-10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-emerald-500 text-[11px]" aria-hidden>
            ◆
          </span>
          <span className="text-sm font-medium tracking-tight text-[var(--muted)] font-mono">agent-smith</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            aria-label="Create new agent"
            onClick={() => setBuilderState("new")}
            className="text-[11px] text-[var(--muted)] hover:text-[var(--foreground)] border border-[var(--border)] hover:border-[var(--muted)] px-2.5 py-1 rounded transition-colors font-mono"
          >
            + new agent
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-52 border-r border-[var(--border)] flex flex-col overflow-hidden shrink-0 bg-[var(--panel)]">
          <div className="px-3 py-2 border-b border-[var(--border)]">
            <span className="text-[9px] text-[var(--muted)] uppercase tracking-widest font-mono">Agents</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            <AgentList selectedId={selectedAgentId} onSelect={selectAgent} onEdit={(id) => setBuilderState(id)} />
          </div>
        </aside>

        <main className="flex-1 flex flex-col overflow-hidden">
          {selectedAgent ? (
            <>
              <div className="flex-1 overflow-hidden">
                <RunConsole agent={selectedAgent} activeRunId={displayedRunId} onRunStarted={setActiveRunId} />
              </div>
              <RunHistory
                agentId={selectedAgent._id}
                activeRunId={displayedRunId}
                onViewRun={setActiveRunId}
                onRunDeleted={() => setActiveRunId(null)}
              />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-1.5">
                <div className="text-[var(--muted)] font-mono text-xs">select an agent from the sidebar</div>
                <div className="text-[var(--muted-soft)] font-mono text-[10px]">or create one with + new agent</div>
              </div>
            </div>
          )}
        </main>
      </div>

      {builderState !== null && (
        <AgentBuilder editId={builderState === "new" ? null : builderState} onClose={() => setBuilderState(null)} />
      )}
    </div>
  );
}
