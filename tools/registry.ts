export const AVAILABLE_TOOLS = [
  { name: "web_search", description: "Search the web for current information" },
  { name: "fetch_url", description: "Fetch the text content of a URL" },
  { name: "read_memory", description: "Read the agent's persisted memory" },
  { name: "write_memory", description: "Write to the agent's persisted memory" },
] as const;

export type ToolName = (typeof AVAILABLE_TOOLS)[number]["name"];
