# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
bun run dev          # Start Next.js dev server
bunx convex dev      # Start Convex backend (run alongside Next.js)

# Production
bun run build
bun run start

# Code quality
bun run lint
```

Both `bun run dev` and `bunx convex dev` must run simultaneously during development — Next.js serves the frontend, Convex handles the backend.

## What This Project Is

**Agent Smith** is an AI agent workbench. It is not a chat UI — it's a focused environment for defining agents, running them, and watching every step in real time. The tech stack is Next.js (App Router) + Convex + AI SDK v6 (Vercel).

## Architecture

### Core Concepts

| Concept | Description |
|---|---|
| **Agent** | Named config: system prompt, model, tools[], memory mode |
| **Run** | One execution of an agent. Persisted with full step history. |
| **Step** | One LLM call within a run — includes prompt, completion, tool calls, token usage |
| **Tool** | Typed function the agent can invoke, defined with AI SDK `tool()` + Zod |
| **Memory** | Per-agent persistent context injected via `{{memory}}` in system prompts |

### Data Flow

1. User triggers a run → `POST /api/run` (Next.js Route Handler)
2. Route handler creates a run record in Convex, then calls AI SDK `streamText`
3. Each `onStepFinish` callback writes the step to Convex in real time
4. The UI subscribes via `useQuery` on Convex — no polling, no manual refresh

### Convex Data Model

```
agents          — agent definitions (name, systemPrompt, model, tools[], memoryMode)
agentVersions   — immutable snapshots; each save creates a new version
runs            — execution records (agentId, input, output, status, tokens, duration)
steps           — per-LLM-call records (runId, stepNumber, prompt, completion, toolCalls[])
toolResults     — tool invocation records (stepId, toolName, input, output)
memory          — per-agent persistent context (agentId, content)
```

Schema lives in `convex/schema.ts`. All UI reads go through Convex queries; all writes go through Convex mutations. The only REST endpoint is `POST /api/run` for initiating streaming runs.

### Key Patterns

- **Streaming via `onStepFinish`**: AI SDK's callback writes each step to Convex before the next step begins — guarantees zero data loss on failures.
- **Convex real-time reactivity**: UI components use `useQuery` so they update automatically as the backend writes new steps. Do not add polling or WebSocket management.
- **Versioned agents**: Saving an agent always creates a new `agentVersions` record. `runs` reference a specific version, not the mutable `agents` record.
- **Tool registry**: Built-in tools (`web_search`, `fetch_url`, `read_memory`, `write_memory`) are defined in `tools/index.ts`. Custom tools can be added there and registered in `AVAILABLE_TOOLS`.
- **Memory injection**: Summary mode appends compact run summaries. Full mode stores recent user/assistant turns and reuses them as conversation history on future runs. `{{memory}}` can inject rendered memory into system prompts.

### UI Principles

- Dark theme, monospace accents for agent output
- Full-width run console (no sidebars unless necessary)
- Config panels open as drawers — don't navigate away from the console
- Streaming output appears like a terminal — steps show as they complete
- Avoid loading states — rely on Convex reactivity

### AI SDK v6 API Notes

The installed `ai` package is v6 which has breaking changes from earlier versions:

- **Multi-step**: use `stopWhen: stepCountIs(n)` (not `maxSteps`)
- **Token counts**: `usage.inputTokens` / `usage.outputTokens` (not `promptTokens`/`completionTokens`)
- **Streaming response**: `result.toTextStreamResponse()` (not `toDataStreamResponse()`)
- **Tool definition**: use `inputSchema` (not `parameters`), add `outputSchema` to enable execute, execute receives `(input, options)` — do not destructure in the signature
- **Tool call fields**: `.input` (not `.args`), tool result `.output` (not `.result`)

## Phase 1 Scope (MVP)

Define agents → run them → see live step-by-step output → store run history → summary memory → 4 built-in tools → DevTools integration.

**Out of scope for Phase 1:** multi-user auth, subagents, custom tool authoring in-browser, mobile UI.
