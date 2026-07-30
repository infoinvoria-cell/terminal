import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, "../../.env.local") });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const { data } = await db.from("monitoring_ohlc").select("date,open,high,low,close")
  .eq("asset","YM1!").eq("timeframe","D").order("date",{ascending:false}).limit(30);
console.log("YM1! 1D last 30 rows:");
for (const r of data??[]) {
  const c = Number(r.close), l = Number(r.low), h = Number(r.high);
  const bad = l < c*0.5 || c < 5000 || h > c*2 || l <= 0;
  console.log(`  ${r.date}  C=${c}  H=${h}  L=${l}${bad?" *** CORRUPT ***":""}`);
}
const ticks = (data??[]).filter(r=>String(r.date).endsWith("Z"));
console.log(`\nTick-built rows: ${ticks.length}`);
