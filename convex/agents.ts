import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const workflowType = v.optional(
  v.union(
    v.literal("standard"),
    v.literal("hitl"),
    v.literal("chain"),
    v.literal("parallel"),
    v.literal("orchestrator"),
    v.literal("evaluator"),
    v.literal("router"),
  ),
);

const agentFields = {
  name: v.string(),
  description: v.string(),
  systemPrompt: v.string(),
  model: v.string(),
  tools: v.array(v.string()),
  memoryMode: v.union(v.literal("none"), v.literal("summary"), v.literal("full")),
  maxSteps: v.number(),
  workflowType,
  workflowConfig: v.optional(v.string()),
};

export const list = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    return await ctx.db
      .query("agents")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();
  },
});

export const get = query({
  args: { id: v.id("agents") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

export const create = mutation({
  args: agentFields,
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const agentId = await ctx.db.insert("agents", {
      ...args,
      latestVersion: 1,
      userId: identity.subject,
    });
    await ctx.db.insert("agentVersions", { agentId, version: 1, ...args });
    return agentId;
  },
});

export const update = mutation({
  args: { id: v.id("agents"), ...agentFields },
  handler: async (ctx, { id, ...rest }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const agent = await ctx.db.get(id);
    if (!agent) throw new Error("Agent not found");
    if (!agent.userId || agent.userId !== identity.subject) throw new Error("Unauthorized");
    const newVersion = agent.latestVersion + 1;
    await ctx.db.patch(id, { ...rest, latestVersion: newVersion });
    await ctx.db.insert("agentVersions", { agentId: id, version: newVersion, ...rest });
  },
});

export const remove = mutation({
  args: { id: v.id("agents") },
  handler: async (ctx, { id }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const agent = await ctx.db.get(id);
    if (!agent) throw new Error("Agent not found");
    if (!agent.userId || agent.userId !== identity.subject) throw new Error("Unauthorized");

    const runs = await ctx.db
      .query("runs")
      .withIndex("by_agent", (q) => q.eq("agentId", id))
      .collect();

    for (const run of runs) {
      const steps = await ctx.db
        .query("steps")
        .withIndex("by_run", (q) => q.eq("runId", run._id))
        .collect();
      await Promise.all(steps.map((step) => ctx.db.delete(step._id)));
      await ctx.db.delete(run._id);
    }

    const versions = await ctx.db
      .query("agentVersions")
      .withIndex("by_agent", (q) => q.eq("agentId", id))
      .collect();
    await Promise.all(versions.map((version) => ctx.db.delete(version._id)));

    const memory = await ctx.db
      .query("memory")
      .withIndex("by_agent", (q) => q.eq("agentId", id))
      .collect();
    await Promise.all(memory.map((entry) => ctx.db.delete(entry._id)));

    await ctx.db.delete(id);
  },
});
