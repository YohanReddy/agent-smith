"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import {
  ReactFlowProvider,
  useReactFlow,
  useNodesState,
  ReactFlow,
  Background,
  Controls,
  ConnectionLineType,
  type Node,
  type Edge,
  type NodeProps,
  type NodeTypes,
  type EdgeTypes,
  Handle,
  Position,
} from "@xyflow/react";
import { nanoid } from "nanoid";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Edge as FlowEdge } from "./ai-elements/edge";
import { AVAILABLE_TOOLS } from "@/tools/registry";

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const MODELS = [
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6", provider: "Anthropic" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", provider: "Anthropic" },
  { id: "claude-opus-4-6", label: "Opus 4.6", provider: "Anthropic" },
  { id: "gpt-4o", label: "GPT-4o", provider: "OpenAI" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini", provider: "OpenAI" },
];

const WORKFLOW_LABELS: Record<string, string> = {
  standard: "Standard",
  chain: "Chain",
  parallel: "Parallel",
  router: "Router",
  orchestrator: "Orchestrator",
  evaluator: "Evaluator",
  hitl: "Human-in-Loop",
};

const STEP_X_GAP = 260;
const WORKER_Y_GAP = 160;

// Approximate rendered heights — used to vertically center workflow nodes
// with the agent node rather than aligning by top edge
const AGENT_NODE_HEIGHT = 156;
const STEP_NODE_HEIGHT = 88;
const CLASSIFIER_NODE_HEIGHT = 72;

// ─────────────────────────────────────────────────────────────────────────────
// NODE DATA TYPES
// ─────────────────────────────────────────────────────────────────────────────

type AgentNodeData = {
  kind: "agent";
  name: string;
  description: string;
  systemPrompt: string;
  model: string;
  memoryMode: "none" | "summary" | "full";
  tools: string[];
  maxSteps: number;
  workflowType: string;
};

type StepNodeData = {
  kind: "step" | "worker";
  label: string;
  systemPrompt: string;
  deletable: boolean;
};

type SynthNodeData = {
  kind: "synthesize";
  label: string;
  systemPrompt: string;
  deletable: boolean;
};

type ClassifierNodeData = {
  kind: "classifier";
  label: string;
  systemPrompt: string;
  deletable: boolean;
};

type RouteNodeData = {
  kind: "route";
  label: string;
  systemPrompt: string;
  deletable: boolean;
  routeType: string;
  routeDescription: string;
};

type AnchorNodeData = { kind: "anchor-start" | "anchor-end"; label: string };

type CBNodeData =
  | AgentNodeData
  | StepNodeData
  | SynthNodeData
  | ClassifierNodeData
  | RouteNodeData
  | AnchorNodeData;

type CBNode = Node<CBNodeData, string>;
type CBEdge = Edge;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function uid() {
  return nanoid(8);
}

function defaultAgentData(): AgentNodeData {
  return {
    kind: "agent",
    name: "",
    description: "",
    systemPrompt: "You are a helpful assistant.",
    model: "claude-sonnet-4-6",
    memoryMode: "none",
    tools: [],
    maxSteps: 10,
    workflowType: "standard",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// INITIAL NODE SETS PER WORKFLOW TYPE
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function workflowNodes(type: string, agentX: number, agentY: number): any[] {
  const offsetX = agentX + 340;
  // Vertical center of the agent node — workflow nodes are centered relative to this
  const cY = agentY + AGENT_NODE_HEIGHT / 2;

  if (type === "chain") {
    const y = cY - STEP_NODE_HEIGHT / 2;
    return [
      { id: `step-${uid()}`, type: "cbStepNode", position: { x: offsetX, y }, data: { kind: "step", label: "Step 1", systemPrompt: "", deletable: true } },
      { id: `step-${uid()}`, type: "cbStepNode", position: { x: offsetX + STEP_X_GAP, y }, data: { kind: "step", label: "Step 2", systemPrompt: "", deletable: true } },
    ];
  }
  if (type === "parallel") {
    const workerAY = cY - WORKER_Y_GAP / 2 - STEP_NODE_HEIGHT / 2;
    const workerBY = cY + WORKER_Y_GAP / 2 - STEP_NODE_HEIGHT / 2;
    const synthY = cY - STEP_NODE_HEIGHT / 2;
    return [
      { id: `worker-${uid()}`, type: "cbStepNode", position: { x: offsetX, y: workerAY }, data: { kind: "worker", label: "Worker A", systemPrompt: "", deletable: true } },
      { id: `worker-${uid()}`, type: "cbStepNode", position: { x: offsetX, y: workerBY }, data: { kind: "worker", label: "Worker B", systemPrompt: "", deletable: true } },
      { id: "synthesize", type: "cbSynthNode", position: { x: offsetX + STEP_X_GAP, y: synthY }, data: { kind: "synthesize", label: "Synthesize", systemPrompt: "", deletable: false }, draggable: false },
    ];
  }
  if (type === "router") {
    const classifierY = cY - CLASSIFIER_NODE_HEIGHT / 2;
    const routeAY = cY - WORKER_Y_GAP / 2 - STEP_NODE_HEIGHT / 2;
    const routeBY = cY + WORKER_Y_GAP / 2 - STEP_NODE_HEIGHT / 2;
    return [
      { id: "classifier", type: "cbClassifierNode", position: { x: offsetX, y: classifierY }, data: { kind: "classifier", label: "Classify", systemPrompt: "", deletable: false }, draggable: false },
      { id: `route-${uid()}`, type: "cbRouteNode", position: { x: offsetX + STEP_X_GAP, y: routeAY }, data: { kind: "route", label: "route-a", systemPrompt: "", routeType: "route-a", routeDescription: "", deletable: true } },
      { id: `route-${uid()}`, type: "cbRouteNode", position: { x: offsetX + STEP_X_GAP, y: routeBY }, data: { kind: "route", label: "route-b", systemPrompt: "", routeType: "route-b", routeDescription: "", deletable: true } },
    ];
  }
  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// EDGE BUILDERS (derived)
// ─────────────────────────────────────────────────────────────────────────────

function ae(id: string, source: string, target: string): CBEdge {
  return { id, source, target, type: "animated" };
}

function buildEdges(nodes: CBNode[], workflowType: string): CBEdge[] {
  const agentNode = nodes.find((n) => n.data.kind === "agent");
  if (!agentNode) return [];

  if (workflowType === "chain") {
    const steps = nodes
      .filter((n) => n.data.kind === "step")
      .sort((a, b) => a.position.x - b.position.x);
    if (!steps.length) return [];
    const edges: CBEdge[] = [ae(`e-agent-${steps[0].id}`, agentNode.id, steps[0].id)];
    steps.slice(0, -1).forEach((s, i) => {
      edges.push(ae(`e-${s.id}-${steps[i + 1].id}`, s.id, steps[i + 1].id));
    });
    return edges;
  }

  if (workflowType === "parallel") {
    const workers = nodes.filter((n) => n.data.kind === "worker");
    const synth = nodes.find((n) => n.data.kind === "synthesize");
    const edges: CBEdge[] = [];
    workers.forEach((w) => {
      edges.push(ae(`e-agent-${w.id}`, agentNode.id, w.id));
      if (synth) edges.push(ae(`e-${w.id}-synth`, w.id, synth.id));
    });
    return edges;
  }

  if (workflowType === "router") {
    const classifier = nodes.find((n) => n.data.kind === "classifier");
    const routes = nodes.filter((n) => n.data.kind === "route");
    if (!classifier) return [];
    return [
      ae(`e-agent-classifier`, agentNode.id, classifier.id),
      ...routes.map((r) => ae(`e-classifier-${r.id}`, classifier.id, r.id)),
    ];
  }

  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// SERIALIZER
// ─────────────────────────────────────────────────────────────────────────────

function buildAgentPayload(nodes: CBNode[]) {
  const agentNode = nodes.find((n) => n.data.kind === "agent");
  if (!agentNode) return null;
  const ad = agentNode.data as AgentNodeData;

  let workflowConfig: string | undefined;
  const wt = ad.workflowType;

  if (wt === "chain") {
    const steps = nodes
      .filter((n) => n.data.kind === "step")
      .sort((a, b) => a.position.x - b.position.x)
      .map((n) => {
        const d = n.data as StepNodeData;
        return { name: d.label, systemPrompt: d.systemPrompt };
      });
    if (steps.length) workflowConfig = JSON.stringify({ steps }, null, 2);
  } else if (wt === "parallel") {
    const workers = nodes
      .filter((n) => n.data.kind === "worker")
      .sort((a, b) => a.position.y - b.position.y)
      .map((n) => {
        const d = n.data as StepNodeData;
        return { name: d.label, systemPrompt: d.systemPrompt };
      });
    const synthesize =
      (nodes.find((n) => n.data.kind === "synthesize")?.data as SynthNodeData | undefined)
        ?.systemPrompt ?? "";
    if (workers.length) workflowConfig = JSON.stringify({ workers, synthesize }, null, 2);
  } else if (wt === "router") {
    const routes = nodes
      .filter((n) => n.data.kind === "route")
      .sort((a, b) => a.position.y - b.position.y)
      .map((n) => {
        const d = n.data as RouteNodeData;
        return { type: d.routeType || d.label, description: d.routeDescription, systemPrompt: d.systemPrompt };
      });
    if (routes.length) workflowConfig = JSON.stringify({ routes }, null, 2);
  }

  return {
    name: ad.name.trim() || "Untitled Agent",
    description: ad.description,
    systemPrompt: ad.systemPrompt,
    model: ad.model,
    memoryMode: ad.memoryMode,
    tools: ad.tools,
    maxSteps: ad.maxSteps,
    workflowType: wt as "standard" | "hitl" | "chain" | "parallel" | "orchestrator" | "evaluator" | "router",
    workflowConfig,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENT CONFIG NODE
// ─────────────────────────────────────────────────────────────────────────────

function AgentConfigNode({ data, selected }: NodeProps<CBNode>) {
  const d = data as AgentNodeData;
  const wfLabel = WORKFLOW_LABELS[d.workflowType] ?? d.workflowType;
  const toolCount = d.tools.length;
  const hasName = d.name.trim().length > 0;

  return (
    <div
      className={`relative w-72 rounded-xl border-2 bg-[var(--panel)] shadow-2xl transition-all duration-150 ${
        selected ? "border-emerald-500 shadow-emerald-900/40" : "border-[var(--border)] hover:border-emerald-700/60"
      }`}
    >
      {/* source handle for workflow connections */}
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-emerald-600 !bg-emerald-700"
      />

      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-emerald-500 text-xs">◆</span>
          <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--muted)]">Agent</span>
        </div>
        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-emerald-900/50 bg-emerald-950/40 text-emerald-400">
          {wfLabel}
        </span>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-2">
        {hasName ? (
          <p className="text-sm font-semibold text-[var(--foreground)] truncate">{d.name}</p>
        ) : (
          <p className="text-sm text-[var(--muted-soft)] italic">Unnamed agent</p>
        )}
        {d.description ? (
          <p className="text-[11px] text-[var(--muted)] line-clamp-2 leading-relaxed">{d.description}</p>
        ) : null}
        <p className="text-[10px] text-[var(--muted-soft)] font-mono line-clamp-1">
          {d.systemPrompt}
        </p>
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-[var(--border)] flex items-center justify-between">
        <span className="text-[10px] font-mono text-[var(--muted)]">
          {MODELS.find((m) => m.id === d.model)?.label ?? d.model}
        </span>
        <div className="flex items-center gap-2">
          {toolCount > 0 && (
            <span className="text-[9px] font-mono text-[var(--muted)] bg-[var(--panel-soft)] px-1.5 py-0.5 rounded border border-[var(--border)]">
              {toolCount} tool{toolCount !== 1 ? "s" : ""}
            </span>
          )}
          <span className="text-[9px] font-mono text-[var(--muted)] bg-[var(--panel-soft)] px-1.5 py-0.5 rounded border border-[var(--border)]">
            {d.memoryMode}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WORKFLOW NODE (step / worker)
// ─────────────────────────────────────────────────────────────────────────────

function CBStepNode({ data, selected }: NodeProps<CBNode>) {
  const d = data as StepNodeData;
  const isWorker = d.kind === "worker";
  const accent = isWorker ? "bg-amber-500" : "bg-blue-500";
  const ring = selected
    ? isWorker ? "border-amber-500" : "border-blue-500"
    : "border-[var(--border)] hover:border-[var(--muted)]";
  const preview = d.systemPrompt
    ? d.systemPrompt.slice(0, 80) + (d.systemPrompt.length > 80 ? "…" : "")
    : "No prompt set";

  return (
    <div className={`relative w-52 rounded-lg border bg-[var(--panel-soft)] shadow-lg transition-all duration-150 ${ring}`}>
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-[var(--border)] !bg-[var(--foreground)]" />
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className={`w-2 h-2 rounded-full shrink-0 ${accent}`} />
          <span className="text-xs font-semibold text-[var(--foreground)] truncate">{d.label || "Unnamed"}</span>
        </div>
        <p className="text-[10px] text-[var(--muted)] leading-relaxed line-clamp-2 font-mono">{preview}</p>
      </div>
      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-[var(--border)] !bg-[var(--foreground)]" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SYNTHESIZE NODE
// ─────────────────────────────────────────────────────────────────────────────

function CBSynthNode({ data, selected }: NodeProps<CBNode>) {
  const d = data as SynthNodeData;
  const preview = d.systemPrompt ? d.systemPrompt.slice(0, 80) + (d.systemPrompt.length > 80 ? "…" : "") : "No prompt set";
  return (
    <div className={`relative w-52 rounded-lg border bg-[var(--panel-soft)] shadow-lg transition-all duration-150 ${selected ? "border-emerald-500" : "border-[var(--border)] hover:border-[var(--muted)]"}`}>
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-[var(--border)] !bg-[var(--foreground)]" />
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="w-2 h-2 rounded-full shrink-0 bg-emerald-500" />
          <span className="text-xs font-semibold text-emerald-400">{d.label}</span>
        </div>
        <p className="text-[10px] text-[var(--muted)] leading-relaxed line-clamp-2 font-mono">{preview}</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CLASSIFIER NODE
// ─────────────────────────────────────────────────────────────────────────────

function CBClassifierNode({ data, selected }: NodeProps<CBNode>) {
  const d = data as ClassifierNodeData;
  return (
    <div className={`relative w-44 rounded-lg border bg-[var(--panel-soft)] shadow-lg transition-all duration-150 ${selected ? "border-purple-500" : "border-[var(--border)] hover:border-[var(--muted)]"}`}>
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-[var(--border)] !bg-[var(--foreground)]" />
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="w-2 h-2 rounded-full shrink-0 bg-purple-500" />
          <span className="text-xs font-semibold text-purple-400">{d.label}</span>
        </div>
        <p className="text-[10px] text-[var(--muted)]">Routes to handlers</p>
      </div>
      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-[var(--border)] !bg-[var(--foreground)]" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE NODE
// ─────────────────────────────────────────────────────────────────────────────

function CBRouteNode({ data, selected }: NodeProps<CBNode>) {
  const d = data as RouteNodeData;
  return (
    <div className={`relative w-52 rounded-lg border bg-[var(--panel-soft)] shadow-lg transition-all duration-150 ${selected ? "border-purple-500" : "border-[var(--border)] hover:border-[var(--muted)]"}`}>
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-[var(--border)] !bg-[var(--foreground)]" />
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="w-2 h-2 rounded-full shrink-0 bg-purple-500" />
          <span className="text-xs font-semibold text-[var(--foreground)] truncate">{d.routeType || d.label}</span>
        </div>
        {d.routeDescription && (
          <p className="text-[10px] text-[var(--muted)] truncate mb-1">{d.routeDescription}</p>
        )}
        {d.systemPrompt ? (
          <p className="text-[10px] text-[var(--muted)] font-mono line-clamp-1">{d.systemPrompt.slice(0, 55)}…</p>
        ) : (
          <p className="text-[10px] text-[var(--muted-soft)] italic">No prompt set</p>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NODE & EDGE TYPE REGISTRIES
// ─────────────────────────────────────────────────────────────────────────────

const NODE_TYPES: NodeTypes = {
  cbAgentNode: AgentConfigNode as unknown as NodeTypes[string],
  cbStepNode: CBStepNode as unknown as NodeTypes[string],
  cbSynthNode: CBSynthNode as unknown as NodeTypes[string],
  cbClassifierNode: CBClassifierNode as unknown as NodeTypes[string],
  cbRouteNode: CBRouteNode as unknown as NodeTypes[string],
};

const EDGE_TYPES: EdgeTypes = {
  animated: FlowEdge.Animated,
  temporary: FlowEdge.Temporary,
};

// ─────────────────────────────────────────────────────────────────────────────
// INSPECTOR PANEL
// ─────────────────────────────────────────────────────────────────────────────

function Inspector({
  node,
  onChange,
  onDelete,
  onWorkflowTypeChange,
}: {
  node: CBNode;
  onChange: (id: string, changes: Partial<CBNodeData>) => void;
  onDelete: (id: string) => void;
  onWorkflowTypeChange: (type: string) => void;
}) {
  const kind = node.data.kind;

  function field(label: string, el: React.ReactNode) {
    return (
      <div>
        <label className="block text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-1.5">
          {label}
        </label>
        {el}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] shrink-0">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${
            kind === "agent" ? "bg-emerald-500"
            : kind === "step" ? "bg-blue-500"
            : kind === "worker" ? "bg-amber-500"
            : kind === "synthesize" ? "bg-emerald-500"
            : "bg-purple-500"
          }`} />
          <span className="text-xs font-semibold text-[var(--foreground)] capitalize">{kind}</span>
        </div>
        {(node.data as { deletable?: boolean }).deletable && (
          <button
            type="button"
            onClick={() => onDelete(node.id)}
            className="text-[10px] text-red-500/60 hover:text-red-400 transition-colors font-mono"
          >
            delete
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ── AGENT NODE ── */}
        {kind === "agent" && (() => {
          const d = node.data as AgentNodeData;
          return (
            <>
              {field("Name",
                <input
                  className="input w-full text-sm"
                  value={d.name}
                  onChange={(e) => onChange(node.id, { name: e.target.value } as Partial<AgentNodeData>)}
                  placeholder="Research Agent"
                  autoFocus
                />
              )}
              {field("Description",
                <input
                  className="input w-full text-sm"
                  value={d.description}
                  onChange={(e) => onChange(node.id, { description: e.target.value } as Partial<AgentNodeData>)}
                  placeholder="What does this agent do?"
                />
              )}
              {field("Workflow Type",
                <select
                  className="input w-full text-sm bg-[var(--panel-muted)]"
                  value={d.workflowType}
                  onChange={(e) => onWorkflowTypeChange(e.target.value)}
                >
                  {Object.entries(WORKFLOW_LABELS).map(([id, label]) => (
                    <option key={id} value={id}>{label}</option>
                  ))}
                </select>
              )}
              {field("System Prompt",
                <textarea
                  className="input w-full h-28 resize-none font-mono text-[11px] leading-relaxed"
                  value={d.systemPrompt}
                  onChange={(e) => onChange(node.id, { systemPrompt: e.target.value } as Partial<AgentNodeData>)}
                  placeholder="You are a helpful assistant."
                />
              )}
              {field("Model",
                <select
                  className="input w-full text-sm bg-[var(--panel-muted)]"
                  value={d.model}
                  onChange={(e) => onChange(node.id, { model: e.target.value } as Partial<AgentNodeData>)}
                >
                  {MODELS.map((m) => (
                    <option key={m.id} value={m.id}>{m.label} — {m.provider}</option>
                  ))}
                </select>
              )}
              {(d.workflowType === "standard" || d.workflowType === "hitl") && field("Tools",
                <div className="space-y-2">
                  {AVAILABLE_TOOLS.map((t) => (
                    <label key={t.name} className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-0.5 accent-emerald-500 shrink-0"
                        checked={d.tools.includes(t.name)}
                        onChange={(e) => {
                          const tools = e.target.checked
                            ? [...d.tools, t.name]
                            : d.tools.filter((x) => x !== t.name);
                          onChange(node.id, { tools } as Partial<AgentNodeData>);
                        }}
                      />
                      <div>
                        <span className="text-xs font-mono text-[var(--foreground)]">{t.name}</span>
                        <p className="text-[10px] text-[var(--muted)]">{t.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {(d.workflowType === "standard" || d.workflowType === "hitl") && field("Max Steps",
                  <input
                    type="number"
                    min={1}
                    max={50}
                    className="input w-full"
                    value={d.maxSteps}
                    onChange={(e) => onChange(node.id, { maxSteps: Math.max(1, Math.min(50, parseInt(e.target.value) || 10)) } as Partial<AgentNodeData>)}
                  />
                )}
                {field("Memory",
                  <select
                    className="input w-full text-sm bg-[var(--panel-muted)]"
                    value={d.memoryMode}
                    onChange={(e) => onChange(node.id, { memoryMode: e.target.value as "none" | "summary" | "full" } as Partial<AgentNodeData>)}
                  >
                    <option value="none">None</option>
                    <option value="summary">Summary</option>
                    <option value="full">Full</option>
                  </select>
                )}
              </div>
            </>
          );
        })()}

        {/* ── STEP / WORKER ── */}
        {(kind === "step" || kind === "worker") && (() => {
          const d = node.data as StepNodeData;
          return (
            <>
              {field("Name",
                <input
                  className="input w-full text-sm"
                  value={d.label}
                  onChange={(e) => onChange(node.id, { label: e.target.value } as Partial<StepNodeData>)}
                  placeholder="Step name"
                />
              )}
              {field("System Prompt",
                <textarea
                  className="input w-full h-40 resize-none font-mono text-[11px] leading-relaxed"
                  value={d.systemPrompt}
                  onChange={(e) => onChange(node.id, { systemPrompt: e.target.value } as Partial<StepNodeData>)}
                  placeholder="You are an expert..."
                />
              )}
            </>
          );
        })()}

        {/* ── SYNTHESIZE ── */}
        {kind === "synthesize" && (() => {
          const d = node.data as SynthNodeData;
          return field("Synthesis Prompt",
            <textarea
              className="input w-full h-40 resize-none font-mono text-[11px] leading-relaxed"
              value={d.systemPrompt}
              onChange={(e) => onChange(node.id, { systemPrompt: e.target.value } as Partial<SynthNodeData>)}
              placeholder="You are a coordinator. Synthesize all analyses..."
            />
          );
        })()}

        {/* ── CLASSIFIER ── */}
        {kind === "classifier" && (
          <p className="text-[11px] text-[var(--muted)] leading-relaxed py-4">
            The classifier analyses the input and routes it to the best matching handler. It uses the route descriptions to decide.
          </p>
        )}

        {/* ── ROUTE ── */}
        {kind === "route" && (() => {
          const d = node.data as RouteNodeData;
          return (
            <>
              {field("Route Type",
                <input
                  className="input w-full text-sm font-mono"
                  value={d.routeType}
                  onChange={(e) => onChange(node.id, { routeType: e.target.value, label: e.target.value } as Partial<RouteNodeData>)}
                  placeholder="technical"
                />
              )}
              {field("Description",
                <input
                  className="input w-full text-sm"
                  value={d.routeDescription}
                  onChange={(e) => onChange(node.id, { routeDescription: e.target.value } as Partial<RouteNodeData>)}
                  placeholder="When to use this route"
                />
              )}
              {field("System Prompt",
                <textarea
                  className="input w-full h-36 resize-none font-mono text-[11px] leading-relaxed"
                  value={d.systemPrompt}
                  onChange={(e) => onChange(node.id, { systemPrompt: e.target.value } as Partial<RouteNodeData>)}
                  placeholder="You are an expert in..."
                />
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PALETTE
// ─────────────────────────────────────────────────────────────────────────────

const PALETTE_NODES: Record<string, Array<{ kind: string; label: string; desc: string; color: string; nodeType: string }>> = {
  standard: [],
  hitl: [],
  chain: [{ kind: "step", label: "Chain Step", desc: "Sequential execution step", color: "bg-blue-500", nodeType: "cbStepNode" }],
  parallel: [{ kind: "worker", label: "Worker", desc: "Parallel analysis worker", color: "bg-amber-500", nodeType: "cbStepNode" }],
  router: [{ kind: "route", label: "Route Handler", desc: "Handles a specific route", color: "bg-purple-500", nodeType: "cbRouteNode" }],
  orchestrator: [],
  evaluator: [],
};

function Palette({ workflowType }: { workflowType: string }) {
  const items = PALETTE_NODES[workflowType] ?? [];
  const isEmpty = items.length === 0;

  return (
    <aside className="w-52 border-r border-[var(--border)] flex flex-col p-4 gap-5 shrink-0">
      <div>
        <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-3">Blocks</p>
        {isEmpty ? (
          <p className="text-[10px] text-[var(--muted-soft)] leading-relaxed">
            {workflowType === "standard" || workflowType === "hitl"
              ? "Standard workflow — configure tools on the Agent node."
              : "Select a workflow type on the Agent node to unlock blocks."}
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.kind}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(
                    "application/cb-node",
                    JSON.stringify({ kind: item.kind, nodeType: item.nodeType }),
                  );
                  e.dataTransfer.effectAllowed = "move";
                }}
                className="flex items-center gap-2.5 p-2.5 rounded border border-dashed border-[var(--border)] hover:border-[var(--muted)] hover:bg-[var(--panel-soft)] cursor-grab active:cursor-grabbing transition-all duration-100 select-none"
              >
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${item.color}`} />
                <div>
                  <p className="text-xs font-medium text-[var(--foreground)] leading-none mb-0.5">{item.label}</p>
                  <p className="text-[10px] text-[var(--muted)]">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-[var(--border)] pt-4">
        <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-2">Tips</p>
        <ul className="space-y-1.5">
          {[
            "Click the agent node to configure",
            "Drag blocks onto the canvas",
            "Click any block to edit",
          ].map((tip) => (
            <li key={tip} className="flex items-start gap-1.5">
              <span className="text-[var(--muted-soft)] mt-px shrink-0">·</span>
              <span className="text-[10px] text-[var(--muted)] leading-relaxed">{tip}</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INNER CANVAS (needs useReactFlow)
// ─────────────────────────────────────────────────────────────────────────────

const AGENT_NODE_ID = "agent-root";

function CanvasBuilderInner({
  onSave,
  onClose,
}: {
  onSave: (agentId: Id<"agents">) => void;
  onClose: () => void;
}) {
  const { screenToFlowPosition } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<CBNode>([]);
  const [selectedId, setSelectedId] = useState<string>(AGENT_NODE_ID);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const createAgent = useMutation(api.agents.create);

  // Place the agent config node on mount
  useEffect(() => {
    const agentNode: CBNode = {
      id: AGENT_NODE_ID,
      type: "cbAgentNode",
      position: { x: 80, y: 160 },
      data: defaultAgentData(),
    };
    setNodes([agentNode]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const agentNode = nodes.find((n) => n.id === AGENT_NODE_ID);
  const workflowType = (agentNode?.data as AgentNodeData | undefined)?.workflowType ?? "standard";

  // Edges derived from nodes + workflow type
  const edges = useMemo(
    () => buildEdges(nodes, workflowType),
    [nodes, workflowType],
  );

  // Drop from palette
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const raw = event.dataTransfer.getData("application/cb-node");
      if (!raw) return;
      const { kind, nodeType } = JSON.parse(raw) as { kind: string; nodeType: string };
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });

      let newNode: CBNode;
      if (kind === "step") {
        newNode = { id: `step-${uid()}`, type: nodeType, position, data: { kind: "step", label: "New Step", systemPrompt: "", deletable: true } };
      } else if (kind === "worker") {
        newNode = { id: `worker-${uid()}`, type: nodeType, position, data: { kind: "worker", label: "New Worker", systemPrompt: "", deletable: true } };
      } else {
        newNode = { id: `route-${uid()}`, type: nodeType, position, data: { kind: "route", label: "new-route", systemPrompt: "", routeType: "new-route", routeDescription: "", deletable: true } };
      }
      setNodes((prev) => [...prev, newNode]);
      setSelectedId(newNode.id);
    },
    [screenToFlowPosition, setNodes],
  );

  // Update a node's data
  function updateNode(id: string, changes: Partial<CBNodeData>) {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === id ? ({ ...n, data: { ...n.data, ...changes } as CBNodeData }) : n,
      ) as CBNode[],
    );
  }

  // Delete a node
  function deleteNode(id: string) {
    if (id === AGENT_NODE_ID) return;
    setNodes((prev) => prev.filter((n) => n.id !== id));
    setSelectedId(AGENT_NODE_ID);
  }

  // Change workflow type on agent node — reset workflow nodes
  function handleWorkflowTypeChange(type: string) {
    const agPos = nodes.find((n) => n.id === AGENT_NODE_ID)?.position ?? { x: 80, y: 160 };
    const agentOnlyNodes = nodes
      .filter((n) => n.data.kind === "agent")
      .map((n) =>
        n.id === AGENT_NODE_ID
          ? ({ ...n, data: { ...n.data, workflowType: type } } as CBNode)
          : n,
      );
    const freshWfNodes = workflowNodes(type, agPos.x, agPos.y);
    const next = ([...agentOnlyNodes, ...freshWfNodes] as unknown) as CBNode[];
    setNodes(next);
  }

  // Save to Convex
  async function handleSave() {
    const payload = buildAgentPayload(nodes);
    if (!payload) return;
    setSaving(true);
    setSaveError(null);
    try {
      const id = await createAgent(payload);
      onSave(id);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;
  const agentName = (agentNode?.data as AgentNodeData | undefined)?.name?.trim();

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--background)]">
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-5 h-12 border-b border-[var(--border)] shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--muted)] hover:text-[var(--foreground)] text-sm transition-colors"
          >
            ← Back
          </button>
          <span className="text-[var(--border)] select-none">|</span>
          <span className="text-emerald-500 text-[11px]">◆</span>
          <h2 className="text-sm font-medium text-[var(--foreground)]">
            {agentName ? agentName : <span className="text-[var(--muted)] italic">New Agent</span>}
          </h2>
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-emerald-900/50 bg-emerald-950/40 text-emerald-400 capitalize">
            {WORKFLOW_LABELS[workflowType] ?? workflowType}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {saveError && (
            <span className="text-[10px] text-red-400 font-mono mr-2">{saveError}</span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)] border border-[var(--border)] rounded transition-colors"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 text-xs text-white bg-emerald-700 hover:bg-emerald-600 disabled:bg-[var(--panel-soft)] disabled:text-[var(--muted)] rounded transition-colors font-medium"
          >
            {saving ? "Saving…" : "Save Agent"}
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left palette */}
        <Palette workflowType={workflowType} />

        {/* Canvas */}
        <div
          className="flex-1 h-full"
          onDrop={onDrop}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            onNodesChange={onNodesChange}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            onPaneClick={() => setSelectedId(AGENT_NODE_ID)}
            connectionLineType={ConnectionLineType.Bezier}
            proOptions={{ hideAttribution: true }}
            fitView
            fitViewOptions={{ padding: 0.4 }}
            minZoom={0.2}
            maxZoom={2}
          >
            <Background gap={22} size={1} color="var(--border)" />
            <Controls
              className="!border-[var(--border)] !bg-[var(--panel)] !shadow-none"
              showInteractive={false}
            />
          </ReactFlow>
        </div>

        {/* Right inspector */}
        <aside className="w-76 border-l border-[var(--border)] flex flex-col shrink-0 overflow-hidden" style={{ width: "304px" }}>
          {selectedNode ? (
            <Inspector
              node={selectedNode}
              onChange={updateNode}
              onDelete={deleteNode}
              onWorkflowTypeChange={handleWorkflowTypeChange}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
              <div className="w-10 h-10 rounded-full border border-[var(--border)] flex items-center justify-center">
                <span className="text-[var(--muted)] text-base">↖</span>
              </div>
              <p className="text-[11px] text-[var(--muted)] leading-relaxed">
                Click a node to configure it
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC EXPORT
// ─────────────────────────────────────────────────────────────────────────────

interface CanvasBuilderProps {
  onSave: (agentId: Id<"agents">) => void;
  onClose: () => void;
}

export function CanvasBuilder({ onSave, onClose }: CanvasBuilderProps) {
  return (
    <ReactFlowProvider>
      <CanvasBuilderInner onSave={onSave} onClose={onClose} />
    </ReactFlowProvider>
  );
}
