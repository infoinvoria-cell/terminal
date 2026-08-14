import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const capital = searchParams.get('capital');
  const type = searchParams.get('type');

  const workspacePath = path.join(/* turbopackIgnore: true */ process.cwd(), 'workspace', 'output', 'white-swan', 'final-normalized');
  const publicPath = path.join(/* turbopackIgnore: true */ process.cwd(), 'public', 'data', 'white-swan', 'final-normalized');
  const base = fs.existsSync(workspacePath) ? workspacePath : publicPath;

  try {
    if (type === 'summary' || !capital) {
      const raw = JSON.parse(fs.readFileSync(path.join(base, 'summary.json'), 'utf8'));
      return NextResponse.json(raw);
    }

    const raw = JSON.parse(fs.readFileSync(path.join(base, `capital-${capital}.json`), 'utf8'));
    return NextResponse.json(raw);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
