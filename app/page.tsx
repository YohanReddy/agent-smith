"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AgentList } from "./components/agent-list";
import { AgentBuilder } from "./components/agent-builder";
import { RunConsole } from "./components/run-console";
import { RunHistory } from "./components/run-history";

export default function Home() {
  const [selectedAgentId, setSelectedAgentId] = useState<Id<"agents"> | null>(null);
  const [builderState, setBuilderState] = useState<"new" | Id<"agents"> | null>(null);
  const [activeRunId, setActiveRunId] = useState<Id<"runs"> | null>(null);
  const [pendingAutoOpenAgentId, setPendingAutoOpenAgentId] = useState<Id<"agents"> | null>(null);

  const selectedAgent = useQuery(api.agents.get, selectedAgentId ? { id: selectedAgentId } : "skip");
  const selectedAgentRuns = useQuery(api.runs.list, selectedAgentId ? { agentId: selectedAgentId } : "skip");

  function selectAgent(id: Id<"agents"> | null) {
    setSelectedAgentId(id);
    setActiveRunId(null);
    setPendingAutoOpenAgentId(id);
  }

  useEffect(() => {
    if (!pendingAutoOpenAgentId) return;
    if (selectedAgentId !== pendingAutoOpenAgentId) return;
    if (!selectedAgentRuns) return;

    setActiveRunId(selectedAgentRuns[0]?._id ?? null);
    setPendingAutoOpenAgentId(null);
  }, [pendingAutoOpenAgentId, selectedAgentId, selectedAgentRuns]);

  return (
    <div className="h-screen bg-[#0a0a0a] text-zinc-100 flex flex-col overflow-hidden select-none">
      <header className="border-b border-zinc-800/80 px-4 h-10 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-emerald-500 text-[11px]" aria-hidden>
            ◆
          </span>
          <span className="text-sm font-medium tracking-tight text-zinc-400 font-mono">agent-smith</span>
        </div>
        <button
          type="button"
          aria-label="Create new agent"
          onClick={() => setBuilderState("new")}
          className="text-[11px] text-zinc-600 hover:text-zinc-300 border border-zinc-800 hover:border-zinc-700 px-2.5 py-1 rounded transition-colors font-mono"
        >
          + new agent
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-52 border-r border-zinc-800/80 flex flex-col overflow-hidden shrink-0 bg-[#0c0c0c]">
          <div className="px-3 py-2 border-b border-zinc-800/80">
            <span className="text-[9px] text-zinc-700 uppercase tracking-widest font-mono">Agents</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            <AgentList selectedId={selectedAgentId} onSelect={selectAgent} onEdit={(id) => setBuilderState(id)} />
          </div>
        </aside>

        <main className="flex-1 flex flex-col overflow-hidden">
          {selectedAgent ? (
            <>
              <div className="flex-1 overflow-hidden">
                <RunConsole agent={selectedAgent} activeRunId={activeRunId} onRunStarted={setActiveRunId} />
              </div>
              <RunHistory
                agentId={selectedAgent._id}
                activeRunId={activeRunId}
                onViewRun={setActiveRunId}
                onRunDeleted={() => setActiveRunId(null)}
              />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-1.5">
                <div className="text-zinc-700 font-mono text-xs">select an agent from the sidebar</div>
                <div className="text-zinc-800 font-mono text-[10px]">or create one with + new agent</div>
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
