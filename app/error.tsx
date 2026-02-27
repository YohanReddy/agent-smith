"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="h-screen bg-[var(--background)] text-[var(--foreground)] grid place-items-center p-6">
      <section className="w-full max-w-lg border border-[var(--border)] rounded-md bg-[var(--panel)] p-5">
        <h1 className="text-sm font-mono text-[var(--muted-strong)]">run failed</h1>
        <p className="mt-2 text-xs text-[var(--muted)] break-words">{error.message}</p>
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
