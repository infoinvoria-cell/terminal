"use client";

import { CapitalifeRouteErrorScreen } from "@/components/ui/CapitalifeRouteErrorScreen";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", background: "#0c0d10" }}>
        <CapitalifeRouteErrorScreen
          error={error}
          reset={reset}
          route="global"
          module="root-layout"
        />
      </body>
    </html>
  );
}
