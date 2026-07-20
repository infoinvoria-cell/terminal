import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getCapitalifeBrainPath } from "@/lib/brain/brain-path";

const DASHBOARD_ROOT = process.cwd();

// Curated high-priority files for common topics
const TOPIC_MAP: Record<string, { files: string[]; reason: string }[]> = {
  "signal": [
    { files: ["src/components/pages/SignalPage.tsx"], reason: "Signal-Seite Hauptkomponente" },
    { files: ["src/lib/signal/signalPageData.ts"], reason: "Signal-Daten-Adapter" },
    { files: ["src/lib/monitoring/monitoringSignalJump.ts"], reason: "Monitoring-Jump-Logik" },
  ],
  "monitoring": [
    { files: ["src/components/monitoring/MonitoringStrategyWorkspace.tsx"], reason: "Monitoring-Tester-UI" },
    { files: ["src/app/api/monitoring/strategy-tester/run-invest/route.ts"], reason: "Invest-Tester-API" },
  ],
  "chf": [
    { files: ["src/app/api/monitoring/strategy-tester/run-invest/route.ts"], reason: "CHF/6S TV CSV Parser" },
    { files: ["src/components/monitoring/MonitoringStrategyWorkspace.tsx"], reason: "CHF Tester UI + Status" },
    { files: ["public/generated/monitoring/strategies/CME_6S1_tv_backtest_2026-04-26.csv"], reason: "CHF TV CSV Quelle (490 Trades)" },
  ],
  "invest": [
    { files: ["src/app/api/monitoring/strategy-tester/run-invest/route.ts"], reason: "Invest-Adapter + TV CSV" },
    { files: ["src/components/monitoring/MonitoringStrategyWorkspace.tsx"], reason: "Invest-Tester-Workspace" },
  ],
  "hydration": [
    { files: ["src/components/dashboard/fund-manager-home.tsx"], reason: "Hydration-Fix: Suspense entfernt" },
    { files: ["src/components/dashboard/sidebar.tsx"], reason: "Sidebar aria-current" },
  ],
};

function findRelevantFiles(query: string): Array<{ file: string; reason: string; priority: number }> {
  const lower = query.toLowerCase();
  const results: Array<{ file: string; reason: string; priority: number }> = [];
  let priority = 10;
  const brainRoot = getCapitalifeBrainPath();

  for (const [topic, entries] of Object.entries(TOPIC_MAP)) {
    if (lower.includes(topic)) {
      for (const entry of entries) {
        for (const file of entry.files) {
          const fullPath = path.join(DASHBOARD_ROOT, file);
          const exists = fs.existsSync(fullPath);
          results.push({ file, reason: entry.reason, priority: exists ? priority : priority - 5 });
          priority--;
        }
      }
    }
  }

  // Always include key index files from Brain
  const brainAlways = [
    "00_Index/AI Read First.md",
    "00_Index/Open Issues.md",
    "00_Index/Next Actions.md",
  ];
  for (const bf of brainAlways) {
    const exists = brainRoot ? fs.existsSync(path.join(brainRoot, bf)) : false;
    results.push({ file: `[Brain] ${bf}`, reason: "Immer lesen: Index / Status", priority: exists ? 5 : 0 });
  }

  return results.sort((a, b) => b.priority - a.priority);
}

function buildMarkdown(query: string, files: Array<{ file: string; reason: string; priority: number }>): string {
  const now = new Date().toISOString().slice(0, 10);
  const lines = [
    `# AI Context Pack`,
    `**Query:** ${query}`,
    `**Erstellt:** ${now}`,
    `**Hinweis:** Dieser Context Pack ist ein Index, keine Wahrheit. Lies die Dateien direkt für aktuelle Inhalte.`,
    ``,
    `## Empfohlene Dateien`,
    ``,
  ];
  for (const { file, reason, priority } of files) {
    lines.push(`- **${file}** — ${reason} (Priorität: ${priority})`);
  }
  lines.push(``);
  lines.push(`## Security`);
  lines.push(`- Keine Secrets in diesem Pack.`);
  lines.push(`- Keine OHLC-Daten.`);
  lines.push(`- Keine Handoff-Bundles gelesen.`);
  return lines.join("\n");
}

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let query = "";
  try {
    const body = await req.json() as { query?: string };
    query = (body.query ?? "").trim().slice(0, 200);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!query) return NextResponse.json({ error: "query required" }, { status: 400 });

  const files = findRelevantFiles(query);
  const markdown = buildMarkdown(query, files);
  const brainRoot = getCapitalifeBrainPath();
  const handoffRoot = brainRoot ? path.join(brainRoot, "_ChatGPT_Handoff") : null;

  // Write to handoff dir (fire-and-forget — non-blocking)
  if (handoffRoot) {
    fs.promises.mkdir(handoffRoot, { recursive: true })
      .then(() => fs.promises.writeFile(path.join(handoffRoot, "AI_Context_Pack.md"), markdown, "utf8"))
      .catch(() => { /* non-fatal */ });
  }

  return NextResponse.json({ files, preview: markdown });
}
