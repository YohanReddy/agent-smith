import { ConvexHttpClient } from "convex/browser";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const fullMemoryTurnSchema = z.array(
  z.object({
    role: z.union([z.literal("user"), z.literal("assistant")]),
    content: z.string(),
  }),
);

const FULL_MEMORY_TURN_LIMIT = 40;
const SUMMARY_MEMORY_MAX_CHARS = 30_000;

export type ConversationTurn = { role: "user" | "assistant"; content: string };

export function parseFullMemory(raw: string | undefined): ConversationTurn[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    const result = fullMemoryTurnSchema.safeParse(parsed);
    return result.success ? result.data : [];
  } catch {
    return [];
  }
}

function formatSummaryMemory(existing: string | undefined, input: string, output: string) {
  const entry = `[${new Date().toISOString()}]\nInput: ${input.slice(0, 200)}\nOutput: ${output.slice(0, 500)}`;
  const next = existing ? `${existing}\n\n---\n${entry}` : entry;
  return next.slice(-SUMMARY_MEMORY_MAX_CHARS);
}

function formatFullMemory(existing: string | undefined, input: string, output: string) {
  const turns = parseFullMemory(existing);
  const nextTurns = [...turns, { role: "user" as const, content: input }, { role: "assistant" as const, content: output }]
    .slice(-FULL_MEMORY_TURN_LIMIT);
  return JSON.stringify(nextTurns);
}

export async function persistMemory(
  convex: ConvexHttpClient,
  agentId: Id<"agents">,
  mode: "none" | "summary" | "full",
  input: string,
  output: string,
) {
  if (!output || mode === "none") return;
  const existing = await convex.query(api.memory.get, { agentId });
  const content =
    mode === "full"
      ? formatFullMemory(existing?.content, input, output)
      : formatSummaryMemory(existing?.content, input, output);
  await convex.mutation(api.memory.set, { agentId, content });
}

export function renderFullMemoryForPrompt(raw: string | undefined) {
  const turns = parseFullMemory(raw);
  if (!turns.length) return "(no memory yet)";
  return turns
    .map((turn) => `${turn.role === "user" ? "User" : "Assistant"}: ${turn.content}`)
    .join("\n\n");
}
