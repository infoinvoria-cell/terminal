"use client";

export const WF_OOS_START = "2008-01-01";
export const LIVE_START = "2026-03-01";

export type StrategyTesterPhaseId = "test" | "wf_oos" | "live";

export type StrategyTesterPhaseSegment = {
  id: StrategyTesterPhaseId;
  label: "Test" | "WF+OOS" | "Live";
  start: string;
  end: string;
  labelColor: string;
  labelPosition: "insideBottomLeft" | "insideBottomRight";
  labelOffset: number;
};

export type StrategyTesterBoundaryMarker = {
  id: "wfOosStart" | "liveStart";
  date: string;
  color: string;
};

type TimePoint = { time: string };

function normalizeDate(value: string | null | undefined): string | null {
  const text = String(value || "").trim();
  return text ? text.slice(0, 10) : null;
}

function findFirstOnOrAfter(points: TimePoint[], boundary: string): string | null {
  const match = points.find((point) => normalizeDate(point.time) && normalizeDate(point.time)! >= boundary);
  return normalizeDate(match?.time);
}

function findLastBefore(points: TimePoint[], boundary: string): string | null {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const date = normalizeDate(points[index]?.time);
    if (date && date < boundary) return date;
  }
  return null;
}

export function buildStrategyTesterPhaseMarkers(points: TimePoint[]): {
  segments: StrategyTesterPhaseSegment[];
  markers: StrategyTesterBoundaryMarker[];
} {
  const normalizedPoints = points
    .map((point) => ({ time: normalizeDate(point.time) ?? "" }))
    .filter((point) => point.time);
  if (!normalizedPoints.length) return { segments: [], markers: [] };

  const firstDate = normalizedPoints[0].time;
  const lastDate = normalizedPoints[normalizedPoints.length - 1].time;
  const wfOosBoundary = findFirstOnOrAfter(normalizedPoints, WF_OOS_START);
  const liveBoundary = findFirstOnOrAfter(normalizedPoints, LIVE_START);
  const testEnd = findLastBefore(normalizedPoints, WF_OOS_START);
  const wfOosEnd = findLastBefore(normalizedPoints, LIVE_START);

  const segments: StrategyTesterPhaseSegment[] = [];
  if (firstDate && testEnd && firstDate <= testEnd) {
    segments.push({
      id: "test",
      label: "Test",
      start: firstDate,
      end: testEnd,
      labelColor: "rgba(214,220,230,0.72)",
      labelPosition: "insideBottomLeft",
      labelOffset: 8,
    });
  }
  if (wfOosBoundary && wfOosEnd && wfOosBoundary <= wfOosEnd) {
    segments.push({
      id: "wf_oos",
      label: "WF+OOS",
      start: wfOosBoundary,
      end: wfOosEnd,
      labelColor: "rgba(232,237,244,0.76)",
      labelPosition: "insideBottomLeft",
      labelOffset: 8,
    });
  }
  if (liveBoundary && liveBoundary <= lastDate) {
    segments.push({
      id: "live",
      label: "Live",
      start: liveBoundary,
      end: lastDate,
      labelColor: "rgba(231,195,88,0.92)",
      labelPosition: "insideBottomRight",
      labelOffset: 14,
    });
  }

  const markers: StrategyTesterBoundaryMarker[] = [];
  if (wfOosBoundary) markers.push({ id: "wfOosStart", date: wfOosBoundary, color: "rgba(226,232,240,0.32)" });
  if (liveBoundary) markers.push({ id: "liveStart", date: liveBoundary, color: "rgba(214,178,74,0.9)" });

  return { segments, markers };
}
