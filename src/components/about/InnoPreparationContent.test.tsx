// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { InnoPreparationContent } from "@/components/about/InnoPreparationContent";
import { buildTrackRecordOverview } from "@/lib/track-record/service";

let cleanupFns: Array<() => void> = [];

afterEach(() => {
  while (cleanupFns.length) {
    cleanupFns.pop()?.();
  }
});

async function renderInno() {
  const overview = await buildTrackRecordOverview();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<InnoPreparationContent trackRecordOverview={overview} />);
  });

  cleanupFns.push(() => {
    root.unmount();
    container.remove();
  });

  return container;
}

function click(element: Element) {
  element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

describe("InnoPreparationContent accordion layout", () => {
  it("renders 16 questions with split columns and per-column accordion behavior", async () => {
    const container = await renderInno();

    const leftColumn = container.querySelector('[data-testid="qa-left-column"]');
    const rightColumn = container.querySelector('[data-testid="qa-right-column"]');

    expect(leftColumn).toBeTruthy();
    expect(rightColumn).toBeTruthy();

    const allToggles = container.querySelectorAll('[data-testid^="qa-toggle-"]');
    expect(allToggles).toHaveLength(16);

    expect(leftColumn?.querySelector('[data-testid="qa-toggle-01"]')).toBeTruthy();
    expect(leftColumn?.querySelector('[data-testid="qa-toggle-08"]')).toBeTruthy();
    expect(rightColumn?.querySelector('[data-testid="qa-toggle-09"]')).toBeTruthy();
    expect(rightColumn?.querySelector('[data-testid="qa-toggle-16"]')).toBeTruthy();

    expect(container.querySelector('[data-testid="qa-panel-01"]')).toBeNull();
    expect(container.querySelector('[data-testid="qa-panel-09"]')).toBeNull();

    const q01 = container.querySelector('[data-testid="qa-toggle-01"]');
    const q02 = container.querySelector('[data-testid="qa-toggle-02"]');
    const q09 = container.querySelector('[data-testid="qa-toggle-09"]');
    const q10 = container.querySelector('[data-testid="qa-toggle-10"]');

    expect(q01?.getAttribute("aria-expanded")).toBe("false");
    expect(q09?.getAttribute("aria-expanded")).toBe("false");

    await act(async () => {
      click(q01!);
    });

    expect(container.querySelector('[data-testid="qa-panel-01"]')).toBeTruthy();
    expect(q01?.getAttribute("aria-expanded")).toBe("true");

    await act(async () => {
      click(q01!);
    });

    expect(container.querySelector('[data-testid="qa-panel-01"]')).toBeNull();
    expect(q01?.getAttribute("aria-expanded")).toBe("false");

    await act(async () => {
      click(q01!);
    });
    await act(async () => {
      click(q02!);
    });

    expect(container.querySelector('[data-testid="qa-panel-01"]')).toBeNull();
    expect(container.querySelector('[data-testid="qa-panel-02"]')).toBeTruthy();

    await act(async () => {
      click(q09!);
    });

    expect(container.querySelector('[data-testid="qa-panel-02"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="qa-panel-09"]')).toBeTruthy();

    await act(async () => {
      click(q10!);
    });

    expect(container.querySelector('[data-testid="qa-panel-09"]')).toBeNull();
    expect(container.querySelector('[data-testid="qa-panel-10"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="qa-panel-02"]')).toBeTruthy();
  });
});
