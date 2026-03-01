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
| **Subagent** | A child agent that can be invoked by a parent agent for specialized tasks |
| **Skill** | Runtime-loaded capability from markdown files, activated on demand |

---

## 4a. Supported Models

| Provider | Model | Capabilities |
|---|---|---|
| OpenAI | gpt-4o, gpt-4o-mini, o1, o3-mini, gpt-5 | Text, tools, reasoning |
| Anthropic | claude-3.5-sonnet, claude-4-sonnet, claude-4-opus | Text, tools, extended thinking, computer use |
| Google | gemini-2.5-flash, gemini-2.5-pro | Text, tools, thinking, image generation |
| DeepSeek | deepseek-chat, deepseek-reasoner, deepseek-v3.2 | Text, tools, reasoning |
| Amazon Bedrock | Various | Text, tools |

---

## 4b. Feature Matrix

| Feature | Status | Description |
|---|---|---|
| **Core Agent Loop** | ✅ Phase 1 | Define agents, run them, see step-by-step output |
| **Memory (Summary)** | ✅ Phase 1 | Persistent context via summaries |
| **Memory (Full)** | ✅ Phase 2 | Full conversation history |
| **Multi-Modal Input** | ✅ Phase 2 | Images, PDFs as input |
| **Image Generation** | ✅ Phase 3 | Gemini 2.5 Flash Image |
| **Subagents** | ✅ Phase 2 | Delegate to child agents |
| **Enhanced RAG** | ✅ Phase 3 | Vector embeddings + semantic search |
| **Code Execution** | ✅ Phase 3 | Sandboxed Python/Node execution |
| **File Operations** | ✅ Phase 3 | Read/write files |
| **Computer Use** | ✅ Phase 3 | UI interaction (requires sandbox) |
| **Memory Providers** | ✅ Phase 4 | Mem0, Letta, Supermemory |
| **Agent Skills** | ✅ Phase 4 | Runtime-loaded markdown skills |
| **Natural Language SQL** | ✅ Phase 4 | Query DBs conversationally |
| **Run History** | ✅ Phase 1 | Full trace replay |
| **DevTools Integration** | ✅ Phase 1 | Request/response inspection |
| **Model Selection** | ✅ Phase 1 | OpenAI, Anthropic, Google |
| **More Providers** | ✅ Phase 3 | Claude 4, GPT-5, DeepSeek |

---

## 4. Tech Stack Decisions

**Next.js (App Router)** — UI and API routes. Route handlers serve as the streaming endpoint for agent runs.

**Convex** — Real-time database and backend functions. All runs, steps, tool results, and memory are stored here. Convex's reactivity means the UI updates automatically as an agent progresses through steps — no polling, no WebSockets to manage.

**Bun** — Package manager and runtime for local dev. Fast installs, native TypeScript.

**AI SDK v6 (`ai` package)** — `streamText` with `stopWhen: stepCountIs(n)` drives the agent loop. Tools are defined with `tool()` and Zod. `onStepFinish` writes each step to Convex in real time.

Supported providers include: OpenAI, Anthropic, Google, DeepSeek, Amazon Bedrock, and more via AI SDK providers.

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

**Extended Tool Set (Phase 2+):**
- **call_subagent** — delegate to a subagent for complex tasks
- **generate_image** — create images via Gemini 2.5 Flash Image
- **execute_code** — run Python/Node.js code in sandbox
- **query_database** — natural language SQL queries
- **computer_use** — interact with computer UI (requires sandbox)

Tools are defined using AI SDK's `tool()` helper with Zod schemas. Custom tools can be added as TypeScript files in `/tools` and auto-discovered.

### 5.5 Memory
Per-agent memory stored in Convex. Two modes:

**Summary mode** — after each run, append a compact summary entry to memory. The memory can be injected into the system prompt as `{{memory}}`.

**Full mode** — recent user/assistant turns are stored and reused as message history in future runs (subject to context window limits).

Memory can be viewed, edited, and cleared from the agent settings panel.

### 5.6 Agent Observability (DevTools integration)
In local dev, optionally wrap model calls with AI SDK `devToolsMiddleware` to inspect raw request/response payloads in the DevTools viewer.

### 5.7 Multi-Modal Support
Agents can process images and PDFs as input. When a user uploads an image or document, it's converted to a data URL and passed to the model as part of the message content.

Supported inputs:
- Images (PNG, JPEG, GIF, WebP)
- PDFs (text extraction via model)

The UI displays uploaded files inline with chat messages, and agents can reference them in their responses.

### 5.8 Image Generation
Agents can generate images using Gemini 2.5 Flash Image. Images are returned as Uint8Array data and can be:
- Displayed inline in the run console
- Saved to storage for later retrieval

Models supported: `google/gemini-2.5-flash-image`

### 5.9 Subagents
An agent can delegate work to a specialized subagent via a `call_subagent` tool. The parent agent provides a task prompt, and the subagent executes independently with its own context window.

Key features:
- Subagents run in their own execution context
- Parent can stream subagent progress in real-time
- Subagent results can be summarized before returning to parent (controlling token usage)
- Parent-child relationships tracked in run history

Use cases:
- Complex research tasks requiring large context
- Parallel exploration of multiple topics
- Specialized expertise (e.g., coding subagent, analysis subagent)

### 5.10 Enhanced RAG with Vector Embeddings
Memory can be enhanced with semantic search using vector embeddings. This goes beyond simple text storage to enable:
- Semantic similarity search
- Chunked document embedding
- Relevant context retrieval based on meaning, not just keywords

Implementation:
- Embed user queries using text-embedding-ada-002 or similar
- Store embeddings in vector-enabled database (Postgres + pgvector)
- Retrieve top-k similar chunks for injection into context

### 5.11 Additional Model Providers
Support for more LLM providers beyond the initial set:
- **Claude 4** (Anthropic) - Sonnet and Opus variants, extended thinking
- **GPT-5** (OpenAI) - verbosity control, web search, native multi-modal
- **DeepSeek R1** - reasoning-focused, cost-effective
- **DeepSeek V3.2** - balanced reasoning and efficiency
- **Gemini 2.5** (Google) - thinking mode, image generation

### 5.12 Computer Use
Agents can interact with computers like humans - moving cursors, clicking buttons, typing text. Powered by Anthropic's Computer Use API.

Features:
- Screenshot capture and analysis
- Mouse/keyboard control
- Execute commands in sandboxed environment

Note: Requires additional security considerations (sandboxing, approval workflows).

### 5.13 External Tools
Beyond the built-in tools, agents can access:

**Code Execution:**
- Execute Python/Node.js code in sandboxed environment
- Get results back for analysis
- Useful for data processing, calculations

**File Operations:**
- Read/write files to agent workspace
- List directory contents
- File search and filtering

**API Integrations:**
- Custom REST API calls
- Webhook handlers
- Third-party service connectors (Slack, GitHub, etc.)

### 5.14 Memory Provider Integrations
External memory services can be integrated for enhanced recall:

**Mem0:**
- Self-growing memory layer
- Automatic extraction of memories from conversations
- Semantic search across memory store

**Letta:**
- Persistent long-term memory
- Core memory, archival memory, recall
- Agent persona management

**Supermemory:**
- Long-term memory via semantic search
- Easy memory addition and retrieval
- Public/shared memory pools

### 5.15 Agent Skills
Runtime-loaded specialized capabilities from markdown files. Skills are discovered at startup and can be activated when relevant.

Skill structure:
```
my-skill/
├── SKILL.md          # Instructions + metadata
├── scripts/          # Executable code (optional)
├── references/      # Documentation (optional)
└── assets/          # Templates, resources (optional)
```

The agent loads only skill names/descriptions at startup. Full instructions load on demand when a skill matches the user's request.

### 5.16 Natural Language SQL
Agents can query databases using natural language. The agent:
1. Takes a user's question in plain English
2. Generates a SQL query using the LLM
3. Executes against the database
4. Returns results formatted for the user

Features:
- Schema-aware query generation
- Query explanation in plain English
- Automatic chart generation for results visualization
- Support for Postgres with pgvector

---

## 6. Data Model (Convex)

```
agents
  _id, name, description, systemPrompt, model, tools[], memoryMode, createdAt

agentVersions
  _id, agentId, version, config{}, createdAt

runs
  _id, agentId, agentVersion, input, output, status, totalTokens, durationMs, parentRunId?, createdAt

steps
  _id, runId, stepNumber, prompt, completion, toolCalls[], tokenUsage{}, durationMs, createdAt

toolResults
  _id, stepId, toolName, input, output, durationMs, error?

memory
  _id, agentId, content, updatedAt

embeddings (for RAG)
  _id, agentId, resourceId?, content, embedding (vector), createdAt

resources (source material for RAG)
  _id, agentId, content, source, createdAt
```

**Extended Schema (Phase 2+):**
- `subagentRuns` — tracks parent-child agent relationships
- `generatedImages` — stores image outputs with metadata
- `skillDefinitions` — discovered skills loaded at startup
- `uploadedFiles` — user uploads for multi-modal processing

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
Custom tool authoring in-browser. Full memory mode. Subagents. Run comparison (A/B two agents on same input). Export runs as JSON. Multi-modal input support.

**Phase 3 — Advanced Capabilities**
Image generation. Enhanced RAG with vector embeddings. More model providers (Claude 4, GPT-5, DeepSeek). Computer use. External tools (code execution, file ops).

**Phase 4 — Ecosystem**
Memory provider integrations (Mem0, Letta, Supermemory). Agent Skills for runtime-loaded capabilities. Natural language SQL queries. Public agent gallery.

---

## 10. Out of Scope

- Multi-user auth (Phase 1 is single-user / local)
- Billing or usage metering
- Drag-and-drop visual workflow builder
- Mobile UI
- Production-grade computer use without sandboxing
- Direct database access without approval workflow

---

## 11. Success Metrics

- Time from clone to first agent run: < 5 minutes
- Steps visible in UI within 500ms of `onStepFinish` firing
- Zero data loss on run failures (every step written before the next begins)
- Developer NPS: "I'd use this again when building a new agent"
