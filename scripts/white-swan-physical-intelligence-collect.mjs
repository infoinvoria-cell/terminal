import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getCurrentPhysicalSnapshot } from "../src/lib/white-swan/physical-intelligence/service.ts";

const root = process.cwd();
const snapshot = await getCurrentPhysicalSnapshot();
const date = snapshot.generatedAt.slice(0, 10);
const dir = path.join(root, "data", "white-swan", "physical-intelligence", "forward");
await mkdir(dir, { recursive: true });
let file = path.join(dir, `${date}.json`);
try {
  await access(file);
  file = path.join(dir, `${date}-v2.json`);
} catch {
  // The first snapshot for a date remains the canonical append-only record.
}
try {
  await writeFile(file, `${JSON.stringify(snapshot, null, 2)}\n`, { flag: "wx" });
  console.log(`Physical Intelligence snapshot appended: ${path.relative(root, file)}`);
} catch (error) {
  if (error?.code === "EEXIST") throw new Error(`append-only guard: ${file} already exists`);
  throw error;
}
