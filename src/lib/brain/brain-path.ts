import path from "node:path";

function envText(value: string | undefined | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function getCapitalifeBrainPath(): string | null {
  return envText(process.env.CAPITALIFE_BRAIN_PATH);
}

export function getInvoriaDashboardPath(): string | null {
  return envText(process.env.INVORIA_DASHBOARD_PATH);
}

export function joinBrainPath(...segments: string[]): string | null {
  const root = getCapitalifeBrainPath();
  return root ? path.join(root, ...segments) : null;
}
