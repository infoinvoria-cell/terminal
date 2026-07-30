import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let input = "";
  try {
    const body = await request.json() as { password?: unknown };
    input = typeof body.password === "string" ? body.password.trim() : "";
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const expected = (process.env.SIMPLE_GATE_PASSWORD ?? "inno").trim();
  const valid = secureEqual(input, expected);
  return NextResponse.json(
    { ok: valid },
    {
      status: valid ? 200 : 401,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

function secureEqual(input: string, expected: string) {
  const inputBuffer = Buffer.from(input);
  const expectedBuffer = Buffer.from(expected);
  return inputBuffer.length === expectedBuffer.length
    && timingSafeEqual(inputBuffer, expectedBuffer);
}
