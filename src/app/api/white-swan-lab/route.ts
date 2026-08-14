import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const capital = searchParams.get('capital');
  const type = searchParams.get('type') || 'variants';

  const phase = searchParams.get('phase') || 'v1';
  const subDir = phase === 'v2' ? 'portfolio-lab-v2' : 'portfolio-lab';
  // turbopackIgnore: data files live outside src/ and are not bundled
  const base = path.join(/* turbopackIgnore: true */ process.cwd(), 'workspace', 'output', 'white-swan', subDir);

  try {
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
