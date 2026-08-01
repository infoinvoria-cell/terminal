import { NextRequest, NextResponse } from "next/server";
import deepResults from "@/data/capitalife/deep_validation_results.json";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ patternId: string }> },
) {
  const { patternId } = await params;
  const candidates = (deepResults as any).candidates as any[];
  const match = candidates.find((c: any) => c.id === patternId);

  if (!match) {
    return NextResponse.json(
      { error: "Pattern not found", available: candidates.map((c: any) => c.id) },
      { status: 404 },
    );
  }

  return NextResponse.json(match);
}
