import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    return await ctx.db
      .query("runs")
      .withIndex("by_agent", (q) => q.eq("agentId", agentId))
      .order("desc")
      .take(50);
  },
});

export const get = query({
  args: { id: v.id("runs") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

export const listSteps = query({
  args: { runId: v.id("runs") },
  handler: async (ctx, { runId }) => {
    return await ctx.db
      .query("steps")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .order("asc")
      .collect();
  },
});

export const create = mutation({
  args: {
    agentId: v.id("agents"),
    agentVersion: v.number(),
    input: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("runs", { ...args, status: "running" });
  },
});

export const setHitlState = mutation({
  args: {
    id: v.id("runs"),
    hitlState: v.string(),
  },
  handler: async (ctx, { id, hitlState }) => {
    await ctx.db.patch(id, { hitlState });
  },
});

export const addStep = mutation({
  args: {
    runId: v.id("runs"),
    stepNumber: v.number(),
    stepName: v.optional(v.string()),
    stepType: v.optional(v.string()),
    groupId: v.optional(v.string()),
    text: v.optional(v.string()),
    toolCalls: v.optional(
      v.array(
        v.object({
          toolName: v.string(),
          args: v.string(),
          result: v.string(),
        }),
      ),
    ),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    finishReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("steps", args);
  },
});

export const complete = mutation({
  args: {
    id: v.id("runs"),
    output: v.string(),
    totalTokens: v.number(),
    durationMs: v.number(),
  },
  handler: async (ctx, { id, ...rest }) => {
    await ctx.db.patch(id, { status: "completed", hitlState: undefined, ...rest });
  },
});

export const remove = mutation({
  args: { id: v.id("runs") },
  handler: async (ctx, { id }) => {
    const steps = await ctx.db
      .query("steps")
      .withIndex("by_run", (q) => q.eq("runId", id))
      .collect();
    await Promise.all(steps.map((s) => ctx.db.delete(s._id)));
    await ctx.db.delete(id);
  },
});

export const fail = mutation({
  args: {
    id: v.id("runs"),
    error: v.string(),
    durationMs: v.number(),
  },
  handler: async (ctx, { id, ...rest }) => {
    await ctx.db.patch(id, { status: "failed", hitlState: undefined, ...rest });
  },
});
