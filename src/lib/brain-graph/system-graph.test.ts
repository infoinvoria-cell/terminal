import { describe, expect, it } from "vitest";

import { buildSystemGraph } from "@/lib/brain-graph/system-graph";
import { getEntityHref, resolveEngineKey } from "@/lib/navigation/entity-resolver";

describe("system graph contract", () => {
  it("exposes structured agent-readable node fields", () => {
    const graph = buildSystemGraph();
    const strategy = graph.nodes.find((node) => node.id === "strategy:trend_momentum_dax_2h");

    expect(strategy).toBeTruthy();
    expect(strategy?.type).toBe("STRATEGY");
    expect(strategy?.canonicalEntityId).toBe("trend_momentum_dax_2h");
    expect(strategy?.metadata.productionInstrument).toBe("DE30EUR");
    expect(strategy?.health.runtime).toBe("healthy");
    expect(strategy?.navigationActions.ENGINE).toBe("/engine?strategy=DAX_2H");
    expect(strategy?.navActions.ENGINE).toBe("/engine?strategy=DAX_2H");
  });

  it("keeps structured relationship edges with stable ids", () => {
    const graph = buildSystemGraph();
    const link = graph.links.find(
      (edge) =>
        edge.from === "strategy:trend_momentum_dax_2h" &&
        edge.to === "monitoring-chart:dax2h",
    );

    expect(link).toBeTruthy();
    expect(link?.relationship).toBe("VISUALIZED_IN_MONITORING");
    expect(link?.id).toBe("VISUALIZED_IN_MONITORING:strategy:trend_momentum_dax_2h->monitoring-chart:dax2h");
    expect(link?.source).toBe(link?.from);
    expect(link?.target).toBe(link?.to);
  });

  it("resolves EUR30M alias to the canonical engine key and route", () => {
    expect(resolveEngineKey("EUR30M")).toBe("EUR_30M");
    expect(getEntityHref("EUR30M", "ENGINE")).toBe("/engine?strategy=EUR_30M");
  });
});
