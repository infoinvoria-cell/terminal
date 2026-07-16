import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const REGISTRY_PATH = path.join(process.cwd(), "src/data/monitoring/white-swan-monitoring-assets.json");

export async function GET() {
  try {
    const raw = fs.readFileSync(REGISTRY_PATH, "utf-8");
    const data = JSON.parse(raw);
    return NextResponse.json({ status: "ok", data });
  } catch (e) {
    return NextResponse.json(
      { status: "error", message: "Asset registry not found", error: String(e) },
      { status: 404 }
    );
  }
}
