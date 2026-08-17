import { NextResponse } from "next/server";
import { isPublicPreview } from "@/lib/server/app-mode";
import type { MobileSentinelStatus } from "@/lib/mobile/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse<MobileSentinelStatus>> {
  const preview = isPublicPreview();

  // Active provider is determined at runtime by the Sentinel router — expose
  // only whether it is available, not internal routing details or credentials.
  const hasProvider = !!(
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.GROQ_API_KEY
  );

  return NextResponse.json({
    available: hasProvider,
    activeProvider: hasProvider ? "anthropic" : null,
    mode: preview ? "public-preview" : "local-private",
  });
}
