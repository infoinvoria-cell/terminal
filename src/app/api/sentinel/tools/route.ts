export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { SENTINEL_TOOLS, executeTool } from "@/lib/sentinel/sentinel-tools";

export async function GET() {
  const tools = SENTINEL_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
  return NextResponse.json({ tools });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { toolName?: string; input?: unknown };
    const { toolName, input } = body;
    if (!toolName || typeof toolName !== "string") {
      return NextResponse.json({ error: "toolName required" }, { status: 400 });
    }
    const toolExists = SENTINEL_TOOLS.some((t) => t.name === toolName);
    if (!toolExists) {
      return NextResponse.json({ error: `Unknown tool: ${toolName}` }, { status: 404 });
    }
    const result = await executeTool(toolName, input ?? {});
    if (result.error) {
      return NextResponse.json({ error: result.error, durationMs: result.durationMs }, { status: 500 });
    }
    return NextResponse.json({ result: result.result, durationMs: result.durationMs });
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
}
