import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const capital = searchParams.get('capital');
  const type = searchParams.get('type') || 'variants';

  const phase = searchParams.get('phase') || 'v1';
  const subDir = phase === 'pb' ? 'portfolio-lab-pb' : phase === 'v4' ? 'portfolio-lab-v4' : phase === 'v3' ? 'portfolio-lab-v3' : phase === 'v2' ? 'portfolio-lab-v2' : 'portfolio-lab';
  // Primary: local workspace (development). Fallback: public/data (Vercel production).
  // turbopackIgnore comments prevent NFT from tracing entire project
  const workspacePath = path.join(/* turbopackIgnore: true */ process.cwd(), 'workspace', 'output', 'white-swan', subDir);
  const publicPath = path.join(/* turbopackIgnore: true */ process.cwd(), 'public', 'data', 'white-swan', subDir);
  const base = fs.existsSync(workspacePath) ? workspacePath : publicPath;

  try {
    if (type === 'lookahead-reference') {
      const raw = JSON.parse(fs.readFileSync(path.join(base, 'lookahead-reference.json'), 'utf8'));
      const variants = Array.isArray(raw) ? raw : (raw.variants ?? []);
      return NextResponse.json({ variants });
    }

    if (type === 'finalists') {
      const raw = JSON.parse(fs.readFileSync(path.join(base, 'finalists.json'), 'utf8'));
      const finalists = Array.isArray(raw) ? raw : Object.values(raw).flat();
      return NextResponse.json({ finalists });
    }

    // Cross-capital top-5 comparison (used by comparison table)
    if (type === 'comparison') {
      const CAPS = [10000, 12500, 15000, 20000];
      const comparison: Record<string, unknown[]> = {};
      for (const cap of CAPS) {
        const raw = JSON.parse(fs.readFileSync(path.join(base, `capital-${cap}.json`), 'utf8'));
        const variants = (Array.isArray(raw) ? raw : (raw.variants ?? [])) as Record<string, unknown>[];
        comparison[String(cap)] = variants.slice(0, 5).map((v) => {
          const { navSeries: _, ...rest } = v;
          return rest;
        });
      }
      return NextResponse.json({ comparison });
    }

    if (capital) {
      const filename = `capital-${capital}.json`;
      const raw = JSON.parse(fs.readFileSync(path.join(base, filename), 'utf8'));
      const variants = Array.isArray(raw) ? raw : (raw.variants ?? []);
      return NextResponse.json({ variants, capital: Number(capital) });
    }

    const raw = JSON.parse(fs.readFileSync(path.join(base, 'variants.json'), 'utf8'));
    const all = Array.isArray(raw) ? raw : (raw.variants ?? []);
    const stripped = all.map((v: Record<string, unknown>) => {
      const { navSeries: _, ...rest } = v;
      return rest;
    });
    return NextResponse.json({ variants: stripped });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
