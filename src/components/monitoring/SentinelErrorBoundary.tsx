"use client";

import { Component, type ReactNode, type CSSProperties } from "react";

type Props = { children: ReactNode };
type State = { crashed: boolean; errorMsg: string };

const styles: Record<string, CSSProperties> = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    gap: 10,
    padding: 24,
    background: "#060709",
    color: "#8b94a2",
    fontSize: 13,
    fontFamily: "system-ui, sans-serif",
  },
  title: { fontSize: 14, color: "#d0d6e0", fontWeight: 600, margin: 0 },
  detail: { fontSize: 11, color: "#ff6b72", margin: 0, maxWidth: 280, textAlign: "center", wordBreak: "break-word" },
  btn: {
    marginTop: 8,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#c8d0dc",
    padding: "8px 18px",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 12,
    fontFamily: "inherit",
  },
};

/**
 * Isolates SentinelPanel crashes from the rest of Monitoring.
 * On error: minimal fallback + history-reset button.
 * Uses inline styles only — no styled-jsx in class components.
 */
export default class SentinelErrorBoundary extends Component<Props, State> {
  state: State = { crashed: false, errorMsg: "" };

  static getDerivedStateFromError(err: unknown): State {
    return {
      crashed: true,
      errorMsg: err instanceof Error ? err.message : String(err),
    };
  }

  componentDidCatch(err: unknown, info: unknown) {
    console.error("[SentinelErrorBoundary] caught:", err, info);
  }

  handleReset = () => {
    try {
      const keys = [
        "monitoring_sentinel_history",
        "monitoring_sentinel_favorite_prompts",
        "monitoring_sentinel_draft",
        "monitoring_sentinel_fullscreen",
        "monitoring_sentinel_muted",
      ];
      keys.forEach(k => {
        try { window.localStorage.removeItem(k); } catch { /* ignore */ }
      });
    } catch { /* ignore */ }
    this.setState({ crashed: false, errorMsg: "" });
  };

  render() {
    if (!this.state.crashed) return this.props.children;

    return (
      <div style={styles.wrap}>
        <p style={styles.title}>Sentinel konnte nicht geladen werden.</p>
        {this.state.errorMsg ? (
          <p style={styles.detail}>{this.state.errorMsg}</p>
        ) : null}
        <button type="button" style={styles.btn} onClick={this.handleReset}>
          Sentinel zurücksetzen
        </button>
      </div>
    );
  }
}
