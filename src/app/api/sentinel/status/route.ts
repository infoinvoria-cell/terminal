import { NextResponse } from "next/server";
import { healthCheckProviders } from "@/lib/sentinel/providers/provider-router";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await healthCheckProviders());
}
