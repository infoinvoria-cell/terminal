export type CapitalifeLogPayload = {
  route: string;
  module: string;
  errorCode: string;
  timestamp: string;
  requestId?: string | null;
  detail?: string;
};

function normalizeUnknown(error: unknown): { code: string; detail: string } {
  if (error instanceof Error) {
    return {
      code: error.name && error.name !== "Error" ? error.name : "UNEXPECTED_ERROR",
      detail: error.message || "Unknown error",
    };
  }
  if (typeof error === "string") {
    return { code: "STRING_ERROR", detail: error };
  }
  return { code: "UNKNOWN_ERROR", detail: JSON.stringify(error) };
}

export function getErrorCode(error: unknown, fallback = "UNEXPECTED_ERROR"): string {
  const normalized = normalizeUnknown(error);
  return normalized.code || fallback;
}

export function logClientFailure(input: {
  route: string;
  module: string;
  error: unknown;
  errorCode?: string;
  requestId?: string | null;
}) {
  const normalized = normalizeUnknown(input.error);
  const payload: CapitalifeLogPayload = {
    route: input.route,
    module: input.module,
    errorCode: input.errorCode ?? normalized.code,
    timestamp: new Date().toISOString(),
    requestId: input.requestId ?? null,
    detail: normalized.detail,
  };
  console.error("[capitalife-client-failure]", payload);
}

export function logServerFailure(input: {
  route: string;
  module: string;
  error: unknown;
  errorCode?: string;
  requestId?: string | null;
}) {
  const normalized = normalizeUnknown(input.error);
  const payload: CapitalifeLogPayload = {
    route: input.route,
    module: input.module,
    errorCode: input.errorCode ?? normalized.code,
    timestamp: new Date().toISOString(),
    requestId: input.requestId ?? null,
    detail: normalized.detail,
  };
  console.error("[capitalife-server-failure]", payload);
}
