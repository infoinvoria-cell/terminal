import { NextResponse } from "next/server";
import { getProviderStatuses } from "@/lib/sentinel/sentinel-router";

export const runtime = "nodejs";

export async function GET() {
  try {
    const status = await getProviderStatuses(null);
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
