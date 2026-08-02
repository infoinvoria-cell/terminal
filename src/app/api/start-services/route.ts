import { NextResponse } from "next/server";
import { exec } from "node:child_process";

// Only available in local dev — not on Vercel edge.
// Starts the Flask bridge as a detached background process.
export const dynamic = "force-dynamic";

const FLASK_BRIDGE =
  'cd /d "C:\\Users\\joris\\Documents\\Capitalife Engine\\bridge" && start /min python app.py';

export async function POST() {
  // In cloud/edge env, we can't spawn local processes — return a safe no-op.
  if (process.env.VERCEL || process.env.NEXT_PUBLIC_VERCEL_ENV) {
    return NextResponse.json({ started: false, reason: "cloud-env" });
  }

  try {
    exec(FLASK_BRIDGE, { shell: "cmd.exe", windowsHide: true });
    return NextResponse.json({ started: true });
  } catch (err) {
    return NextResponse.json({ started: false, reason: String(err) }, { status: 500 });
  }
}

export async function GET() {
  // Health proxy — check if Flask is reachable from server-side.
  try {
    const res = await fetch("http://localhost:5000/health", {
      signal: AbortSignal.timeout(2000),
    });
    const data = await res.json() as Record<string, unknown>;
    return NextResponse.json({ ok: true, flask: data });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
