"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY_ANTHROPIC = "byok:anthropic";
const STORAGE_KEY_OPENAI = "byok:openai";

export function getStoredApiKeys() {
  if (typeof window === "undefined") return { anthropic: "", openai: "" };
  return {
    anthropic: localStorage.getItem(STORAGE_KEY_ANTHROPIC) ?? "",
    openai: localStorage.getItem(STORAGE_KEY_OPENAI) ?? "",
  };
}

interface Props {
  onClose: () => void;
}

export function ApiKeysPanel({ onClose }: Props) {
  const [anthropicKey, setAnthropicKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const keys = getStoredApiKeys();
    setAnthropicKey(keys.anthropic);
    setOpenaiKey(keys.openai);
  }, []);

  function handleSave() {
    if (anthropicKey.trim()) {
      localStorage.setItem(STORAGE_KEY_ANTHROPIC, anthropicKey.trim());
    } else {
      localStorage.removeItem(STORAGE_KEY_ANTHROPIC);
    }
    if (openaiKey.trim()) {
      localStorage.setItem(STORAGE_KEY_OPENAI, openaiKey.trim());
    } else {
      localStorage.removeItem(STORAGE_KEY_OPENAI);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden />

      <div className="w-[420px] bg-[var(--panel)] border-l border-[var(--border)] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)] shrink-0">
          <h2 className="text-[11px] font-medium text-[var(--muted)] uppercase tracking-widest font-mono">
            API Keys
          </h2>
          <button
            type="button"
            aria-label="Close API keys panel"
            onClick={onClose}
            className="text-[var(--muted)] hover:text-[var(--foreground)] text-xl leading-none transition-colors w-6 h-6 flex items-center justify-center"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <p className="text-[11px] text-[var(--muted)] font-mono leading-relaxed">
            Keys are stored in your browser only and sent with each run request. Leave blank to use the server&apos;s configured keys.
          </p>

          <div>
            <label className="block text-[10px] font-medium text-[var(--muted)] uppercase tracking-widest font-mono mb-1.5">
              Anthropic API Key
            </label>
            <input
              type="password"
              className="input w-full font-mono text-xs"
              placeholder="sk-ant-..."
              value={anthropicKey}
              onChange={(e) => setAnthropicKey(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-[10px] text-[var(--muted-soft)] font-mono mt-1">Used for Claude Haiku models</p>
          </div>

          <div>
            <label className="block text-[10px] font-medium text-[var(--muted)] uppercase tracking-widest font-mono mb-1.5">
              OpenAI API Key
            </label>
            <input
              type="password"
              className="input w-full font-mono text-xs"
              placeholder="sk-proj-..."
              value={openaiKey}
              onChange={(e) => setOpenaiKey(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-[10px] text-[var(--muted-soft)] font-mono mt-1">Used for GPT-4.1 mini models</p>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-[var(--border)] shrink-0">
          <button
            type="button"
            onClick={handleSave}
            className="w-full py-2.5 text-xs font-medium uppercase tracking-widest bg-emerald-700 hover:bg-emerald-600 text-white rounded transition-colors"
          >
            {saved ? "saved" : "save keys"}
          </button>
        </div>
      </div>
    </div>
  );
}
