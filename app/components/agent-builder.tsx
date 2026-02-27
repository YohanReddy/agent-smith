"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AVAILABLE_TOOLS } from "@/tools";
import type { Id } from "@/convex/_generated/dataModel";

const MODELS = [
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", provider: "Anthropic" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", provider: "Anthropic" },
  { id: "claude-opus-4-6", label: "Claude Opus 4.6", provider: "Anthropic" },
  { id: "gpt-4o", label: "GPT-4o", provider: "OpenAI" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini", provider: "OpenAI" },
];

const defaultForm = {
  name: "",
  description: "",
  systemPrompt: "You are a helpful assistant.",
  model: "claude-sonnet-4-6",
  tools: [] as string[],
  memoryMode: "none" as "none" | "summary" | "full",
  maxSteps: 10,
};

interface Props {
  editId: Id<"agents"> | null;
  onClose: () => void;
}

export function AgentBuilder({ editId, onClose }: Props) {
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);

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
      });
    }
  }, [existingAgent]);

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editId) {
        await update({ id: editId, ...form });
      } else {
        await create(form);
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
      {/* backdrop */}
      <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* drawer */}
      <div className="w-[460px] bg-[#111] border-l border-zinc-800 flex flex-col overflow-hidden">
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

          <Field label="System Prompt" hint="use {{memory}} to inject agent memory">
            <textarea
              className="input w-full h-36 resize-none font-mono text-xs leading-relaxed"
              placeholder="You are a helpful assistant."
              value={form.systemPrompt}
              onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
            />
          </Field>

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

          <div className="grid grid-cols-2 gap-5">
            <Field label="Max Steps">
              <input
                type="number"
                className="input w-full"
                min={1}
                max={50}
                value={form.maxSteps}
                onChange={(e) => setForm({ ...form, maxSteps: Number(e.target.value) })}
              />
            </Field>
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
            disabled={!form.name.trim() || saving}
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
        {hint && <span className="text-[10px] text-zinc-800">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
