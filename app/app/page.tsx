"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AgentList } from "../components/agent-list";
import { AgentBuilder } from "../components/agent-builder";
import { CanvasBuilder } from "../components/canvas-builder";
import { RunConsole, type RunConsoleHandle } from "../components/run-console";
import { RunHistory } from "../components/run-history";
import { ThemeToggle } from "../components/theme-toggle";
import { hasCommandModifier, isEditableTarget } from "@/lib/keyboard";

export default function Home() {
  const [selectedAgentId, setSelectedAgentId] = useState<Id<"agents"> | null>(null);
  const [builderState, setBuilderState] = useState<"new" | Id<"agents"> | null>(null);
  const [showCanvas, setShowCanvas] = useState(false);
  const [activeRunId, setActiveRunId] = useState<Id<"runs"> | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const runConsoleRef = useRef<RunConsoleHandle>(null);

  const agents = useQuery(api.agents.list);
  const selectedAgent = useQuery(api.agents.get, selectedAgentId ? { id: selectedAgentId } : "skip");
  const selectedAgentRuns = useQuery(api.runs.list, selectedAgentId ? { agentId: selectedAgentId } : "skip");

  function selectAgent(id: Id<"agents"> | null) {
    setSelectedAgentId(id);
    setActiveRunId(null);
  }

  const displayedRunId = activeRunId ?? selectedAgentRuns?.[0]?._id ?? null;
  const modKey = useMemo(() => {
    if (typeof navigator === "undefined") return "Ctrl";
    return navigator.platform.toLowerCase().includes("mac") ? "Cmd" : "Ctrl";
  }, []);

  useEffect(() => {
    function moveAgent(delta: 1 | -1) {
      if (!agents || agents.length === 0) return;
      const currentIndex = selectedAgentId ? agents.findIndex((agent) => agent._id === selectedAgentId) : -1;
      const safeIndex = currentIndex >= 0 ? currentIndex : delta === 1 ? -1 : 0;
      const nextIndex = (safeIndex + delta + agents.length) % agents.length;
      selectAgent(agents[nextIndex]._id);
    }

    function moveRun(delta: 1 | -1) {
      if (!selectedAgentRuns || selectedAgentRuns.length === 0) return;
      const currentId = displayedRunId ?? selectedAgentRuns[0]._id;
      const currentIndex = selectedAgentRuns.findIndex((run) => run._id === currentId);
      const safeIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextIndex = (safeIndex + delta + selectedAgentRuns.length) % selectedAgentRuns.length;
      setActiveRunId(selectedAgentRuns[nextIndex]._id);
    }

    function onKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      const editable = isEditableTarget(event.target);

      if (key === "escape") {
        if (builderState !== null) {
          event.preventDefault();
          setBuilderState(null);
          return;
        }
        setShowShortcuts(false);
      }

      if (hasCommandModifier(event) && event.altKey && key === "n") {
        event.preventDefault();
        setBuilderState("new");
        return;
      }

      if (hasCommandModifier(event) && key === "k") {
        event.preventDefault();
        runConsoleRef.current?.focusPrompt();
        return;
      }

      if (hasCommandModifier(event) && key === "enter") {
        event.preventDefault();
        runConsoleRef.current?.run();
        return;
      }

      if (event.code === "Slash" && hasCommandModifier(event) && !event.altKey && !editable) {
        event.preventDefault();
        setShowShortcuts((current) => !current);
        return;
      }

      if (editable || event.altKey || hasCommandModifier(event)) return;

      if (key === "j") {
        event.preventDefault();
        if (event.shiftKey) moveRun(1);
        else moveAgent(1);
        return;
      }

      if (key === "k") {
        event.preventDefault();
        if (event.shiftKey) moveRun(-1);
        else moveAgent(-1);
        return;
      }

      if (key === "v") {
        event.preventDefault();
        runConsoleRef.current?.toggleView();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [agents, builderState, displayedRunId, selectedAgentId, selectedAgentRuns]);

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
            aria-label="Show keyboard shortcuts"
            title="Keyboard shortcuts (?)"
            onClick={() => setShowShortcuts(true)}
            className="text-[11px] text-[var(--muted)] hover:text-[var(--foreground)] border border-[var(--border)] hover:border-[var(--muted)] px-2.5 py-1 rounded transition-colors font-mono"
          >
            ? shortcuts
          </button>
          <button
            type="button"
            aria-label="Build agent on canvas"
            onClick={() => setShowCanvas(true)}
            className="text-[11px] text-[var(--muted)] hover:text-[var(--foreground)] border border-[var(--border)] hover:border-[var(--muted)] px-2.5 py-1 rounded transition-colors font-mono"
          >
            ⊞ canvas
          </button>
          <button
            type="button"
            aria-label="Create new agent"
            onClick={() => setBuilderState("new")}
            title={`Create new agent (${modKey}+Alt+N)`}
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
                <RunConsole
                  ref={runConsoleRef}
                  agent={selectedAgent}
                  activeRunId={displayedRunId}
                  onRunStarted={setActiveRunId}
                />
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
              <div className="text-center space-y-4">
                <div className="text-[var(--muted)] font-mono text-xs">select an agent from the sidebar</div>
                <div className="flex items-center gap-3 justify-center">
                  <button
                    type="button"
                    onClick={() => setBuilderState("new")}
                    className="text-[11px] font-mono text-[var(--muted)] hover:text-[var(--foreground)] border border-[var(--border)] hover:border-[var(--muted)] px-3 py-1.5 rounded transition-colors"
                  >
                    + new agent
                  </button>
                  <span className="text-[var(--muted-soft)] text-[10px] font-mono">or</span>
                  <button
                    type="button"
                    onClick={() => setShowCanvas(true)}
                    className="text-[11px] font-mono text-emerald-500 hover:text-emerald-400 border border-emerald-900/50 hover:border-emerald-700 bg-emerald-950/20 px-3 py-1.5 rounded transition-colors"
                  >
                    ⊞ build on canvas
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {builderState !== null && (
        <AgentBuilder editId={builderState === "new" ? null : builderState} onClose={() => setBuilderState(null)} />
      )}

      {showCanvas && (
        <CanvasBuilder
          onSave={(agentId) => {
            setShowCanvas(false);
            selectAgent(agentId);
          }}
          onClose={() => setShowCanvas(false)}
        />
      )}

      {showShortcuts && (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
          <button
            type="button"
            aria-label="Close keyboard shortcuts"
            className="absolute inset-0 bg-black/45 backdrop-blur-sm"
            onClick={() => setShowShortcuts(false)}
          />
          <div className="relative w-full max-w-lg border border-[var(--border)] bg-[var(--panel)] rounded-lg p-4 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs uppercase tracking-widest text-[var(--muted)] font-mono">Keyboard Shortcuts</h2>
              <button
                type="button"
                onClick={() => setShowShortcuts(false)}
                className="text-[var(--muted)] hover:text-[var(--foreground)] text-lg leading-none"
              >
                ×
              </button>
            </div>
            <div className="space-y-1.5 text-[11px] font-mono">
              <ShortcutRow keyHint={`${modKey}+Alt+N`} action="new agent" />
              <ShortcutRow keyHint={`${modKey}+K`} action="focus prompt box" />
              <ShortcutRow keyHint={`${modKey}+Enter`} action="run prompt" />
              <ShortcutRow keyHint="J / K" action="next / previous agent" />
              <ShortcutRow keyHint="Shift+J / Shift+K" action="next / previous run" />
              <ShortcutRow keyHint="V" action="toggle workflow/output view" />
              <ShortcutRow keyHint={`${modKey}+/`} action="toggle this help" />
              <ShortcutRow keyHint="Esc" action="close dialogs/help" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ShortcutRow({ keyHint, action }: { keyHint: string; action: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border border-[var(--border)] rounded px-2.5 py-2">
      <span className="text-[var(--foreground)]">{action}</span>
      <span className="text-[var(--muted)]">{keyHint}</span>
    </div>
  );
}
