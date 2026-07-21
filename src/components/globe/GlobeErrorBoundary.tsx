"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode; fallback?: ReactNode };
type State = { error: Error | null };

export class GlobeErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[GlobeErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return this.props.fallback ?? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[#0c0d10] text-center">
          <div className="text-2xl">🌐</div>
          <p className="text-sm font-semibold text-white">Globe konnte nicht geladen werden</p>
          <p className="max-w-xs text-[11px] text-zinc-500">
            {this.state.error.message ?? "Unbekannter Fehler"}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
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
