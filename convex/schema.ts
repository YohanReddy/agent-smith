import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  agents: defineTable({
    name: v.string(),
    description: v.string(),
    systemPrompt: v.string(),
    model: v.string(),
    tools: v.array(v.string()),
    memoryMode: v.union(v.literal("none"), v.literal("summary"), v.literal("full")),
    maxSteps: v.number(),
    latestVersion: v.number(),
  }).index("by_name", ["name"]),

  agentVersions: defineTable({
    agentId: v.id("agents"),
    version: v.number(),
    name: v.string(),
    description: v.string(),
    systemPrompt: v.string(),
    model: v.string(),
    tools: v.array(v.string()),
    memoryMode: v.union(v.literal("none"), v.literal("summary"), v.literal("full")),
    maxSteps: v.number(),
  })
    .index("by_agent", ["agentId"])
    .index("by_agent_version", ["agentId", "version"]),

  runs: defineTable({
    agentId: v.id("agents"),
    agentVersion: v.number(),
    input: v.string(),
    output: v.optional(v.string()),
    status: v.union(
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("stopped"),
    ),
    totalTokens: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    error: v.optional(v.string()),
  }).index("by_agent", ["agentId"]),

  steps: defineTable({
    runId: v.id("runs"),
    stepNumber: v.number(),
    text: v.optional(v.string()),
    toolCalls: v.optional(
      v.array(
        v.object({
          toolName: v.string(),
          args: v.string(), // JSON-stringified
          result: v.string(), // JSON-stringified
        }),
      ),
    ),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    finishReason: v.optional(v.string()),
  }).index("by_run", ["runId"]),

  memory: defineTable({
    agentId: v.id("agents"),
    content: v.string(),
  }).index("by_agent", ["agentId"]),
});
