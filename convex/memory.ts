import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const get = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    return await ctx.db
      .query("memory")
      .withIndex("by_agent", (q) => q.eq("agentId", agentId))
      .first();
  },
});

export const set = mutation({
  args: { agentId: v.id("agents"), content: v.string() },
  handler: async (ctx, { agentId, content }) => {
    const existing = await ctx.db
      .query("memory")
      .withIndex("by_agent", (q) => q.eq("agentId", agentId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { content });
    } else {
      await ctx.db.insert("memory", { agentId, content });
    }
  },
});

export const clear = mutation({
  args: { agentId: v.id("agents") },
  handler: async (ctx, { agentId }) => {
    const existing = await ctx.db
      .query("memory")
      .withIndex("by_agent", (q) => q.eq("agentId", agentId))
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
