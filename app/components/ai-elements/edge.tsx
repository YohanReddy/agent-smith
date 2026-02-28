"use client";

import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";

function Animated({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps) {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <BaseEdge
      id={id}
      path={path}
      style={{
        stroke: "var(--accent)",
        strokeDasharray: "8 8",
        strokeLinecap: "round",
        strokeWidth: 2,
        animation: "ai-edge-flow 0.9s linear infinite",
      }}
    />
  );
}

function Temporary({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps) {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <BaseEdge
      id={id}
      path={path}
      style={{
        stroke: "var(--muted)",
        strokeDasharray: "3 8",
        strokeLinecap: "round",
        strokeWidth: 2,
      }}
    />
  );
}

export const Edge = {
  Animated,
  Temporary,
};
