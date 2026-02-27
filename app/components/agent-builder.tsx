"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AVAILABLE_TOOLS } from "@/tools/registry";
import type { Id } from "@/convex/_generated/dataModel";

const MODELS = [
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", provider: "Anthropic" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", provider: "Anthropic" },
  { id: "claude-opus-4-6", label: "Claude Opus 4.6", provider: "Anthropic" },
  { id: "gpt-4o", label: "GPT-4o", provider: "OpenAI" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini", provider: "OpenAI" },
];

type WorkflowType = "standard" | "chain" | "parallel" | "orchestrator" | "evaluator" | "router";

const WORKFLOW_TYPES: Array<{
  id: WorkflowType;
  label: string;
  description: string;
  configPlaceholder: string;
  systemPromptHint: string;
}> = [
  {
    id: "standard",
    label: "Standard",
    description: "Multi-step tool loop — the default agentic behavior",
    configPlaceholder: "",
    systemPromptHint: "The agent's main system prompt",
  },
  {
    id: "chain",
    label: "Chain",
    description: "Sequential steps — each output becomes the next step's input",
    configPlaceholder: JSON.stringify(
      {
        steps: [
          { name: "Draft", systemPrompt: "You are a writer. Write a first draft." },
          { name: "Critique", systemPrompt: "You are an editor. Identify weaknesses in the text." },
          { name: "Revise", systemPrompt: "You are a writer. Revise based on the critique above." },
        ],
      },
      null,
      2,
    ),
    systemPromptHint: "Used as fallback if no steps configured",
  },
  {
    id: "parallel",
    label: "Parallel",
    description: "Multiple workers analyze the same input concurrently, then synthesize",
    configPlaceholder: JSON.stringify(
      {
        workers: [
          { name: "Security", systemPrompt: "You are a security expert. Analyze for vulnerabilities." },
          { name: "Performance", systemPrompt: "You are a performance expert. Identify bottlenecks." },
          { name: "Quality", systemPrompt: "You are a quality expert. Review readability and structure." },
        ],
        synthesize: "You are a tech lead. Synthesize the expert reviews into a concise action plan.",
      },
      null,
      2,
    ),
    systemPromptHint: "Not used directly — define workers in config",
  },
  {
    id: "orchestrator",
    label: "Orchestrator",
    description: "Planner breaks the task into subtasks, workers execute in parallel",
    configPlaceholder: JSON.stringify(
      {
        workerSystemPrompt:
          "You are a skilled specialist. Execute the assigned task precisely and thoroughly.",
      },
      null,
      2,
    ),
    systemPromptHint: "Used for the orchestrator/planner LLM call",
  },
  {
    id: "evaluator",
    label: "Evaluator",
    description: "Generate → evaluate quality → improve iteratively until passing score",
    configPlaceholder: JSON.stringify(
      {
        maxIterations: 3,
        passingScore: 8,
        evaluatorSystemPrompt:
          "You are a rigorous quality evaluator. Score responses critically and identify specific improvements.",
      },
      null,
      2,
    ),
    systemPromptHint: "Used for generation and improvement steps",
  },
  {
    id: "router",
    label: "Router",
    description: "Classifies the input then routes to a specialized handler",
    configPlaceholder: JSON.stringify(
      {
        routes: [
          {
            type: "technical",
            description: "Technical or code-related questions",
            systemPrompt: "You are a technical expert. Provide precise, detailed technical responses.",
          },
          {
            type: "creative",
            description: "Creative writing or brainstorming",
            systemPrompt: "You are a creative writer. Provide imaginative, engaging content.",
          },
          {
            type: "general",
            description: "General questions or conversation",
            systemPrompt: "You are a helpful, friendly assistant.",
          },
        ],
      },
      null,
      2,
    ),
    systemPromptHint: "Used for the classifier/router step",
  },
];

const defaultForm = {
  name: "",
  description: "",
  systemPrompt: "You are a helpful assistant.",
  model: "claude-sonnet-4-6",
  tools: [] as string[],
  memoryMode: "none" as "none" | "summary" | "full",
  maxSteps: 10,
  workflowType: "standard" as WorkflowType,
  workflowConfig: "",
};

interface Props {
  editId: Id<"agents"> | null;
  onClose: () => void;
}

export function AgentBuilder({ editId, onClose }: Props) {
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  const existingAgent = useQuery(api.agents.get, editId ? { id: editId } : "skip");
  const create = useMutation(api.agents.create);
  const update = useMutation(api.agents.update);

  useEffect(() => {
    if (existingAgent) {
      setForm({
        name: existingAgent.name,
        description: existingAgent.description,
        systemPrompt: existingAgent.systemPrompt,
        model: existingAgent.model,
        tools: existingAgent.tools,
        memoryMode: existingAgent.memoryMode,
        maxSteps: existingAgent.maxSteps,
        workflowType: (existingAgent.workflowType as WorkflowType) ?? "standard",
        workflowConfig: existingAgent.workflowConfig ?? "",
      });
    }
  }, [existingAgent]);

  const selectedWorkflow = WORKFLOW_TYPES.find((w) => w.id === form.workflowType)!;

  function handleConfigChange(value: string) {
    setForm((f) => ({ ...f, workflowConfig: value }));
    if (!value.trim()) {
      setConfigError(null);
      return;
    }
    try {
      JSON.parse(value);
      setConfigError(null);
    } catch {
      setConfigError("Invalid JSON");
    }
  }

  function handleWorkflowChange(wt: WorkflowType) {
    const wf = WORKFLOW_TYPES.find((w) => w.id === wt)!;
    setForm((f) => ({
      ...f,
      workflowType: wt,
      workflowConfig: wt === "standard" ? "" : wf.configPlaceholder,
    }));
    setConfigError(null);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    if (form.workflowConfig && configError) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        workflowConfig: form.workflowConfig.trim() || undefined,
      };
      if (editId) {
        await update({ id: editId, ...payload });
      } else {
        await create(payload);
      }
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  function toggleTool(name: string) {
    setForm((f) => ({
      ...f,
      tools: f.tools.includes(name) ? f.tools.filter((t) => t !== name) : [...f.tools, name],
    }));
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="w-[480px] bg-[#111] border-l border-zinc-800 flex flex-col overflow-hidden">
        {/* header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 shrink-0">
          <h2 className="text-[11px] font-medium text-zinc-500 uppercase tracking-widest font-mono">
            {editId ? "Edit Agent" : "New Agent"}
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-600 hover:text-zinc-300 text-xl leading-none transition-colors w-6 h-6 flex items-center justify-center"
          >
            ×
          </button>
        </div>

        {/* form */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <Field label="Name">
            <input
              className="input w-full"
              placeholder="Research Agent"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
            />
          </Field>

          <Field label="Description">
            <input
              className="input w-full"
              placeholder="What does this agent do?"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>

          {/* Workflow type */}
          <Field label="Workflow">
            <div className="space-y-1.5">
              {WORKFLOW_TYPES.map((wf) => (
                <label
                  key={wf.id}
                  className={`flex items-start gap-3 cursor-pointer p-2 rounded border transition-colors ${
                    form.workflowType === wf.id
                      ? "border-zinc-600 bg-zinc-900/60"
                      : "border-transparent hover:border-zinc-800"
                  }`}
                >
                  <input
                    type="radio"
                    name="workflowType"
                    value={wf.id}
                    checked={form.workflowType === wf.id}
                    onChange={() => handleWorkflowChange(wf.id)}
                    className="accent-emerald-500 mt-0.5 shrink-0"
                  />
                  <div>
                    <div
                      className={`text-sm font-medium ${
                        form.workflowType === wf.id ? "text-zinc-200" : "text-zinc-500"
                      }`}
                    >
                      {wf.label}
                    </div>
                    <div className="text-[11px] text-zinc-700 mt-0.5">{wf.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </Field>

          <Field
            label="System Prompt"
            hint={selectedWorkflow.systemPromptHint}
          >
            <textarea
              className="input w-full h-28 resize-none font-mono text-xs leading-relaxed"
              placeholder="You are a helpful assistant."
              value={form.systemPrompt}
              onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
            />
          </Field>

          {/* Workflow Config — shown for non-standard workflows */}
          {form.workflowType !== "standard" && (
            <Field
              label="Workflow Config"
              hint={configError ?? "JSON"}
            >
              <textarea
                className={`input w-full h-48 resize-none font-mono text-[11px] leading-relaxed ${
                  configError ? "border-red-800" : ""
                }`}
                placeholder={selectedWorkflow.configPlaceholder}
                value={form.workflowConfig}
                onChange={(e) => handleConfigChange(e.target.value)}
              />
              <button
                type="button"
                onClick={() =>
                  handleConfigChange(selectedWorkflow.configPlaceholder)
                }
                className="mt-1 text-[10px] text-zinc-700 hover:text-zinc-400 transition-colors"
              >
                insert default config
              </button>
            </Field>
          )}

          <Field label="Model">
            <div className="space-y-2">
              {MODELS.map((m) => (
                <label key={m.id} className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="radio"
                    name="model"
                    value={m.id}
                    checked={form.model === m.id}
                    onChange={() => setForm({ ...form, model: m.id })}
                    className="accent-emerald-500 shrink-0"
                  />
                  <span
                    className={`text-sm ${
                      form.model === m.id ? "text-zinc-200" : "text-zinc-500 group-hover:text-zinc-400"
                    } transition-colors`}
                  >
                    {m.label}
                  </span>
                  <span className="text-[10px] text-zinc-700 font-mono ml-auto">{m.provider}</span>
                </label>
              ))}
            </div>
          </Field>

          {/* Tools — only relevant for standard workflow */}
          {form.workflowType === "standard" && (
            <Field label="Tools">
              <div className="space-y-2">
                {AVAILABLE_TOOLS.map((t) => (
                  <label key={t.name} className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={form.tools.includes(t.name)}
                      onChange={() => toggleTool(t.name)}
                      className="mt-0.5 accent-emerald-500 shrink-0"
                    />
                    <div>
                      <div
                        className={`text-sm font-mono ${
                          form.tools.includes(t.name) ? "text-zinc-200" : "text-zinc-600"
                        } transition-colors`}
                      >
                        {t.name}
                      </div>
                      <div className="text-[11px] text-zinc-700 mt-0.5">{t.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </Field>
          )}

          <div className="grid grid-cols-2 gap-5">
            {form.workflowType === "standard" && (
              <Field label="Max Steps">
                <input
                  type="number"
                  className="input w-full"
                  min={1}
                  max={50}
                  value={form.maxSteps}
                  onChange={(e) => {
                    const parsed = Number(e.target.value);
                    const maxSteps = Number.isFinite(parsed)
                      ? Math.max(1, Math.min(50, Math.floor(parsed)))
                      : 10;
                    setForm({ ...form, maxSteps });
                  }}
                />
              </Field>
            )}
            <Field label="Memory Mode">
              <div className="space-y-2 pt-0.5">
                {(["none", "summary", "full"] as const).map((mode) => (
                  <label key={mode} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="memoryMode"
                      value={mode}
                      checked={form.memoryMode === mode}
                      onChange={() => setForm({ ...form, memoryMode: mode })}
                      className="accent-emerald-500"
                    />
                    <span
                      className={`text-sm ${
                        form.memoryMode === mode ? "text-zinc-200" : "text-zinc-600"
                      }`}
                    >
                      {mode}
                    </span>
                  </label>
                ))}
              </div>
            </Field>
          </div>
        </div>

        {/* footer */}
        <div className="px-5 py-4 border-t border-zinc-800 shrink-0">
          <button
            onClick={handleSave}
            disabled={!form.name.trim() || saving || !!configError}
            className="w-full py-2.5 text-xs font-medium uppercase tracking-widest bg-emerald-700 hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded transition-colors"
          >
            {saving ? "saving..." : editId ? "save changes" : "create agent"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1.5">
        <label className="text-[10px] font-medium text-zinc-600 uppercase tracking-widest font-mono">
          {label}
        </label>
        {hint && (
          <span className="text-[10px] text-zinc-800 font-mono">{hint}</span>
        )}
      </div>
      {children}
    </div>
  );
}
