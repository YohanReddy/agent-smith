"use client";

import {
  Background,
  ConnectionLineType,
  Controls,
  ReactFlow,
  type ReactFlowProps,
} from "@xyflow/react";

type CanvasProps = ReactFlowProps & {
  className?: string;
};

export function Canvas({ children, className, ...props }: CanvasProps) {
  return (
    <div
      className={`h-full w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--panel)] ${className ?? ""}`}
    >
      <ReactFlow
        connectionLineType={ConnectionLineType.Bezier}
        proOptions={{ hideAttribution: true }}
        {...props}
      >
        <Background gap={22} size={1} color="var(--border)" />
        <Controls className="!border-[var(--border)] !bg-[var(--panel)]" showInteractive={false} />
        {children}
      </ReactFlow>
    </div>
  );
}
