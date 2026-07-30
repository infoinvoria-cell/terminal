import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
loadEnv({ path: join(REPO_ROOT, ".env.local") });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const assets = ["FDAX1!_2H", "FDAX1!_1H", "6E1!_30M", "6B1!_30M"];
for (const asset of assets) {
  const { error, count } = await db.from("monitoring_ohlc").delete().eq("asset", asset).select("date", { count: "exact", head: true });
  if (error) console.error(`  ❌ ${asset}: ${error.message}`);
  else console.log(`  ✅ Deleted all rows for ${asset}`);
}
console.log("Cleanup done.");
