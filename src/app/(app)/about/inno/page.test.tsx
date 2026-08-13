import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import AboutInnoPage from "./page";

vi.mock("@/lib/track-record/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/track-record/service")>(
    "@/lib/track-record/service",
  );

  return {
    ...actual,
    buildTrackRecordOverview: vi.fn(),
  };
});

describe("/about/inno route regression", () => {
  it("renders the INNO call cockpit and not the White-Swan placeholder", async () => {
    const actualService = await vi.importActual<typeof import("@/lib/track-record/service")>(
      "@/lib/track-record/service",
    );
    const overview = await actualService.buildTrackRecordOverview();
    const mockedBuildTrackRecordOverview = vi.mocked(
      (await import("@/lib/track-record/service")).buildTrackRecordOverview,
    );
    mockedBuildTrackRecordOverview.mockResolvedValue(overview);

    const element = await AboutInnoPage();
    const html = renderToStaticMarkup(element);

    expect(html).toContain('data-testid="inno-call-cockpit-route"');
    expect(html).toContain("TRACK-RECORD-SCOPE");
    expect(html).not.toContain("Preparation overview.");
    expect(html).not.toContain("White Swan Capital");
  });
});
