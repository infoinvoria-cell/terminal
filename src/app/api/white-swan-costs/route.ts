import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  const workspacePath = path.join(/* turbopackIgnore: true */ process.cwd(), 'workspace', 'output', 'white-swan', 'ibkr-costs.json');
  const publicPath = path.join(/* turbopackIgnore: true */ process.cwd(), 'public', 'data', 'white-swan', 'ibkr-costs.json');

  for (const p of [workspacePath, publicPath]) {
    try {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      return NextResponse.json({ data });
    } catch { /* try next */ }
  }

  return NextResponse.json({ data: null, unavailable: true });
}
