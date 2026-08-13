/**
 * Atomic JSON write helper.
 * Writes to a temp file then renames — prevents partial writes.
 */

import { writeFileSync, mkdirSync, renameSync } from "fs";
import { dirname, resolve } from "path";
import { randomBytes } from "crypto";
import os from "os";

export function atomicWriteJson(filePath: string, data: unknown): void {
  const abs = resolve(filePath);
  mkdirSync(dirname(abs), { recursive: true });
  const tmp = resolve(os.tmpdir(), `tr_${randomBytes(8).toString("hex")}.tmp`);
  writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  renameSync(tmp, abs);
}
