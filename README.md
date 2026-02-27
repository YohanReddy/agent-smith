# Agent Smith

Agent Smith is an AI agent workbench built with Next.js, Convex, and AI SDK v6.

You can define agents, run them with different workflow strategies, and inspect every run/step in real time.

## Stack

- Next.js (App Router)
- Convex (persistence + realtime queries)
- AI SDK v6 (`ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`)
- TypeScript + Tailwind CSS

## Local Development

1. Install dependencies:
```bash
bun install
```

2. Start Convex in one terminal:
```bash
bunx convex dev
```

3. Start Next.js in another terminal:
```bash
bun run dev
```

4. Open `http://localhost:3000`.

## Environment Variables

Required:
- `NEXT_PUBLIC_CONVEX_URL`

Optional:
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `TAVILY_API_KEY` (enables `web_search` tool)

## Scripts

- `bun run dev`
- `bun run build`
- `bun run start`
- `bun run lint`

## Core Features

- Agent builder with model, tools, memory mode, and workflow config
- Standard tool-using agent runs with streaming output
- Workflow runs: `chain`, `parallel`, `orchestrator`, `evaluator`, `router`
- Run history and step-by-step trace
- Memory modes:
  - `none`
  - `summary` (compact appended summaries)
  - `full` (turn history reused in future runs)
