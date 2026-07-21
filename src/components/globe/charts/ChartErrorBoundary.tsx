"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = { hasError: boolean };

/**
 * Catches render/lifecycle errors in chart subtrees so a bad series never unwinds the whole app.
 */
export default class ChartErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Chart crash", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          style={{
            height: "100%",
            minHeight: 80,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: 0.75,
            fontSize: 12,
            color: "#94a3b8",
          }}
        >
          Chart error
        </div>
      );
    }
    return this.props.children;
  }
}
