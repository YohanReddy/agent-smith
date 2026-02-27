/**
 * Router workflow: classifies the input and routes to a specialized handler.
 *
 * workflowConfig JSON:
 * {
 *   "routes": [
 *     { "type": "technical", "description": "Technical questions about code or systems", "systemPrompt": "You are a technical expert..." },
 *     { "type": "billing", "description": "Questions about billing, payments, or pricing", "systemPrompt": "You are a billing specialist..." },
 *     { "type": "general", "description": "General questions or anything else", "systemPrompt": "You are a helpful assistant..." }
 *   ]
 * }
 *
 * The agent's systemPrompt is used for the router/classifier.
 */
import { generateText, Output } from "ai";
import { z } from "zod";
import { getModel, parseConfig, writeStep, type WorkflowContext, type WorkflowResult } from "./types";

type Route = { type: string; description: string; systemPrompt: string };
type RouterConfig = { routes?: Route[] };
const routeSchema = z.object({
  type: z.string().min(1),
  description: z.string().min(1),
  systemPrompt: z.string().min(1),
});
const routerConfigSchema = z.object({
  routes: z.array(routeSchema).optional(),
});

const DEFAULT_ROUTES: Route[] = [
  { type: "technical", description: "Technical or analytical questions", systemPrompt: "You are a precise technical expert. Provide detailed, accurate technical responses." },
  { type: "creative", description: "Creative writing or brainstorming", systemPrompt: "You are a creative writer. Provide imaginative, engaging responses." },
  { type: "general", description: "General questions or conversation", systemPrompt: "You are a helpful, friendly assistant." },
];

export async function runRouter(ctx: WorkflowContext): Promise<WorkflowResult> {
  const { agent, input, runId, convex } = ctx;
  const config = parseConfig<RouterConfig>(agent.workflowConfig, routerConfigSchema, {
    routes: DEFAULT_ROUTES,
  });
  const routes = config.routes?.length ? config.routes : DEFAULT_ROUTES;
  const model = getModel(agent.model);

  let totalTokens = 0;

  const routeTypes = routes.map((r) => r.type) as [string, ...string[]];
  const classificationSchema = z.object({
    routeType: z.enum(routeTypes).describe("The selected route type"),
    reasoning: z.string().describe("Why this route was chosen"),
    complexity: z.enum(["simple", "moderate", "complex"]).describe("Estimated complexity"),
  });

  // Step 1: Classify the input
  const t0 = Date.now();
  const routeDescriptions = routes
    .map((r) => `- ${r.type}: ${r.description}`)
    .join("\n");

  const { output: classification, usage: classUsage } = await generateText({
    model,
    system: agent.systemPrompt || "You are an intelligent router. Classify the input and choose the best handler.",
    output: Output.object({ schema: classificationSchema }),
    prompt: `Classify this input and choose the best route:\n\n"${input}"\n\nAvailable routes:\n${routeDescriptions}`,
  });

  totalTokens += (classUsage?.inputTokens ?? 0) + (classUsage?.outputTokens ?? 0);

  await writeStep(convex, {
    runId,
    stepNumber: 1,
    stepName: `Route → ${classification.routeType}`,
    stepType: "classification",
    text: `Routed to **${classification.routeType}** (${classification.complexity})\n${classification.reasoning}`,
    inputTokens: classUsage?.inputTokens,
    outputTokens: classUsage?.outputTokens,
    durationMs: Date.now() - t0,
    finishReason: "stop",
  });

  // Step 2: Execute the matched route
  const matchedRoute =
    routes.find((r) => r.type === classification.routeType) ?? routes[routes.length - 1];

  const tr = Date.now();
  const { text: response, usage: respUsage } = await generateText({
    model,
    system: matchedRoute.systemPrompt,
    prompt: input,
  });

  totalTokens += (respUsage?.inputTokens ?? 0) + (respUsage?.outputTokens ?? 0);

  await writeStep(convex, {
    runId,
    stepNumber: 2,
    stepName: `Respond (${matchedRoute.type})`,
    stepType: "response",
    text: response,
    inputTokens: respUsage?.inputTokens,
    outputTokens: respUsage?.outputTokens,
    durationMs: Date.now() - tr,
    finishReason: "stop",
  });

  return { output: response, totalTokens };
}
