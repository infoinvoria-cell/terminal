import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "node_modules", "three-globe", "example", "img", "earth-blue-marble.jpg");
    const image = await readFile(filePath);
    return new NextResponse(image, { headers: { "Cache-Control": "public, max-age=86400", "Content-Type": "image/jpeg" } });
  } catch {
    return NextResponse.json({ error: "local earth texture unavailable" }, { status: 503 });
  }
}
