"use client";

import type { ComponentPropsWithoutRef, HTMLAttributes, PropsWithChildren } from "react";
import { Handle, Position } from "@xyflow/react";

type NodeHandles = {
  source?: boolean;
  target?: boolean;
};

type NodeProps = PropsWithChildren<
  HTMLAttributes<HTMLDivElement> & {
    handles?: NodeHandles;
  }
>;

export function Node({ children, className, handles, ...props }: NodeProps) {
  return (
    <div
      className={`relative w-64 rounded-lg border border-[var(--border)] bg-[var(--panel-soft)] shadow-[0_8px_24px_rgba(0,0,0,0.18)] ${className ?? ""}`}
      {...props}
    >
      {handles?.target ? (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-2.5 !w-2.5 !border !border-[var(--border)] !bg-[var(--foreground)]"
        />
      ) : null}

      {children}

      {handles?.source ? (
        <Handle
          type="source"
          position={Position.Right}
          className="!h-2.5 !w-2.5 !border !border-[var(--border)] !bg-[var(--foreground)]"
        />
      ) : null}
    </div>
  );
}

export function NodeHeader({ className, ...props }: ComponentPropsWithoutRef<"header">) {
  return (
    <header className={`border-b border-[var(--border)] px-4 py-3 ${className ?? ""}`} {...props} />
  );
}

export function NodeTitle({ className, ...props }: ComponentPropsWithoutRef<"h3">) {
  return (
    <h3 className={`text-sm font-semibold tracking-tight text-[var(--foreground)] ${className ?? ""}`} {...props} />
  );
}

export function NodeDescription({ className, ...props }: ComponentPropsWithoutRef<"p">) {
  return <p className={`mt-1 text-xs text-[var(--muted)] ${className ?? ""}`} {...props} />;
}

export function NodeContent({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={`px-4 py-3 text-xs text-[var(--muted-strong)] ${className ?? ""}`} {...props} />;
}

export function NodeFooter({ className, ...props }: ComponentPropsWithoutRef<"footer">) {
  return (
    <footer className={`border-t border-[var(--border)] px-4 py-2 text-[11px] text-[var(--muted)] ${className ?? ""}`} {...props} />
  );
}
