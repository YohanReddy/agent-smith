# PRD: Agent Smith
**Status:** Draft  
**Stack:** Next.js · Convex · Bun · AI SDK (Vercel) v6  
**Goal:** A minimal, modern environment for experimenting with AI agents — building, running, observing, and iterating on agentic workflows.

---

## 1. Problem

Developers want to experiment with AI agents but face three blockers: (1) too much boilerplate before seeing anything work, (2) no good way to observe what agents are actually doing mid-run, and (3) no persistence layer to store runs, memory, and tool outputs without building one from scratch. This product removes all three blockers in a minimal, opinionated setup.

---

## 2. Vision

A focused workbench for building agents — not a general-purpose chat UI. You define agents, give them tools, run them, and watch everything happen in real time. Convex powers the backend and persistence, AI SDK drives the agent loop, and the UI stays completely out of the way.

---

## 3. Core Concepts

| Concept | Description |
|---|---|
| **Agent** | A named configuration: system prompt, model, tools, memory strategy |
| **Run** | A single execution of an agent given an input. Persisted with full step history. |
| **Step** | One LLM call within a run — includes input, output, tool calls, token usage |
| **Tool** | A typed function the agent can call. Defined with Zod schemas via AI SDK. |
| **Memory** | Optional persistent context passed into future runs for the same agent |

---

## 4. Tech Stack Decisions

**Next.js (App Router)** — UI and API routes. Route handlers serve as the streaming endpoint for agent runs.

**Convex** — Real-time database and backend functions. All runs, steps, tool results, and memory are stored here. Convex's reactivity means the UI updates automatically as an agent progresses through steps — no polling, no WebSockets to manage.

**Bun** — Package manager and runtime for local dev. Fast installs, native TypeScript.

**AI SDK v6 (`ai` package)** — `streamText` with `stopWhen: stepCountIs(n)` drives the agent loop. Tools are defined with `tool()` and Zod. `onStepFinish` writes each step to Convex in real time.

---

## 5. Features

### 5.1 Agent Builder
A simple form (or editable config panel) to define an agent:
- Name and description
- System prompt (textarea with variable interpolation support, e.g. `{{memory}}`)
- Model selector (claude-sonnet, gpt-4o, etc. via AI SDK providers)
- Tool selection from a registry of built-in tools
- Max steps limit
- Memory mode: none / summary / full

Agents are stored in Convex and versioned (each save creates a new version).

### 5.2 Run Console
The primary interaction surface. Select an agent, enter an input, hit Run.

The console streams live updates as the run progresses:
- Current step number and status (thinking / calling tool / done)
- Each tool call with its input and result, shown as it happens
- Final output text streaming in
- Token usage and latency per step

All powered by `useQuery` on Convex — the run record and step records update in real time as the server writes them.

### 5.3 Run History
A list of all past runs per agent with:
- Input, final output, status (completed / failed / stopped)
- Step count, total tokens, total duration
- Click into any run to replay the full step-by-step trace

### 5.4 Tool Registry
A set of built-in tools available to all agents:
- **web_search** — search the web via a search API
- **fetch_url** — retrieve page content
- **read_memory** / **write_memory** — access the agent's persisted memory store

Tools are defined using AI SDK's `tool()` helper with Zod schemas. Custom tools can be added as TypeScript files in `/tools` and auto-discovered.

### 5.5 Memory
Per-agent memory stored in Convex. Two modes:

**Summary mode** — after each run, append a compact summary entry to memory. The memory can be injected into the system prompt as `{{memory}}`.

**Full mode** — recent user/assistant turns are stored and reused as message history in future runs (subject to context window limits).

Memory can be viewed, edited, and cleared from the agent settings panel.

### 5.6 Agent Observability (DevTools integration)
In local dev, optionally wrap model calls with AI SDK `devToolsMiddleware` to inspect raw request/response payloads in the DevTools viewer.

### 5.7 Subagents (Phase 2)
Allow an agent's tool to spin up another agent — passing a prompt and getting back a result. Implemented as a `call_agent` tool that triggers a new run in Convex and awaits its completion. Parent runs link to child runs in the run history.

---

## 6. Data Model (Convex)

```
agents
  _id, name, description, systemPrompt, model, tools[], memoryMode, createdAt

agentVersions
  _id, agentId, version, config{}, createdAt

runs
  _id, agentId, agentVersion, input, output, status, totalTokens, durationMs, createdAt

steps
  _id, runId, stepNumber, prompt, completion, toolCalls[], tokenUsage{}, durationMs, createdAt

toolResults
  _id, stepId, toolName, input, output, durationMs, error?

memory
  _id, agentId, content, updatedAt
```

---

## 7. API Design

**`POST /api/run`**  
Starts an agent run. Body: `{ agentId, input }`. Creates a run record in Convex, then streams `streamText` from AI SDK. Each `onStepFinish` callback writes the step to Convex. Returns a streaming response for the final text output.

**Convex mutations/queries:**  
All UI data access goes through Convex's typed queries and mutations — no additional REST endpoints needed for reading history, memory, or agent configs.

---

## 8. UI Design Principles

- Dark theme, monospace accents for agent output
- No sidebars unless necessary — full-width run console
- Streaming output feels like a terminal: steps appear as they complete
- Config panels slide in as drawers — don't navigate away from the console
- Zero loading states where possible — Convex reactivity means data just appears

---

## 9. Phased Roadmap

**Phase 1 — Core Loop (MVP)**
Define agents, run them, see step-by-step output, store run history. Memory (summary mode). 4 built-in tools.

**Phase 2 — Power Features**
Custom tool authoring in-browser. Full memory mode. Subagents. Run comparison (A/B two agents on same input). Export runs as JSON.

**Phase 3 — Collaboration**
Share agent configs via link. Public run gallery. Team workspaces.

---

## 10. Out of Scope

- Multi-user auth (Phase 1 is single-user / local)
- Billing or usage metering
- Drag-and-drop visual workflow builder
- Mobile UI

---

## 11. Success Metrics

- Time from clone to first agent run: < 5 minutes
- Steps visible in UI within 500ms of `onStepFinish` firing
- Zero data loss on run failures (every step written before the next begins)
- Developer NPS: "I'd use this again when building a new agent"
