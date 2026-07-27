// worker/env.mjs — MUST be imported before any module that reads process.env
// (providers.mjs builds its config at import time). Loads worker/.env (provider
// keys) and the repo .env.local (Supabase) so local runs need no extra setup.
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { config } from "dotenv";

const HERE = dirname(fileURLToPath(import.meta.url));
config({ path: join(HERE, ".env") });
config({ path: join(HERE, "..", ".env.local") });
