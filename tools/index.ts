import { tool } from "ai";
import { z } from "zod";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export const AVAILABLE_TOOLS = [
  { name: "web_search", description: "Search the web for current information" },
  { name: "fetch_url", description: "Fetch the text content of a URL" },
  { name: "read_memory", description: "Read the agent's persisted memory" },
  { name: "write_memory", description: "Write to the agent's persisted memory" },
] as const;

export type ToolName = (typeof AVAILABLE_TOOLS)[number]["name"];

export function createTools(convex: ConvexHttpClient, agentId: string) {
  return {
    web_search: tool({
      description: "Search the web for current information",
      inputSchema: z.object({
        query: z.string().describe("The search query"),
      }),
      outputSchema: z.string(),
      execute: async (input): Promise<string> => {
        const apiKey = process.env.TAVILY_API_KEY;
        if (!apiKey) return "web_search requires TAVILY_API_KEY to be set.";
        try {
          const res = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              api_key: apiKey,
              query: input.query,
              max_results: 5,
              include_answer: true,
            }),
          });
          const data = await res.json() as { answer?: string; results?: Array<{ title: string; url: string; content: string }> };
          const results = (data.results ?? [])
            .map((r) => `${r.title}\n${r.url}\n${r.content}`)
            .join("\n\n");
          return data.answer ? `${data.answer}\n\nSources:\n${results}` : results;
        } catch (e) {
          return `Error: ${e}`;
        }
      },
    }),

    fetch_url: tool({
      description: "Fetch the text content of a URL",
      inputSchema: z.object({
        url: z.string().url().describe("The URL to fetch"),
      }),
      outputSchema: z.string(),
      execute: async (input): Promise<string> => {
        try {
          const res = await fetch(input.url, {
            headers: { "User-Agent": "Mozilla/5.0 (compatible; AgentSmith/1.0)" },
          });
          const text = await res.text();
          const stripped = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
          return stripped.slice(0, 8000);
        } catch (e) {
          return `Error fetching URL: ${e}`;
        }
      },
    }),

    read_memory: tool({
      description: "Read the agent's persisted memory from previous runs",
      inputSchema: z.object({}),
      outputSchema: z.string(),
      execute: async (): Promise<string> => {
        try {
          const memory = await convex.query(api.memory.get, {
            agentId: agentId as Id<"agents">,
          });
          return memory?.content ?? "(no memory stored)";
        } catch (e) {
          return `Error reading memory: ${e}`;
        }
      },
    }),

    write_memory: tool({
      description: "Write to the agent's persisted memory (replaces existing content)",
      inputSchema: z.object({
        content: z.string().describe("The content to store in memory"),
      }),
      outputSchema: z.string(),
      execute: async (input): Promise<string> => {
        try {
          await convex.mutation(api.memory.set, {
            agentId: agentId as Id<"agents">,
            content: input.content,
          });
          return "Memory updated.";
        } catch (e) {
          return `Error writing memory: ${e}`;
        }
      },
    }),
  };
}

export function getEnabledTools(toolNames: string[], convex: ConvexHttpClient, agentId: string) {
  const all = createTools(convex, agentId);
  return Object.fromEntries(
    Object.entries(all).filter(([name]) => toolNames.includes(name)),
  );
}
