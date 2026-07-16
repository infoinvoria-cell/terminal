"use client";

import {
  Fragment,
  memo,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  ALL_STRATEGIES_COL_MAX,
  ALL_STRATEGIES_COL_MIN,
  adjustRowPair,
  defaultAllStrategiesResizableLayout,
  loadAllStrategiesResizableLayout,
  persistAllStrategiesResizableLayout,
  round2,
  type AllStrategiesResizableLayoutState,
} from "@/lib/monitoring/allStrategiesResizableLayout";

/** Visible gap height between groups; also horizontal column gutter width. */
export const ALL_STRATEGIES_SPLITTER_GAP_PX = 10;

export type AllStrategiesSection = {
  label: string;
  innerLayout: string;
  content: ReactNode;
};

type ColumnSide = "left" | "right";

type SplitterDragKind =
  | "column"
  | "left-row1"
  | "left-row2"
  | "right-row1"
  | "right-row2";

type Props = {
  tabId: string;
  leftSections: AllStrategiesSection[];
  rightSections: AllStrategiesSection[];
};

const ROW_SPLITTERS_PER_COLUMN = 2;

function columnGroupsHeight(columnHeight: number): number {
  return Math.max(1, columnHeight - ROW_SPLITTERS_PER_COLUMN * ALL_STRATEGIES_SPLITTER_GAP_PX);
}

function AllStrategiesResizableLayoutInner({ tabId, leftSections, rightSections }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const leftColumnRef = useRef<HTMLDivElement | null>(null);
  const rightColumnRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    kind: SplitterDragKind;
    startX: number;
    startY: number;
    startLayout: AllStrategiesResizableLayoutState;
  } | null>(null);
  const rafRef = useRef<number | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const [layout, setLayout] = useState<AllStrategiesResizableLayoutState>(() => defaultAllStrategiesResizableLayout());
  const [dragKind, setDragKind] = useState<SplitterDragKind | null>(null);

  useEffect(() => {
    setLayout(loadAllStrategiesResizableLayout());
  }, []);

  useEffect(() => {
    persistAllStrategiesResizableLayout(layout);
  }, [layout]);

  const resetLayout = () => {
    const next = defaultAllStrategiesResizableLayout();
    setLayout(next);
    persistAllStrategiesResizableLayout(next);
  };

  const startSplitterDrag = (kind: SplitterDragKind, event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      kind,
      startX: event.clientX,
      startY: event.clientY,
      startLayout: layout,
    };
    pointerRef.current = { x: event.clientX, y: event.clientY };
    setDragKind(kind);
    document.body.classList.add("monitoring-splitter-dragging");
    document.body.style.cursor = kind === "column" ? "col-resize" : "row-resize";
  };

  useEffect(() => {
    if (!dragKind) return;

    const applyDrag = () => {
      const drag = dragRef.current;
      const pointer = pointerRef.current;
      if (!drag || !pointer) return;

      if (drag.kind === "column") {
        const host = hostRef.current;
        if (!host) return;
        const width = Math.max(1, host.clientWidth);
        const deltaPct = ((pointer.x - drag.startX) / width) * 100;
        const nextCol = round2(
          Math.min(ALL_STRATEGIES_COL_MAX, Math.max(ALL_STRATEGIES_COL_MIN, drag.startLayout.columnSplit + deltaPct)),
        );
        setLayout((prev) => (prev.columnSplit === nextCol ? prev : { ...prev, columnSplit: nextCol }));
        return;
      }

      const columnRef = drag.kind.startsWith("left") ? leftColumnRef : rightColumnRef;
      const columnHost = columnRef.current;
      if (!columnHost) return;
      const height = columnGroupsHeight(columnHost.clientHeight);
      const deltaPct = ((pointer.y - drag.startY) / height) * 100;
      const rowKey = drag.kind.startsWith("left") ? "leftRows" : "rightRows";
      const startRows = drag.startLayout[rowKey];

      if (drag.kind === "left-row1" || drag.kind === "right-row1") {
        const [nextR1, nextR2] = adjustRowPair(startRows[0], startRows[1], deltaPct);
        setLayout((prev) => {
          const rows = prev[rowKey];
          if (rows[0] === nextR1 && rows[1] === nextR2) return prev;
          return { ...prev, [rowKey]: [nextR1, nextR2, startRows[2]] };
        });
        return;
      }

      const [nextR2, nextR3] = adjustRowPair(startRows[1], startRows[2], deltaPct);
      setLayout((prev) => {
        const rows = prev[rowKey];
        if (rows[1] === nextR2 && rows[2] === nextR3) return prev;
        return { ...prev, [rowKey]: [startRows[0], nextR2, nextR3] };
      });
    };

    const onPointerMove = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
      if (rafRef.current != null) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        applyDrag();
      });
    };

    const stopDrag = () => {
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      dragRef.current = null;
      pointerRef.current = null;
      setDragKind(null);
      document.body.classList.remove("monitoring-splitter-dragging");
      document.body.style.cursor = "";
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
      stopDrag();
    };
  }, [dragKind]);

  const renderRowSplitter = (kind: SplitterDragKind, side: ColumnSide) => (
    <div
      className="monitoring-all-strategies-splitter monitoring-all-strategies-splitter-row"
      onPointerDown={(event) => startSplitterDrag(kind, event)}
      onDoubleClick={resetLayout}
      role="separator"
      aria-orientation="horizontal"
      aria-label={`${side === "left" ? "Linke" : "Rechte"} Spalte: Gruppenhöhe`}
    />
  );

  const renderColumn = (
    side: ColumnSide,
    sections: AllStrategiesSection[],
    rows: [number, number, number],
    columnRef: { current: HTMLDivElement | null },
    widthStyle: CSSProperties,
  ) => {
    const row1Kind: SplitterDragKind = side === "left" ? "left-row1" : "right-row1";
    const row2Kind: SplitterDragKind = side === "left" ? "left-row2" : "right-row2";

    return (
      <div
        ref={columnRef}
        className={`monitoring-all-strategies-column monitoring-all-strategies-column--${side}`}
        style={widthStyle}
      >
        {sections.map((section, index) => (
          <Fragment key={section.label}>
            <section
              className="monitoring-all-strategies-mosaic-cell"
              data-group={section.label}
              style={{
                flex: `${rows[index]} 1 0`,
                minHeight: 0,
              }}
            >
              <div className="monitoring-all-strategies-section-label">{section.label}</div>
              <div className={`monitoring-all-strategies-section-grid ${section.innerLayout}`}>
                {section.content}
              </div>
            </section>
            {index === 0 ? renderRowSplitter(row1Kind, side) : null}
            {index === 1 ? renderRowSplitter(row2Kind, side) : null}
          </Fragment>
        ))}
      </div>
    );
  };

  return (
    <div
      ref={hostRef}
      className={`monitoring-all-strategies-dashboard ${dragKind ? "is-resizing" : ""}`}
      data-tab-id={tabId}
    >
      {renderColumn("left", leftSections, layout.leftRows, leftColumnRef, {
        flex: `0 0 ${layout.columnSplit}%`,
        maxWidth: `${layout.columnSplit}%`,
      })}
      <div
        className="monitoring-all-strategies-splitter monitoring-all-strategies-splitter-col"
        onPointerDown={(event) => startSplitterDrag("column", event)}
        onDoubleClick={resetLayout}
        role="separator"
        aria-orientation="vertical"
        aria-label="Spaltenbreite links/rechts"
      />
      {renderColumn("right", rightSections, layout.rightRows, rightColumnRef, {
        flex: "1 1 0",
        minWidth: 0,
      })}
      <button
        type="button"
        className="monitoring-all-strategies-layout-reset"
        onClick={resetLayout}
        title="Layout zurücksetzen"
      >
        Reset
      </button>
    </div>
  );
}

export default memo(AllStrategiesResizableLayoutInner);
