import { NextResponse } from "next/server";
import { isPublicPreview } from "@/lib/server/app-mode";
import type { MobileSystemHealth } from "@/lib/mobile/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse<MobileSystemHealth>> {
  const preview = isPublicPreview();
  const brainConfigured = !preview && !!process.env.CAPITALIFE_BRAIN_PATH?.trim();

  // Quick Supabase reachability check (no credentials exposed)
  let supabaseAvailable = false;
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    if (url) {
      const res = await fetch(`${url}/rest/v1/`, { method: "HEAD", signal: AbortSignal.timeout(3000) });
      supabaseAvailable = res.ok || res.status === 401; // 401 = reachable, auth required
    }
  } catch {
    // unreachable or not configured
  }

  const health: MobileSystemHealth = {
    status: "ok",
    mode: preview ? "public-preview" : "local-private",
    brain: {
      available: brainConfigured,
      pathConfigured: brainConfigured,
    },
    supabase: {
      available: supabaseAvailable,
    },
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(health);
}
