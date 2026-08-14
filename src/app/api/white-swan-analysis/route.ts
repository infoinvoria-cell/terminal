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

function tryReadJson(filePath: string) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}
function tryReadCsv(filePath: string) {
  try { return parseCsv(fs.readFileSync(filePath, 'utf8')); } catch { return []; }
}

export async function GET() {
  // Primary: local workspace (dev). Fallback: public/data (Vercel).
  const workspaceBase = path.join(/* turbopackIgnore: true */ process.cwd(), 'workspace', 'output', 'white-swan', 'analysis');
  const publicBase = path.join(/* turbopackIgnore: true */ process.cwd(), 'public', 'data', 'white-swan', 'analysis');
  const base = fs.existsSync(workspaceBase) ? workspaceBase : publicBase;

  const capitalScenarios = tryReadJson(path.join(base, 'capital-scenarios.json')) ?? [];
  const riskMetrics = tryReadJson(path.join(base, 'risk-metrics.json')) ?? {};
  const yearlyAnalysis = tryReadCsv(path.join(base, 'yearly-cost-analysis.csv'));
  const strategyBreakdown = tryReadCsv(path.join(base, 'strategy-cost-breakdown.csv'));
  const costSensitivity = tryReadCsv(path.join(base, 'cost-sensitivity.csv'));

  return NextResponse.json({
    capitalScenarios,
    riskMetrics,
    yearlyAnalysis,
    strategyBreakdown,
    costSensitivity,
  });
}
