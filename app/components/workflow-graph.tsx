"use client";

import { useMemo } from "react";
import type { Edge as ReactFlowEdge, EdgeTypes, Node as ReactFlowNode, NodeTypes, NodeProps } from "@xyflow/react";
import { nanoid } from "nanoid";
import { Canvas } from "@/app/components/ai-elements/canvas";
import { Edge } from "@/app/components/ai-elements/edge";
import {
  Node,
  NodeContent,
  NodeDescription,
  NodeFooter,
  NodeHeader,
  NodeTitle,
} from "@/app/components/ai-elements/node";

type Step = {
  _id: string;
  stepNumber: number;
  stepName?: string;
  stepType?: string;
  groupId?: string;
  text?: string;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
};

type RunStatus = "running" | "completed" | "failed" | "stopped" | undefined;

type GraphNodeData = {
  label: string;
  description: string;
  footer?: string;
  handles: { source: boolean; target: boolean };
};

type GraphNode = ReactFlowNode<GraphNodeData, "workflow">;

function fmtMs(ms: number) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function clip(text: string | undefined, n = 88) {
  if (!text) return "";
  return text.replace(/\s+/g, " ").trim().slice(0, n);
}

function nodeForStep(step: Step, x: number, y: number): GraphNode {
  const tokens = (step.inputTokens ?? 0) + (step.outputTokens ?? 0);
  const footerParts = [
    step.durationMs != null ? fmtMs(step.durationMs) : "",
    tokens > 0 ? `${tokens} tok` : "",
  ].filter(Boolean);

  return {
    id: String(step._id),
    position: { x, y },
    type: "workflow",
    data: {
      label: step.stepName ?? `Step ${step.stepNumber}`,
      description: step.stepType ? `${step.stepType} - ${clip(step.text, 64)}` : clip(step.text, 64),
      footer: footerParts.join(" · ") || undefined,
      handles: { source: true, target: true },
    },
  };
}

function buildGraph(steps: Step[], status: RunStatus) {
  const nodes: GraphNode[] = [];
  const edges: ReactFlowEdge[] = [];
  let prevAnchor = "start";
  let x = 280;

  nodes.push({
    id: "start",
    position: { x: 0, y: 0 },
    type: "workflow",
    data: {
      label: "Start",
      description: "Run initialized",
      handles: { source: true, target: false },
    },
  });

  const sorted = [...steps].sort((a, b) => a.stepNumber - b.stepNumber);

  for (let i = 0; i < sorted.length; ) {
    const current = sorted[i];
    if (!current.groupId) {
      const node = nodeForStep(current, x, 0);
      nodes.push(node);
      edges.push({
        id: nanoid(),
        source: prevAnchor,
        target: node.id,
        type: "animated",
      });
      prevAnchor = node.id;
      x += 320;
      i += 1;
      continue;
    }

    const group: Step[] = [];
    while (i < sorted.length && sorted[i].groupId === current.groupId) {
      group.push(sorted[i]);
      i += 1;
    }

    const spacing = 170;
    const center = (group.length - 1) / 2;
    const groupNodeIds: string[] = [];

    group.forEach((step, idx) => {
      const y = (idx - center) * spacing;
      const node = nodeForStep(step, x, y);
      nodes.push(node);
      groupNodeIds.push(node.id);
      edges.push({
        id: nanoid(),
        source: prevAnchor,
        target: node.id,
        type: "animated",
      });
    });

    if (group.length > 1) {
      const mergeId = `merge-${group[0].groupId}`;
      nodes.push({
        id: mergeId,
        position: { x: x + 320, y: 0 },
        type: "workflow",
        data: {
          label: "Merge",
          description: "Parallel outputs combined",
          handles: { source: true, target: true },
        },
      });
      groupNodeIds.forEach((id) => {
        edges.push({
          id: nanoid(),
          source: id,
          target: mergeId,
          type: "temporary",
        });
      });
      prevAnchor = mergeId;
      x += 640;
    } else {
      prevAnchor = groupNodeIds[0];
      x += 320;
    }
  }

  if (status && status !== "running") {
    const endLabel = status === "completed" ? "Complete" : status === "failed" ? "Failed" : "Stopped";
    nodes.push({
      id: "end",
      position: { x, y: 0 },
      type: "workflow",
      data: {
        label: endLabel,
        description: "Run finished",
        handles: { source: false, target: true },
      },
    });
    edges.push({
      id: nanoid(),
      source: prevAnchor,
      target: "end",
      type: status === "completed" ? "animated" : "temporary",
    });
  }

  return { nodes, edges };
}

function GraphWorkflowNode({ data }: NodeProps<GraphNode>) {
  return (
    <Node handles={data.handles}>
      <NodeHeader>
        <NodeTitle>{data.label}</NodeTitle>
        <NodeDescription>{data.description || " "}</NodeDescription>
      </NodeHeader>
      <NodeContent>
        <p className="font-mono text-[11px] text-[var(--muted)]">interactive step node</p>
      </NodeContent>
      {data.footer ? (
        <NodeFooter>
          <p className="font-mono">{data.footer}</p>
        </NodeFooter>
      ) : null}
    </Node>
  );
}

const nodeTypes: NodeTypes = {
  workflow: GraphWorkflowNode,
};

const edgeTypes: EdgeTypes = {
  animated: Edge.Animated,
  temporary: Edge.Temporary,
};

export function WorkflowGraph({
  steps,
  status,
  className,
}: {
  steps: Step[];
  status: RunStatus;
  className?: string;
}) {
  const { nodes, edges } = useMemo(() => buildGraph(steps, status), [steps, status]);
  return (
    <div className={className ?? "h-[340px]"}>
      <Canvas edges={edges} edgeTypes={edgeTypes} fitView nodes={nodes} nodeTypes={nodeTypes} />
    </div>
  );
}
