import { NextResponse } from 'next/server';
import path from 'node:path';
import fs from 'node:fs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function parseCsv(text: string): Record<string, string | number>[] {
  const lines = text.split('\n').filter(Boolean);
  if (lines.length < 2) return [];
  const cols = lines[0].split(',').map((c) => c.trim());
  return lines.slice(1).map((row) => {
    const vals = row.split(',');
    return Object.fromEntries(
      cols.map((c, i) => {
        const raw = vals[i]?.trim() ?? '';
        const num = Number(raw);
        return [c, raw === '' || isNaN(num) ? raw : num];
      })
    );
  });
}

export async function GET() {
  try {
    const base = path.join(process.cwd(), 'workspace/output/white-swan/analysis');

    const capitalScenarios = JSON.parse(
      fs.readFileSync(path.join(base, 'capital-scenarios.json'), 'utf8')
    );
    const riskMetrics = JSON.parse(
      fs.readFileSync(path.join(base, 'risk-metrics.json'), 'utf8')
    );
    const yearlyAnalysis = parseCsv(
      fs.readFileSync(path.join(base, 'yearly-cost-analysis.csv'), 'utf8')
    );
    const strategyBreakdown = parseCsv(
      fs.readFileSync(path.join(base, 'strategy-cost-breakdown.csv'), 'utf8')
    );
    const costSensitivity = parseCsv(
      fs.readFileSync(path.join(base, 'cost-sensitivity.csv'), 'utf8')
    );

    return NextResponse.json({
      capitalScenarios,
      riskMetrics,
      yearlyAnalysis,
      strategyBreakdown,
      costSensitivity,
    });
  } catch (err) {
    console.error('white-swan-analysis route error:', err);
    return NextResponse.json({ error: 'Failed to load analysis data' }, { status: 500 });
  }
}
