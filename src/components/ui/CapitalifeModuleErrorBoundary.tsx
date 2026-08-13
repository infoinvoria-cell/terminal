"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { CapitalifeStatusPanel } from "@/components/ui/CapitalifeStatusPanel";
import { getErrorCode, logClientFailure } from "@/lib/runtime/capitalife-errors";

type Props = {
  route: string;
  module: string;
  children: ReactNode;
};

type State = {
  error: Error | null;
  retryKey: number;
};

function isChunkLoadError(error: Error | null): boolean {
  if (!error) return false;
  const message = `${error.name} ${error.message}`;
  return /ChunkLoadError|Loading chunk|Failed to load chunk|Importing a module script failed/i.test(message);
}

export class CapitalifeModuleErrorBoundary extends Component<Props, State> {
  state: State = { error: null, retryKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logClientFailure({
      route: this.props.route,
      module: this.props.module,
      error: `${error.message}\n${info.componentStack}`,
      errorCode: getErrorCode(error, "MODULE_RUNTIME_ERROR"),
    });
  }

  private reset = () => {
    this.setState((state) => ({ error: null, retryKey: state.retryKey + 1 }));
  };

  render() {
    if (this.state.error) {
      const code = getErrorCode(this.state.error, "MODULE_RUNTIME_ERROR");
      return (
        <CapitalifeStatusPanel
          tone="error"
          title={`${this.props.module} ist lokal ausgefallen`}
          detail={`Route: ${this.props.route} • Modul: ${this.props.module} • Code: ${code}`}
          action={
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={this.reset}
                style={{
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.04)",
                  color: "#f5f6fa",
                  padding: "9px 16px",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Retry Modul
              </button>
              {isChunkLoadError(this.state.error) ? (
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  style={{
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.04)",
                    color: "#f5f6fa",
                    padding: "9px 16px",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  Neu laden
                </button>
              ) : null}
            </div>
          }
        />
      );
    }

    return <div key={this.state.retryKey} className="min-h-0 flex-1 overflow-hidden">{this.props.children}</div>;
  }
}
