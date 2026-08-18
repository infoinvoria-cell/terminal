import { describe, expect, it } from "vitest";
import { dedupeNews, isPhysicalNews, rankAssetNews, rankGlobalNews } from "@/lib/globe/news-policy";
import type { AssetItem, NewsItem } from "@/lib/globe/globe-types";

const asset: AssetItem = {
  id: "gold", name: "Gold", category: "Metalle", iconKey: "gold", tvSource: "COMEX:GC1!", symbol: "GC1!", lat: 40, lng: -74, country: "US", color: "#c8c8c8", defaultEnabled: true, locations: [],
};
const item = (title: string, extra: Partial<NewsItem> = {}): NewsItem => ({ title, description: "", source: "test", url: `https://example.test/${encodeURIComponent(title)}`, ...extra });

describe("Globe news policy", () => {
  it("deduplicates canonical URLs and repeated headlines", () => {
    expect(dedupeNews([item("Gold rises", { url: "https://a.test" }), item("Gold rises", { url: "https://a.test" }), item("Gold rises", { url: "" })])).toHaveLength(1);
  });
  it("keeps asset news materially related to the selected asset", () => {
    const result = rankAssetNews([item("Gold demand rises"), item("Random entertainment headline")], asset);
    expect(result.map((entry) => entry.title)).toEqual(["Gold demand rises"]);
  });
  it("keeps global news broad and physical relevance explicit", () => {
    expect(rankGlobalNews([item("Fed holds rates"), item("Random headline")]).map((entry) => entry.title)).toEqual(["Fed holds rates"]);
    expect(isPhysicalNews(item("NOAA vegetation and crop conditions update"))).toBe(true);
  });
});
