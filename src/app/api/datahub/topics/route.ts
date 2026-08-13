import { NextResponse } from "next/server"
import { getDataHub } from "@/lib/datahub"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const hub = getDataHub()
    const topics = hub.listTopics()
    return NextResponse.json({
      count: topics.length,
      topics,
      serverTimeUtc: new Date().toISOString(),
    })
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500 },
    )
  }
}
