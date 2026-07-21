#!/usr/bin/env node
/**
 * Regenerates public/data/components-cache.json from the live /api/components-cache
 * route (single source of truth = src/lib/components/components-data.ts).
 *
 * Requires the dev server running (pm2 "capitalife" on :3000 by default).
 * Override the port with COMPONENTS_CACHE_PORT.
 *
 * Usage: node scripts/build-components-cache.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const port = process.env.COMPONENTS_CACHE_PORT ?? "3000";
const url = `http://localhost:${port}/api/components-cache`;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outFile = join(root, "public", "data", "components-cache.json");

try {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data?.cacheKey || !Array.isArray(data?.groups)) {
    throw new Error("unexpected payload shape");
  }
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log(`[ok] components-cache.json written — cacheKey=${data.cacheKey}, groups=${data.groups.length}`);
} catch (err) {
  console.error(`[fail] could not regenerate cache from ${url}: ${err.message}`);
  console.error("       Is the dev server running? (pm2 status capitalife)");
  process.exit(1);
}
