export const runtime = "edge";
import { NextResponse } from "next/server";
export async function GET() { return NextResponse.json({ status: "ok" }); }
export async function POST() { return NextResponse.json({ error: "unavailable" }, { status: 503 }); }
