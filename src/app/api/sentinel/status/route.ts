import { NextResponse } from "next/server";
import { getProviderStatuses } from "@/lib/sentinel/sentinel-router";

export const runtime = "nodejs";

export async function GET() {
  try {
    const status = await getProviderStatuses(null);
    const buildSha = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
    const buildBranch = process.env.VERCEL_GIT_COMMIT_REF ?? null;
    return NextResponse.json({ ...status, buildSha, buildBranch });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
