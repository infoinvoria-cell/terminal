/**
 * Generate static seasonality cache JSON files for Vercel deployment.
 * Calls the local dev server API and saves results to public/generated/seasonality/.
 *
 * Run: node scripts/generate-seasonality-cache.mjs
 * Requires: dev server running at localhost:3000
 */

import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const OUTPUT_DIR = join(projectRoot, 'public', 'generated', 'seasonality');
const BASE_URL = 'http://localhost:3000';

const LOOKBACKS = [20, 15, 10, 5];

// All enabled asset IDs from the seasonality registry
const ASSET_IDS = [
  // Agrar (CSV in workspace/output/tradingview_data_test/)
  'wheat', 'corn', 'soybeans', 'cocoa', 'coffee', 'sugar', 'cotton', 'orangejuice',
  // Aktien (CSV in trading_dashboard/data/raw/history_parts/)
  'aapl', 'msft', 'nvda', 'goog', 'meta', 'amzn',
  // FX — Yahoo fallback where available
  'fx_6a1', 'fx_6b1', 'fx_6c1', 'fx_6e1', 'fx_6j1', 'fx_6n1', 'fx_6s1', 'dxy',
  // Energie
  'ng1', 'cl1',
  // Metalle
  'gc1', 'si1', 'hg1', 'pl1', 'pa1',
  // Indizes
  'nq1', 'es1', 'fdax1', 'rty1', 'ym1', 'us30usd',
];

async function fetchAction(action, assetId, lookbackYears) {
  try {
    const res = await fetch(`${BASE_URL}/api/seasonality/walk-forward`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, assetId, lookbackYears }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('application/json')) return null;
    const data = await res.json();
    if (data?.error) return null;
    return data;
  } catch {
    return null;
  }
}

async function generateForAsset(assetId, lookback) {
  // Only store the seasonal curve — patternIndex is too large (~3MB per asset).
  // The component renders the chart from seasonalCurve; patternIndex is loaded
  // on-demand locally when the user interacts with the pattern scanner.
  const seasonalCurve = await fetchAction('loadSeasonalChart', assetId, lookback);

  if (!seasonalCurve?.points) return false;

  const cache = {
    _source: 'static_generated',
    _generatedAt: new Date().toISOString(),
    assetId,
    lookback,
    seasonalCurve,
    patternIndex: null,
  };

  const filename = `${assetId}_${lookback}y_cache.json`;
  await writeFile(join(OUTPUT_DIR, filename), JSON.stringify(cache));
  return true;
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const results = { ok: [], skipped: [] };

  for (const assetId of ASSET_IDS) {
    for (const lookback of LOOKBACKS) {
      const ok = await generateForAsset(assetId, lookback);
      if (ok) {
        console.log(`  [ok] ${assetId} ${lookback}y`);
        results.ok.push(`${assetId}_${lookback}y`);
      } else {
        console.log(`  [--] ${assetId} ${lookback}y — no data`);
        results.skipped.push(`${assetId}_${lookback}y`);
      }
    }
  }

  // Write a manifest
  await writeFile(
    join(OUTPUT_DIR, '_manifest.json'),
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      files: results.ok.map(k => `${k}_cache.json`),
      count: results.ok.length,
    }, null, 2),
  );

  console.log(`\nDone: ${results.ok.length} generated, ${results.skipped.length} skipped`);
  console.log(`Output: ${OUTPUT_DIR}`);
}

main().catch(err => { console.error(err); process.exit(1); });
