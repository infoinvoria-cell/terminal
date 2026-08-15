import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const BASE = /* turbopackIgnore: true */ path.join(process.cwd(), 'public', 'data', 'white-swan', 'portfolio-dashboard');

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') ?? 'summary';
  const cap = searchParams.get('capital');

  let filePath: string;
  if (type === 'capital' && cap) {
    filePath = path.join(BASE, `cap-${cap}.json`);
  } else {
    filePath = path.join(BASE, 'summary.json');
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return NextResponse.json(JSON.parse(raw));
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
