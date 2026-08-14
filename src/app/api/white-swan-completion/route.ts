import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const FILES = [
  'instrument-resolution',
  'component-audit-full',
  'eurusd-filter-framework',
  'portfolio-risk-weights',
  'investor-capital',
  'serkan-precheck',
  'seasonal-component-audit',
  'capital-variants-final',
] as const;

type FileKey = typeof FILES[number];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = (searchParams.get('type') ?? 'investor-capital') as FileKey;

  if (!FILES.includes(type)) {
    return NextResponse.json({ error: `Unknown type: ${type}. Valid: ${FILES.join(', ')}` }, { status: 400 });
  }

  const publicPath = path.join(/* turbopackIgnore: true */ process.cwd(), 'public', 'data', 'white-swan', 'final-completion', `${type}.json`);

  try {
    const raw = JSON.parse(fs.readFileSync(publicPath, 'utf8'));
    return NextResponse.json(raw);
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
