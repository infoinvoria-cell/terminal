import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TARGETS = ["src", "public", "content", "Capitalife_Strategy_Bible"];
const TEXT_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md", ".mdx", ".txt", ".css", ".html"]);
const MOJIBAKE_PATTERNS = [
  { pattern: /\u00C3/g, label: "Ã" },
  { pattern: /\u00C2/g, label: "Â" },
  { pattern: /â€“/g, label: "â€“" },
  { pattern: /â€”/g, label: "â€”" },
  { pattern: /â€ž/g, label: "â€ž" },
  { pattern: /â€œ/g, label: "â€œ" },
  { pattern: /â€™/g, label: "â€™" },
  { pattern: /â€¦/g, label: "â€¦" },
  { pattern: /â‚¬/g, label: "â‚¬" },
  { pattern: /\uFFFD/g, label: "�" },
];

function shouldScan(filePath) {
  return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === ".next" || entry.name === "node_modules") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else if (shouldScan(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

const findings = [];

for (const target of TARGETS) {
  for (const filePath of walk(path.join(ROOT, target))) {
    const text = fs.readFileSync(filePath, "utf8");
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const { pattern, label } of MOJIBAKE_PATTERNS) {
        if (pattern.test(line)) {
          findings.push({
            file: path.relative(ROOT, filePath),
            line: index + 1,
            pattern: label,
            text: line.trim(),
          });
          pattern.lastIndex = 0;
          break;
        }
        pattern.lastIndex = 0;
      }
    });
  }
}

if (findings.length) {
  console.error(`Encoding audit failed with ${findings.length} mojibake hit(s).`);
  for (const finding of findings.slice(0, 200)) {
    console.error(`${finding.file}:${finding.line} [${finding.pattern}] ${finding.text}`);
  }
  process.exit(1);
}

console.log("Encoding audit passed. No mojibake patterns found.");
