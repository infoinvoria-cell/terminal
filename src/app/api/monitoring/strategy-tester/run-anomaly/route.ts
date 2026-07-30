import { NextResponse } from "next/server";

// Anomaly strategy engines (GC1! Gold Friday Long, GLD Gold Thursday Long,
// YM1! Dow Jones TAT) are not yet defined. Registry status: PLACEHOLDER.
// This endpoint returns a structured status per asset instead of a generic 503
// so the UI can distinguish "unavailable" from "engine not registered."

const ANOMALY_ENGINE_STATUS = {
  "GC1!": {
    engineStatus:    "missing" as const,
    registryStatus:  "MISSING",
    signalAllowed:   false,
    blockingReason:  "No approved strategy engine registered for GC1! anomaly",
    notes:           "Waiting for Codex output — metals_energy/GC1 strategy definition pending",
  },
  GLD: {
    engineStatus:    "missing" as const,
    registryStatus:  "MISSING",
    signalAllowed:   false,
    blockingReason:  "No approved strategy engine registered for GLD anomaly",
    notes:           "Not in strategy registry; single-source data (Supabase only)",
  },
  "YM1!": {
    engineStatus:    "placeholder" as const,
    registryStatus:  "PLACEHOLDER",
    signalAllowed:   false,
    blockingReason:  "No approved strategy engine registered for YM1! anomaly",
    notes:           "ANOMALY_4 registry entry exists but is PLACEHOLDER — not yet defined",
  },
};

export async function GET() {
  return NextResponse.json(
    {
      endpoint:     "run-anomaly",
      available:    false,
      signalAllowed: false,
      engines:      ANOMALY_ENGINE_STATUS,
      message:
        "Anomaly strategy engines are not yet defined. " +
        "No signals may be computed or displayed until engines are registered and approved.",
    },
    { status: 503 },
  );
}

export async function POST() {
  return NextResponse.json(
    {
      endpoint:     "run-anomaly",
      available:    false,
      signalAllowed: false,
      engines:      ANOMALY_ENGINE_STATUS,
      message:
        "Anomaly strategy engines are not yet defined. " +
        "No signals may be computed or displayed until engines are registered and approved.",
    },
    { status: 503 },
  );
}
