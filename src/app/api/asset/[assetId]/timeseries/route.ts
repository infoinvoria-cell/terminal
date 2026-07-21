import { NextRequest, NextResponse } from "next/server";

function generateOhlcv(bars = 80) {
  const points = [];
  let price = 100 + Math.random() * 900;
  const now = Date.now();
  for (let i = bars - 1; i >= 0; i--) {
    const t = new Date(now - i * 24 * 60 * 60 * 1000).toISOString();
    const change = (Math.random() - 0.49) * price * 0.018;
    const open = price;
    const close = Math.max(price + change, 1);
    const high = Math.max(open, close) * (1 + Math.random() * 0.008);
    const low = Math.min(open, close) * (1 - Math.random() * 0.008);
    const volume = Math.round(10000 + Math.random() * 90000);
    points.push({ t, open: +open.toFixed(4), high: +high.toFixed(4), low: +low.toFixed(4), close: +close.toFixed(4), volume });
    price = close;
  }
  return points;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  const { assetId } = await params;
  return NextResponse.json({
    assetId,
    symbol: assetId.toUpperCase(),
    updatedAt: new Date().toISOString(),
    ohlcv: generateOhlcv(80),
    supplyDemand: { demand: [], supply: [] },
  });
}
