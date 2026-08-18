import { NextResponse } from "next/server";
import { getCapabilityRegistry, PERMISSIONS } from "@/lib/sentinel/capability-registry";

export const runtime = "nodejs";

export async function GET() {
  try {
    const capabilities = getCapabilityRegistry();
    return NextResponse.json({ capabilities, permissions: PERMISSIONS });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
