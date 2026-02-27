import { tool } from "ai";
import { z } from "zod";
import { ConvexHttpClient } from "convex/browser";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AVAILABLE_TOOLS, type ToolName } from "./registry";

export { AVAILABLE_TOOLS, ToolName };
const MAX_FETCH_BYTES = 8000;
const REQUEST_TIMEOUT_MS = 8000;

function isPrivateIpv4(ip: string) {
  const [a, b] = ip.split(".").map(Number);
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isPrivateIpv6(ip: string) {
  const lower = ip.toLowerCase();
  return lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80");
}

function isBlockedHostname(hostname: string) {
  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".localhost") || lower.endsWith(".local")) return true;
  if (lower.endsWith(".internal")) return true;
  return false;
}

async function validateExternalHttpUrl(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http/https URLs are allowed");
  }
  if (url.username || url.password) {
    throw new Error("Credentialed URLs are not allowed");
  }
  if (isBlockedHostname(url.hostname)) {
    throw new Error("Blocked hostname");
  }

  const ipType = isIP(url.hostname);
  if (ipType === 4 && isPrivateIpv4(url.hostname)) {
    throw new Error("Private IPv4 addresses are blocked");
  }
  if (ipType === 6 && isPrivateIpv6(url.hostname)) {
    throw new Error("Private IPv6 addresses are blocked");
  }
  if (!ipType) {
    const resolved = await lookup(url.hostname, { all: true });
    if (!resolved.length) throw new Error("Host could not be resolved");
    for (const addr of resolved) {
      if ((addr.family === 4 && isPrivateIpv4(addr.address)) || (addr.family === 6 && isPrivateIpv6(addr.address))) {
        throw new Error("Resolved host points to a private network");
      }
    }
  }

  return url.toString();
}

async function readBodyWithLimit(response: Response, maxBytes: number) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let out = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      throw new Error(`Response too large (>${maxBytes} bytes)`);
    }
    out += decoder.decode(value, { stream: true });
  }
  out += decoder.decode();
  return out;
}

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
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
          const res = await (async () => {
            try {
              return await fetch("https://api.tavily.com/search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                signal: controller.signal,
                body: JSON.stringify({
                  api_key: apiKey,
                  query: input.query,
                  max_results: 5,
                  include_answer: true,
                }),
              });
            } finally {
              clearTimeout(timeout);
            }
          })();
          if (!res.ok) {
            return `Search failed with status ${res.status}`;
          }
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
          const safeUrl = await validateExternalHttpUrl(input.url);
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
          const res = await (async () => {
            try {
              return await fetch(safeUrl, {
                headers: { "User-Agent": "Mozilla/5.0 (compatible; AgentSmith/1.0)" },
                signal: controller.signal,
              });
            } finally {
              clearTimeout(timeout);
            }
          })();
          if (!res.ok) {
            return `Error fetching URL: HTTP ${res.status}`;
          }
          const contentType = res.headers.get("content-type") ?? "";
          if (
            contentType &&
            !contentType.includes("text/html") &&
            !contentType.includes("text/plain") &&
            !contentType.includes("application/xhtml+xml")
          ) {
            return `Error fetching URL: unsupported content type ${contentType}`;
          }

          const text = await readBodyWithLimit(res, MAX_FETCH_BYTES);
          const stripped = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
          return stripped.slice(0, MAX_FETCH_BYTES);
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
