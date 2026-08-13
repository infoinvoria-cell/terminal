import { NextResponse } from "next/server"
import { getDataHub, getPolicyForTopic } from "@/lib/datahub"

export const dynamic = "force-dynamic"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params
  const topic = slug.join(".")

  if (!topic) {
    return NextResponse.json({ error: "Topic path required" }, { status: 400 })
  }

  try {
    const hub = getDataHub()
    const state = hub.getState(topic)
    const policy = getPolicyForTopic(topic)

    return NextResponse.json({
      topic,
      state,
      policy,
      serverTimeUtc: new Date().toISOString(),
    })
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500 },
    )
  }
}
