"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="h-screen bg-[#0a0a0a] text-zinc-100 grid place-items-center p-6">
      <section className="w-full max-w-lg border border-zinc-800 rounded-md bg-[#111] p-5">
        <h1 className="text-sm font-mono text-zinc-300">run failed</h1>
        <p className="mt-2 text-xs text-zinc-500 break-words">{error.message}</p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-4 px-3 py-1.5 text-[11px] font-medium uppercase tracking-widest bg-emerald-700 hover:bg-emerald-600 text-white rounded transition-colors"
        >
          retry
        </button>
      </section>
    </main>
  );
}
