import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

function tryRead(filePath: string) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') ?? 'eurusd';

  const workspacePath = path.join(/* turbopackIgnore: true */ process.cwd(), 'workspace', 'output', 'white-swan', 'portfolio-lab-pb');
  const publicPath = path.join(/* turbopackIgnore: true */ process.cwd(), 'public', 'data', 'white-swan', 'portfolio-lab-pb');
  const base = fs.existsSync(workspacePath) ? workspacePath : publicPath;

  const fileMap: Record<string, string> = {
    eurusd: 'eurusd-robustness.json',
    dax2h: 'dax2h-robustness.json',
    dax1h: 'dax1h-robustness.json',
    gld: 'gld-robustness.json',
    zw: 'zw-robustness.json',
    seasonals: 'seasonals-ranking.json',
  };

  const file = fileMap[type];
  if (!file) return NextResponse.json({ error: 'unknown type' }, { status: 400 });

  const data = tryRead(path.join(base, file));
  if (!data) return NextResponse.json({ data: null, unavailable: true });
  return NextResponse.json({ data });
}
