import { execSync } from "node:child_process";
import { NextResponse } from "next/server";
import pkg from "../../../../../package.json";

type CommitEntry = { hash: string; message: string; date: string };

function getRecentCommits(n = 8): CommitEntry[] {
  try {
    const raw = execSync(`git log --pretty=format:"%h|%s|%cd" --date=short -n ${n}`, {
      encoding: "utf8",
      cwd: process.cwd(),
      timeout: 4000,
    });
    return raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [hash, message, date] = line.split("|");
        return { hash: hash ?? "", message: message ?? "", date: date ?? "" };
      });
  } catch {
    return [];
  }
}

function getBranch(): string {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", {
      encoding: "utf8",
      cwd: process.cwd(),
      timeout: 2000,
    }).trim();
  } catch {
    return "unknown";
  }
}

const INFO_CACHE_TTL_MS = 5 * 60 * 1000;
let _infoCache: { payload: object; ts: number } | null = null;

export const dynamic = "force-dynamic";

export async function GET() {
  const now = Date.now();
  if (_infoCache && now - _infoCache.ts < INFO_CACHE_TTL_MS) {
    return NextResponse.json(_infoCache.payload);
  }
  const commits = getRecentCommits();
  const branch = getBranch();
  const payload = {
    version: pkg.version as string,
    branch,
    commits,
    nextVersion: (pkg.dependencies as Record<string, string>)["next"] ?? "unknown",
    nodeVersion: process.version,
  };
  _infoCache = { payload, ts: now };
  return NextResponse.json(payload);
}
