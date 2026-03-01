"use client";

import Link from "next/link";
import { ThemeToggle } from "./components/theme-toggle";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] overflow-hidden relative">
      {/* Background grid */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(34,197,94,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(34,197,94,0.03)_1px,transparent_1px)] bg-[size:50px_50px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,var(--background)_40%,transparent_100%)]" />

      {/* Ambient glow */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-emerald-500/10 dark:bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-emerald-500/8 dark:bg-emerald-500/3 rounded-full blur-[100px] pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-8 py-6 animate-[fadeIn_0.6s_ease-out_forwards] opacity-0">
        <div className="flex items-center gap-3">
          <span className="text-emerald-500 text-lg">◆</span>
          <span className="font-mono text-sm tracking-tight">agent-smith</span>
        </div>
        <nav className="flex items-center gap-6">
          <Link href="/app" className="font-mono text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
            enter app
          </Link>
          <ThemeToggle />
        </nav>
      </header>

      {/* Main content */}
      <main className="relative z-10 flex flex-col items-center justify-center min-h-[calc(100vh-200px)] px-8">
        <div className="max-w-4xl text-center">
          {/* Hero text */}
          <div className="animate-[fadeInUp_0.8s_ease-out_0.1s_forwards] opacity-0 translate-y-8">
            <h1 className="font-mono text-5xl md:text-7xl font-medium tracking-tight mb-6">
              <span className="text-[var(--foreground)]">build agents,</span>
              <br />
              <span className="text-emerald-500">watch them work</span>
            </h1>
          </div>

          <div className="animate-[fadeInUp_0.8s_ease-out_0.2s_forwards] opacity-0 translate-y-8">
            <p className="font-mono text-sm text-[var(--muted)] max-w-xl mx-auto mb-12 leading-relaxed">
              a focused environment for defining AI agents, running them, and watching every step in real time.
              persistent memory, built-in tools, and step-by-step visibility.
            </p>
          </div>

          {/* CTA */}
          <div className="animate-[fadeInUp_0.8s_ease-out_0.3s_forwards] opacity-0 translate-y-8">
            <Link
              href="/app"
              className="inline-flex items-center gap-3 px-6 py-3 bg-emerald-500 text-black font-mono text-sm font-medium rounded hover:bg-emerald-400 transition-all duration-300 hover:scale-105 hover:shadow-[0_0_30px_rgba(34,197,94,0.3)]"
            >
              <span>enter workspace</span>
              <span className="text-xs opacity-70">→</span>
            </Link>
          </div>
        </div>

        {/* Features */}
        <div className="mt-24 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl animate-[fadeInUp_0.8s_ease-out_0.5s_forwards] opacity-0 translate-y-8">
          {[
            { title: "define agents", desc: "system prompts, models, and tools" },
            { title: "run & observe", desc: "live step-by-step execution" },
            { title: "persistent memory", desc: "agents remember across runs" },
          ].map((feature, i) => (
            <div
              key={feature.title}
              className="p-4 border border-[var(--border)] rounded bg-[var(--panel)]/50 backdrop-blur-sm hover:border-emerald-500/30 transition-all duration-500 animate-[fadeIn_0.6s_ease-out_forwards]"
              style={{ animationDelay: `${0.6 + i * 0.1}s`, opacity: 0 }}
            >
              <div className="font-mono text-xs text-emerald-500 mb-2">0{i + 1}</div>
              <h3 className="font-mono text-sm text-[var(--foreground)] mb-1">{feature.title}</h3>
              <p className="font-mono text-[10px] text-[var(--muted)]">{feature.desc}</p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 px-8 py-6 text-center animate-[fadeIn_0.6s_ease-out_0.7s_forwards] opacity-0">
        <p className="font-mono text-[10px] text-[var(--muted-strong)]">
          built with next.js + convex + ai sdk
        </p>
      </footer>

      {/* Scanline effect */}
      <div className="absolute inset-0 pointer-events-none dark:bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,0,0,0.03)_2px,rgba(0,0,0,0.03)_4px)]" />
    </div>
  );
}
