"use client";

import { CapitalifeStatusPanel } from "@/components/ui/CapitalifeStatusPanel";
import { getErrorCode, logClientFailure } from "@/lib/runtime/capitalife-errors";

function ActionButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
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
      {children}
    </button>
  );
}

export function CapitalifeRouteErrorScreen({
  error,
  reset,
  route,
  module,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  route: string;
  module: string;
}) {
  const errorCode = error.digest ?? getErrorCode(error, "ROUTE_ERROR");

  logClientFailure({
    route,
    module,
    error,
    errorCode,
  });

  return (
    <CapitalifeStatusPanel
      tone="error"
      title="Capitalife konnte diesen Bereich nicht laden"
      detail={`Route: ${route} • Modul: ${module} • Code: ${errorCode}`}
      action={
        <div style={{ display: "flex", gap: 10 }}>
          <ActionButton onClick={reset}>Retry</ActionButton>
          <ActionButton onClick={() => window.location.reload()}>Neu laden</ActionButton>
        </div>
      }
    />
  );
}
