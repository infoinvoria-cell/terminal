import fs from "node:fs";
import path from "node:path";
import { getSentinelEnvConfig } from "./providers/provider-status";

const LOG_REL = "09_AI/Sentinel_Access_Log.md";

// Files in the Brain that Sentinel reads when brain context is loaded
const BRAIN_CONTEXT_FILES = [
  "09_AI/AI_PROJECT_BRAIN_CURRENT.md",
  "09_AI/dashboard_snapshot.json",
  "00_Index/Open Issues.md",
  "00_Index/Next Actions.md",
];

function sanitize(name: string): string {
  return name.replace(/[[\]|#^]/g, "").trim();
}

/**
 * Called from the chat route after a brain-context load.
 * Appends wikilinks to the Sentinel Access Log so the graph gains edges
 * from the log node to each accessed file node — growing the net over usage.
 */
export function trackSentinelBrainAccess(question: string): void {
  try {
    const brainPath = getSentinelEnvConfig().brainPath;
    if (!brainPath) return;

    const logPath = path.join(brainPath, LOG_REL);

    // Determine which files actually exist and were read
    const accessedLinks = BRAIN_CONTEXT_FILES
      .filter((rel) => {
        try { return fs.existsSync(path.join(brainPath, rel)); } catch { return false; }
      })
      .map((rel) => {
        const name = path.basename(rel, path.extname(rel));
        return `[[${sanitize(name)}]]`;
      });

    if (accessedLinks.length === 0) return;

    const now = new Date().toISOString().replace("T", " ").slice(0, 16);
    const snippet = question.length > 80 ? question.slice(0, 80) + "…" : question;
    const entry = `\n## ${now}\n> ${snippet}\n${accessedLinks.join("  ")}\n`;

    // Ensure file exists with a header on first write
    if (!fs.existsSync(logPath)) {
      fs.writeFileSync(
        logPath,
        `# Sentinel Access Log\n\nAutomatisch generiert — zeigt welche Brain-Dateien Sentinel pro Anfrage gelesen hat.\n${entry}`,
        "utf8"
      );
    } else {
      fs.appendFileSync(logPath, entry, "utf8");
    }
  } catch {
    // Non-critical — never throw
  }
}
