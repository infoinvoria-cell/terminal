export const runtime = "edge";
import { NextResponse } from "next/server";
// Brain equity is only available when CAPITALIFE_BRAIN_PATH is mounted locally.
// Return 200 with empty pts so the client resolves cleanly without a console error.
export async function GET() { return NextResponse.json({ pts: [], status: "unavailable" }); }
export async function POST() { return NextResponse.json({ pts: [], status: "unavailable" }); }
