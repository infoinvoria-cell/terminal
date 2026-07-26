"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode; fallback?: ReactNode };
type State = { error: Error | null; recovering: boolean };

// Stale-chunk errors happen when a new deploy/rebuild changes chunk hashes while
// a tab still references old ones. A React re-render can't fix it — only a hard
// page reload fetches the current HTML + chunk map.
function isChunkLoadError(error: Error | null): boolean {
  if (!error) return false;
  const name = String(error.name || "");
  const msg = String(error.message || "");
  return (
    name === "ChunkLoadError" ||
    /Loading chunk|Failed to load chunk|error loading dynamically imported module|Importing a module script failed/i.test(msg)
  );
}

const RELOAD_GUARD_KEY = "clf_chunk_reload_ts";

export class GlobeErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null, recovering: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[GlobeErrorBoundary]", error, info.componentStack);

    if (isChunkLoadError(error) && typeof window !== "undefined") {
      // Auto-reload once per 10s window to recover from stale chunks without
      // risking an infinite reload loop if the chunk is genuinely broken.
      try {
        const last = Number(window.sessionStorage.getItem(RELOAD_GUARD_KEY) || 0);
        if (Date.now() - last > 10000) {
          window.sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
          this.setState({ recovering: true });
          window.location.reload();
        }
      } catch {
        /* sessionStorage unavailable — fall through to manual reload UI */
      }
    }
  }

  render() {
    if (this.state.error) {
      const chunk = isChunkLoadError(this.state.error);
      return this.props.fallback ?? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[#0c0d10] text-center">
          <div className="text-2xl">🌐</div>
          <p className="text-sm font-semibold text-white">Globe konnte nicht geladen werden</p>
          <p className="max-w-xs text-[11px] text-zinc-500">
            {this.state.recovering
              ? "Neue Version erkannt — lade neu…"
              : chunk
                ? "Eine neue Version ist verfügbar. Bitte neu laden."
                : this.state.error.message ?? "Unbekannter Fehler"}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-2 rounded-md border border-white/10 px-4 py-1.5 text-xs text-zinc-400 hover:border-white/25 hover:text-white"
          >
            Neu laden
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
