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
import { Edge as FlowEdge } from "./ai-elements/edge";
import { AVAILABLE_TOOLS } from "@/tools/registry";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type NodeKind =
  | "start"
  | "end"
  | "step"
  | "worker"
  | "synthesize"
  | "classifier"
  | "route";

type NodeData = {
  kind: NodeKind;
  label: string;
  systemPrompt: string;
  deletable: boolean;
  routeType?: string;
  routeDescription?: string;
};

type WNode = Node<NodeData, string>;
type WEdge = Edge;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function uid() {
  return nanoid(8);
}

function parseConfig(config: string): Record<string, unknown> {
  if (!config?.trim()) return {};
  try {
    return JSON.parse(config);
  } catch {
    return {};
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// NODE FACTORY HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const STEP_X_GAP = 260;
const WORKER_Y_GAP = 160;
const ROUTE_Y_GAP = 160;

function anchor(kind: "start" | "end", x: number, y: number): WNode {
  return {
    id: kind,
    type: "anchorNode",
    position: { x, y },
    data: { kind, label: kind === "start" ? "In" : "Out", systemPrompt: "", deletable: false },
    draggable: false,
  };
}

function stepNode(
  kind: "step" | "worker",
  id: string,
  label: string,
  systemPrompt: string,
  x: number,
  y: number,
): WNode {
  return {
    id,
    type: "stepNode",
    position: { x, y },
    data: { kind, label, systemPrompt, deletable: true },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// INITIAL NODE BUILDERS
// ─────────────────────────────────────────────────────────────────────────────

function buildChainNodes(config: string): WNode[] {
  const c = parseConfig(config) as {
    steps?: Array<{ name: string; systemPrompt: string }>;
  };
  const steps = c.steps?.length
    ? c.steps
    : [
        { name: "Step 1", systemPrompt: "You are an expert. Complete the assigned task." },
        { name: "Step 2", systemPrompt: "You are an editor. Refine and improve the output." },
      ];

  return [
    anchor("start", 0, 0),
    ...steps.map((s, i) =>
      stepNode("step", `step-${uid()}`, s.name, s.systemPrompt, 220 + i * STEP_X_GAP, 0),
    ),
    anchor("end", 220 + steps.length * STEP_X_GAP, 0),
  ];
}

function buildParallelNodes(config: string): WNode[] {
  const c = parseConfig(config) as {
    workers?: Array<{ name: string; systemPrompt: string }>;
    synthesize?: string;
  };
  const workers = c.workers?.length
    ? c.workers
    : [
        { name: "Worker A", systemPrompt: "You are an expert. Analyze the input thoroughly." },
        { name: "Worker B", systemPrompt: "You are a specialist. Provide a detailed review." },
      ];
  const synthesize =
    c.synthesize ?? "You are a coordinator. Synthesize all expert analyses into a clear summary.";

  const totalH = (workers.length - 1) * WORKER_Y_GAP;
  return [
    anchor("start", 0, totalH / 2),
    ...workers.map((w, i) =>
      stepNode("worker", `worker-${uid()}`, w.name, w.systemPrompt, 280, i * WORKER_Y_GAP),
    ),
    {
      id: "synthesize",
      type: "synthNode",
      position: { x: 560, y: totalH / 2 },
      data: { kind: "synthesize", label: "Synthesize", systemPrompt: synthesize, deletable: false },
      draggable: false,
    } as WNode,
    anchor("end", 840, totalH / 2),
  ];
}

function buildRouterNodes(config: string): WNode[] {
  const c = parseConfig(config) as {
    routes?: Array<{ type: string; description: string; systemPrompt: string }>;
  };
  const routes = c.routes?.length
    ? c.routes
    : [
        {
          type: "technical",
          description: "Technical or code-related questions",
          systemPrompt: "You are a technical expert. Provide precise, detailed responses.",
        },
        {
          type: "general",
          description: "General questions",
          systemPrompt: "You are a helpful assistant.",
        },
      ];

  const totalH = (routes.length - 1) * ROUTE_Y_GAP;
  return [
    anchor("start", 0, totalH / 2),
    {
      id: "classifier",
      type: "classifierNode",
      position: { x: 220, y: totalH / 2 },
      data: { kind: "classifier", label: "Classify", systemPrompt: "", deletable: false },
      draggable: false,
    } as WNode,
    ...routes.map(
      (r, i) =>
        ({
          id: `route-${uid()}`,
          type: "routeNode",
          position: { x: 500, y: i * ROUTE_Y_GAP },
          data: {
            kind: "route",
            label: r.type,
            systemPrompt: r.systemPrompt,
            routeType: r.type,
            routeDescription: r.description,
            deletable: true,
          },
        }) as WNode,
    ),
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// EDGE BUILDERS (derived, not stored in state)
// ─────────────────────────────────────────────────────────────────────────────

function ae(id: string, source: string, target: string): WEdge {
  return { id, source, target, type: "animated" };
}

function buildChainEdges(nodes: WNode[]): WEdge[] {
  const steps = nodes
    .filter((n) => n.data.kind === "step")
    .sort((a, b) => a.position.x - b.position.x);
  const seq = [
    nodes.find((n) => n.id === "start"),
    ...steps,
    nodes.find((n) => n.id === "end"),
  ].filter(Boolean) as WNode[];
  return seq.slice(0, -1).map((n, i) => ae(`e-${n.id}-${seq[i + 1].id}`, n.id, seq[i + 1].id));
}

function buildParallelEdges(nodes: WNode[]): WEdge[] {
  const workers = nodes.filter((n) => n.data.kind === "worker");
  const edges: WEdge[] = [];
  workers.forEach((w) => {
    edges.push(ae(`e-start-${w.id}`, "start", w.id));
    edges.push(ae(`e-${w.id}-synth`, w.id, "synthesize"));
  });
  edges.push(ae("e-synth-end", "synthesize", "end"));
  return edges;
}

function buildRouterEdges(nodes: WNode[]): WEdge[] {
  const routes = nodes.filter((n) => n.data.kind === "route");
  return [
    ae("e-start-classifier", "start", "classifier"),
    ...routes.map((r) => ae(`e-classifier-${r.id}`, "classifier", r.id)),
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// SERIALIZERS
// ─────────────────────────────────────────────────────────────────────────────

function serializeChain(nodes: WNode[]): string {
  const steps = nodes
    .filter((n) => n.data.kind === "step")
    .sort((a, b) => a.position.x - b.position.x)
    .map((n) => ({ name: n.data.label, systemPrompt: n.data.systemPrompt }));
  return JSON.stringify({ steps }, null, 2);
}

function serializeParallel(nodes: WNode[]): string {
  const workers = nodes
    .filter((n) => n.data.kind === "worker")
    .sort((a, b) => a.position.y - b.position.y)
    .map((n) => ({ name: n.data.label, systemPrompt: n.data.systemPrompt }));
  const synthesize =
    nodes.find((n) => n.data.kind === "synthesize")?.data.systemPrompt ?? "";
  return JSON.stringify({ workers, synthesize }, null, 2);
}

function serializeRouter(nodes: WNode[]): string {
  const routes = nodes
    .filter((n) => n.data.kind === "route")
    .sort((a, b) => a.position.y - b.position.y)
    .map((n) => ({
      type: n.data.routeType ?? n.data.label,
      description: n.data.routeDescription ?? "",
      systemPrompt: n.data.systemPrompt,
    }));
  return JSON.stringify({ routes }, null, 2);
}

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOM NODE COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function AnchorNode({ data }: NodeProps<WNode>) {
  const isStart = data.kind === "start";
  return (
    <div
      className={`flex items-center justify-center w-14 h-14 rounded-full border-2 select-none ${
        isStart
          ? "border-emerald-600 bg-emerald-950/60 text-emerald-400"
          : "border-zinc-600 bg-zinc-900/60 text-zinc-500"
      }`}
    >
      {!isStart && (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-2.5 !w-2.5 !border-zinc-600 !bg-zinc-700"
        />
      )}
      <span className="text-[10px] font-mono font-semibold uppercase tracking-wide">{data.label}</span>
      {isStart && (
        <Handle
          type="source"
          position={Position.Right}
          className="!h-2.5 !w-2.5 !border-emerald-600 !bg-emerald-700"
        />
      )}
    </div>
  );
}

function StepNode({ data, selected }: NodeProps<WNode>) {
  const isWorker = data.kind === "worker";
  const accentCls = isWorker ? "bg-amber-500" : "bg-blue-500";
  const ringCls = selected
    ? isWorker
      ? "border-amber-500 shadow-amber-900/30"
      : "border-blue-500 shadow-blue-900/30"
    : "border-[var(--border)] hover:border-[var(--muted)]";
  const preview = data.systemPrompt
    ? data.systemPrompt.slice(0, 80) + (data.systemPrompt.length > 80 ? "…" : "")
    : "No prompt configured";

  return (
    <div
      className={`relative w-52 rounded-lg border bg-[var(--panel-soft)] shadow-lg transition-all duration-150 ${ringCls}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2.5 !w-2.5 !border-[var(--border)] !bg-[var(--foreground)]"
      />
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className={`w-2 h-2 rounded-full shrink-0 ${accentCls}`} />
          <span className="text-xs font-semibold text-[var(--foreground)] truncate leading-none">
            {data.label || "Unnamed"}
          </span>
        </div>
        <p className="text-[10px] text-[var(--muted)] leading-relaxed line-clamp-2 font-mono">
          {preview}
        </p>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2.5 !w-2.5 !border-[var(--border)] !bg-[var(--foreground)]"
      />
    </div>
  );
}

function SynthNode({ data, selected }: NodeProps<WNode>) {
  const preview = data.systemPrompt
    ? data.systemPrompt.slice(0, 80) + (data.systemPrompt.length > 80 ? "…" : "")
    : "No prompt configured";
  return (
    <div
      className={`relative w-52 rounded-lg border bg-[var(--panel-soft)] shadow-lg transition-all duration-150 ${
        selected
          ? "border-emerald-500 shadow-emerald-900/30"
          : "border-[var(--border)] hover:border-[var(--muted)]"
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2.5 !w-2.5 !border-[var(--border)] !bg-[var(--foreground)]"
      />
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="w-2 h-2 rounded-full shrink-0 bg-emerald-500" />
          <span className="text-xs font-semibold text-emerald-400 truncate leading-none">
            {data.label}
          </span>
        </div>
        <p className="text-[10px] text-[var(--muted)] leading-relaxed line-clamp-2 font-mono">
          {preview}
        </p>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2.5 !w-2.5 !border-[var(--border)] !bg-[var(--foreground)]"
      />
    </div>
  );
}

function ClassifierNode({ data, selected }: NodeProps<WNode>) {
  return (
    <div
      className={`relative w-44 rounded-lg border bg-[var(--panel-soft)] shadow-lg transition-all duration-150 ${
        selected
          ? "border-purple-500 shadow-purple-900/30"
          : "border-[var(--border)] hover:border-[var(--muted)]"
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2.5 !w-2.5 !border-[var(--border)] !bg-[var(--foreground)]"
      />
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="w-2 h-2 rounded-full shrink-0 bg-purple-500" />
          <span className="text-xs font-semibold text-purple-400">{data.label}</span>
        </div>
        <p className="text-[10px] text-[var(--muted)]">Routes to specialized handlers</p>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2.5 !w-2.5 !border-[var(--border)] !bg-[var(--foreground)]"
      />
    </div>
  );
}

function RouteNode({ data, selected }: NodeProps<WNode>) {
  return (
    <div
      className={`relative w-52 rounded-lg border bg-[var(--panel-soft)] shadow-lg transition-all duration-150 ${
        selected
          ? "border-purple-500 shadow-purple-900/30"
          : "border-[var(--border)] hover:border-[var(--muted)]"
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2.5 !w-2.5 !border-[var(--border)] !bg-[var(--foreground)]"
      />
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="w-2 h-2 rounded-full shrink-0 bg-purple-500" />
          <span className="text-xs font-semibold text-[var(--foreground)] truncate">
            {data.routeType || data.label || "route"}
          </span>
        </div>
        {data.routeDescription ? (
          <p className="text-[10px] text-[var(--muted)] mb-1 truncate">{data.routeDescription}</p>
        ) : null}
        {data.systemPrompt ? (
          <p className="text-[10px] text-[var(--muted)] font-mono line-clamp-1">
            {data.systemPrompt.slice(0, 60)}
            {data.systemPrompt.length > 60 ? "…" : ""}
          </p>
        ) : (
          <p className="text-[10px] text-[var(--muted-soft)] italic">No prompt configured</p>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NODE & EDGE TYPE REGISTRIES (must be stable references outside components)
// ─────────────────────────────────────────────────────────────────────────────

const NODE_TYPES: NodeTypes = {
  anchorNode: AnchorNode as unknown as NodeTypes[string],
  stepNode: StepNode as unknown as NodeTypes[string],
  synthNode: SynthNode as unknown as NodeTypes[string],
  classifierNode: ClassifierNode as unknown as NodeTypes[string],
  routeNode: RouteNode as unknown as NodeTypes[string],
};

const EDGE_TYPES: EdgeTypes = {
  animated: FlowEdge.Animated,
  temporary: FlowEdge.Temporary,
};

// ─────────────────────────────────────────────────────────────────────────────
// NODE EDITOR PANEL
// ─────────────────────────────────────────────────────────────────────────────

function NodeEditor({
  node,
  onChange,
  onDelete,
}: {
  node: WNode;
  onChange: (id: string, changes: Partial<NodeData>) => void;
  onDelete: (id: string) => void;
}) {
  const d = node.data;
  const kindColor: Record<NodeKind, string> = {
    step: "bg-blue-500",
    worker: "bg-amber-500",
    synthesize: "bg-emerald-500",
    classifier: "bg-purple-500",
    route: "bg-purple-500",
    start: "bg-zinc-500",
    end: "bg-zinc-500",
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] shrink-0">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${kindColor[d.kind]}`} />
          <span className="text-xs font-semibold text-[var(--foreground)] capitalize">{d.kind}</span>
        </div>
        {d.deletable && (
          <button
            type="button"
            onClick={() => onDelete(node.id)}
            className="text-[10px] text-red-500/60 hover:text-red-400 transition-colors font-mono"
          >
            delete
          </button>
        )}
      </div>

      {/* Fields */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {(d.kind === "start" || d.kind === "end") && (
          <p className="text-[11px] text-[var(--muted)] text-center py-8 leading-relaxed">
            This is a fixed{" "}
            <span className="font-mono text-[var(--foreground)]">{d.kind}</span> node.
            <br />
            It cannot be edited.
          </p>
        )}

        {(d.kind === "step" || d.kind === "worker") && (
          <EditorField label="Name">
            <input
              className="input w-full text-sm"
              value={d.label}
              onChange={(e) => onChange(node.id, { label: e.target.value })}
              placeholder="Step name"
            />
          </EditorField>
        )}

        {d.kind === "route" && (
          <>
            <EditorField label="Route Type">
              <input
                className="input w-full text-sm font-mono"
                value={d.routeType ?? ""}
                onChange={(e) => onChange(node.id, { routeType: e.target.value, label: e.target.value })}
                placeholder="technical"
              />
            </EditorField>
            <EditorField label="Description">
              <input
                className="input w-full text-sm"
                value={d.routeDescription ?? ""}
                onChange={(e) => onChange(node.id, { routeDescription: e.target.value })}
                placeholder="When to use this route"
              />
            </EditorField>
          </>
        )}

        {d.kind !== "start" && d.kind !== "end" && (
          <EditorField
            label={d.kind === "synthesize" ? "Synthesis Prompt" : "System Prompt"}
          >
            <textarea
              className="input w-full h-44 resize-none font-mono text-[11px] leading-relaxed"
              value={d.systemPrompt}
              onChange={(e) => onChange(node.id, { systemPrompt: e.target.value })}
              placeholder="You are an expert..."
            />
          </EditorField>
        )}
      </div>
    </div>
  );
}

function EditorField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PALETTE DRAG ITEM
// ─────────────────────────────────────────────────────────────────────────────

function PaletteItem({
  kind,
  label,
  description,
  color,
}: {
  kind: string;
  label: string;
  description: string;
  color: string;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/workflow-node", JSON.stringify({ kind }));
        e.dataTransfer.effectAllowed = "move";
      }}
      className="flex items-center gap-2.5 p-2.5 rounded border border-dashed border-[var(--border)] hover:border-[var(--muted)] hover:bg-[var(--panel-soft)] cursor-grab active:cursor-grabbing transition-all duration-100 select-none"
    >
      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${color}`} />
      <div>
        <p className="text-xs font-medium text-[var(--foreground)] leading-none mb-0.5">{label}</p>
        <p className="text-[10px] text-[var(--muted)]">{description}</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STRUCTURED FORM (evaluator / orchestrator / hitl)
// ─────────────────────────────────────────────────────────────────────────────

function StructuredForm({
  workflowType,
  workflowConfig,
  onSave,
  onClose,
}: {
  workflowType: string;
  workflowConfig: string;
  onSave: (config: string) => void;
  onClose: () => void;
}) {
  const c = parseConfig(workflowConfig);

  const [values, setValues] = useState<Record<string, unknown>>(() => {
    if (workflowType === "orchestrator") {
      return {
        workerSystemPrompt:
          (c.workerSystemPrompt as string) ??
          "You are a skilled specialist. Execute the assigned task precisely and thoroughly.",
      };
    }
    if (workflowType === "evaluator") {
      return {
        maxIterations: (c.maxIterations as number) ?? 3,
        passingScore: (c.passingScore as number) ?? 8,
        evaluatorSystemPrompt:
          (c.evaluatorSystemPrompt as string) ??
          "You are a rigorous quality evaluator. Score responses critically and identify specific improvements.",
      };
    }
    // hitl
    return {
      autoApproveTools: (c.autoApproveTools as string[]) ?? [],
    };
  });

  function handleSave() {
    onSave(JSON.stringify(values, null, 2));
  }

  const titles: Record<string, string> = {
    orchestrator: "Orchestrator Config",
    evaluator: "Evaluator Config",
    hitl: "Human-in-the-Loop Config",
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[var(--background)]">
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
          <h2 className="text-sm font-medium text-[var(--foreground)]">
            {titles[workflowType]}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)] border border-[var(--border)] rounded transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-3 py-1.5 text-xs text-white bg-emerald-700 hover:bg-emerald-600 rounded transition-colors font-medium"
          >
            Apply Config
          </button>
        </div>
      </header>

      <div className="flex-1 flex items-start justify-center overflow-y-auto py-12 px-6">
        <div className="w-full max-w-lg space-y-5">
          {workflowType === "orchestrator" && (
            <EditorField label="Worker System Prompt">
              <textarea
                className="input w-full h-36 resize-none font-mono text-xs leading-relaxed"
                value={(values.workerSystemPrompt as string) ?? ""}
                onChange={(e) => setValues({ workerSystemPrompt: e.target.value })}
                placeholder="You are a skilled specialist. Execute the assigned task precisely."
              />
              <p className="mt-1.5 text-[10px] text-[var(--muted)]">
                Injected into each parallel worker the orchestrator spawns.
              </p>
            </EditorField>
          )}

          {workflowType === "evaluator" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <EditorField label="Max Iterations">
                  <input
                    type="number"
                    min={1}
                    max={10}
                    className="input w-full"
                    value={(values.maxIterations as number) ?? 3}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, maxIterations: parseInt(e.target.value) || 1 }))
                    }
                  />
                </EditorField>
                <EditorField label="Passing Score (1–10)">
                  <input
                    type="number"
                    min={1}
                    max={10}
                    className="input w-full"
                    value={(values.passingScore as number) ?? 8}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, passingScore: parseInt(e.target.value) || 1 }))
                    }
                  />
                </EditorField>
              </div>
              <EditorField label="Evaluator System Prompt">
                <textarea
                  className="input w-full h-36 resize-none font-mono text-xs leading-relaxed"
                  value={(values.evaluatorSystemPrompt as string) ?? ""}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, evaluatorSystemPrompt: e.target.value }))
                  }
                  placeholder="You are a rigorous quality evaluator..."
                />
              </EditorField>
            </>
          )}

          {workflowType === "hitl" && (
            <EditorField label="Auto-approve Tools">
              <p className="text-[11px] text-[var(--muted)] mb-3 leading-relaxed">
                These tools will run without a human approval prompt. All others will pause and wait.
              </p>
              <div className="space-y-2.5">
                {AVAILABLE_TOOLS.map((tool) => {
                  const approved = (values.autoApproveTools as string[]) ?? [];
                  return (
                    <label
                      key={tool.name}
                      className="flex items-start gap-3 cursor-pointer p-2.5 rounded border border-[var(--border)] hover:border-[var(--muted)] transition-colors"
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 accent-emerald-500 shrink-0"
                        checked={approved.includes(tool.name)}
                        onChange={(e) => {
                          setValues({
                            autoApproveTools: e.target.checked
                              ? [...approved, tool.name]
                              : approved.filter((t) => t !== tool.name),
                          });
                        }}
                      />
                      <div>
                        <span className="text-sm font-mono text-[var(--foreground)]">
                          {tool.name}
                        </span>
                        <p className="text-[11px] text-[var(--muted)] mt-0.5">{tool.description}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </EditorField>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CANVAS BUILDER (inner, has access to useReactFlow)
// ─────────────────────────────────────────────────────────────────────────────

const PALETTE_CONFIG: Record<
  "chain" | "parallel" | "router",
  { kind: string; label: string; description: string; color: string }
> = {
  chain: {
    kind: "step",
    label: "Step",
    description: "Sequential step node",
    color: "bg-blue-500",
  },
  parallel: {
    kind: "worker",
    label: "Worker",
    description: "Parallel analysis worker",
    color: "bg-amber-500",
  },
  router: {
    kind: "route",
    label: "Route",
    description: "Handler for a route type",
    color: "bg-purple-500",
  },
};

const LAYOUT_TIPS: Record<"chain" | "parallel" | "router", string> = {
  chain: "Nodes run left → right. Drag horizontally to reorder steps.",
  parallel: "Workers run concurrently. Drag vertically to reorder.",
  router: "Input is classified, then routed to a specialized handler.",
};

interface WorkflowCanvasProps {
  workflowType: string;
  workflowConfig: string;
  onSave: (config: string) => void;
  onClose: () => void;
}

function CanvasBuilder({ workflowType, workflowConfig, onSave, onClose }: WorkflowCanvasProps) {
  const wfType = workflowType as "chain" | "parallel" | "router";
  const { screenToFlowPosition } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<WNode>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Initialize nodes from config (once)
  useEffect(() => {
    const initial =
      wfType === "chain"
        ? buildChainNodes(workflowConfig)
        : wfType === "parallel"
          ? buildParallelNodes(workflowConfig)
          : buildRouterNodes(workflowConfig);
    setNodes(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Edges are derived from nodes (no separate edge state)
  const edges = useMemo(() => {
    if (wfType === "chain") return buildChainEdges(nodes);
    if (wfType === "parallel") return buildParallelEdges(nodes);
    return buildRouterEdges(nodes);
  }, [wfType, nodes]);

  // Drop handler for palette items
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const raw = event.dataTransfer.getData("application/workflow-node");
      if (!raw) return;
      const { kind } = JSON.parse(raw) as { kind: string };
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });

      let newNode: WNode;
      if (kind === "step") {
        newNode = {
          id: `step-${uid()}`,
          type: "stepNode",
          position,
          data: { kind: "step", label: "New Step", systemPrompt: "", deletable: true },
        };
      } else if (kind === "worker") {
        newNode = {
          id: `worker-${uid()}`,
          type: "stepNode",
          position,
          data: { kind: "worker", label: "New Worker", systemPrompt: "", deletable: true },
        };
      } else {
        newNode = {
          id: `route-${uid()}`,
          type: "routeNode",
          position,
          data: {
            kind: "route",
            label: "new",
            systemPrompt: "",
            routeType: "new",
            routeDescription: "",
            deletable: true,
          },
        };
      }
      setNodes((prev) => [...prev, newNode]);
      setSelectedId(newNode.id);
    },
    [screenToFlowPosition, setNodes],
  );

  function updateNode(id: string, changes: Partial<NodeData>) {
    setNodes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...changes } } : n)),
    );
  }

  function deleteNode(id: string) {
    setNodes((prev) => prev.filter((n) => n.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function handleSave() {
    const config =
      wfType === "chain"
        ? serializeChain(nodes)
        : wfType === "parallel"
          ? serializeParallel(nodes)
          : serializeRouter(nodes);
    onSave(config);
  }

  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;
  const paletteItem = PALETTE_CONFIG[wfType];
  const layoutTip = LAYOUT_TIPS[wfType];
  const editableCount = nodes.filter((n) => n.data.deletable).length;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[var(--background)]">
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
          <h2 className="text-sm font-medium text-[var(--foreground)] capitalize">
            {workflowType} Workflow Builder
          </h2>
          <span className="text-[10px] font-mono text-[var(--muted)] bg-[var(--panel-soft)] px-2 py-0.5 rounded border border-[var(--border)]">
            {editableCount} node{editableCount !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)] border border-[var(--border)] rounded transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-3 py-1.5 text-xs text-white bg-emerald-700 hover:bg-emerald-600 rounded transition-colors font-medium"
          >
            Apply Config
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── Left Palette ── */}
        <aside className="w-52 border-r border-[var(--border)] flex flex-col p-4 gap-5 shrink-0">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-2.5">
              Add Node
            </p>
            <PaletteItem {...paletteItem} />
            <p className="mt-2 text-[10px] text-[var(--muted-soft)]">
              Drag onto the canvas to add
            </p>
          </div>

          <div className="border-t border-[var(--border)] pt-4">
            <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-2">
              Layout
            </p>
            <p className="text-[10px] text-[var(--muted)] leading-relaxed">{layoutTip}</p>
          </div>

          <div className="border-t border-[var(--border)] pt-4">
            <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--muted)] mb-2">
              Tips
            </p>
            <ul className="space-y-1.5">
              {["Click a node to edit", "Drag to reposition", "Delete from editor panel"].map(
                (tip) => (
                  <li key={tip} className="flex items-start gap-1.5">
                    <span className="text-[var(--muted-soft)] mt-px">·</span>
                    <span className="text-[10px] text-[var(--muted)]">{tip}</span>
                  </li>
                ),
              )}
            </ul>
          </div>
        </aside>

        {/* ── Canvas ── */}
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
            onPaneClick={() => setSelectedId(null)}
            connectionLineType={ConnectionLineType.Bezier}
            proOptions={{ hideAttribution: true }}
            fitView
            fitViewOptions={{ padding: 0.35 }}
            minZoom={0.3}
            maxZoom={2}
          >
            <Background gap={22} size={1} color="var(--border)" />
            <Controls
              className="!border-[var(--border)] !bg-[var(--panel)] !shadow-none"
              showInteractive={false}
            />
          </ReactFlow>
        </div>

        {/* ── Right Node Editor ── */}
        <aside className="w-72 border-l border-[var(--border)] flex flex-col shrink-0 overflow-hidden">
          {selectedNode ? (
            <NodeEditor node={selectedNode} onChange={updateNode} onDelete={deleteNode} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
              <div className="w-10 h-10 rounded-full border border-[var(--border)] flex items-center justify-center">
                <span className="text-[var(--muted)] text-base">↖</span>
              </div>
              <p className="text-[11px] text-[var(--muted)] leading-relaxed">
                Click a node on the canvas to edit its configuration
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

export function WorkflowCanvas(props: WorkflowCanvasProps) {
  const { workflowType } = props;

  if (
    workflowType === "orchestrator" ||
    workflowType === "evaluator" ||
    workflowType === "hitl"
  ) {
    return <StructuredForm {...props} />;
  }

  return (
    <ReactFlowProvider>
      <CanvasBuilder {...props} />
    </ReactFlowProvider>
  );
}
