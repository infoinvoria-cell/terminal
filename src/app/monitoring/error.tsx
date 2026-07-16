"use client";
export default function MonitoringError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-zinc-400">
      <p className="text-sm">Monitoring error: {error.message}</p>
      <button onClick={reset} className="text-xs px-3 py-1 border border-white/10 rounded hover:border-white/20">
        Retry
      </button>
    </div>
  );
}
