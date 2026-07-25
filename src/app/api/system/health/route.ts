export const runtime = "edge";
import { NextResponse } from "next/server";
export async function GET() { return NextResponse.json({ status: "ok" }); }
export async function POST() { return NextResponse.json({ error: "unavailable in cloud preview" }, { status: 503 }); }
