import type { AssetItem, NewsItem } from "@/lib/globe/globe-types";

const GLOBAL_RELEVANCE = /\b(macro|rates?|yield|treasur(?:y|ies)|central bank|fed|ecb|boj|inflation|cpi|gdp|recession|geopolit|sanction|tariff|trade|war|conflict|opec|supply chain|shipping|commodity|energy|oil|gold|corn|soy|wheat|copper|market risk|default|crisis)\b/i;
const PHYSICAL_RELEVANCE = /\b(physical|crop|harvest|yield|vhi|vegetation|drought|weather|rainfall|usda|noaa|inventory|production|supply|demand|opec|shipping|freight|port|pipeline)\b/i;

function normalize(value: string): string {
  return value.toLowerCase().replace(/https?:\/\/|www\./g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function articleText(item: NewsItem): string {
  return normalize(`${item.title} ${item.description ?? ""} ${item.category ?? ""} ${(item.relatedAssets ?? []).join(" ")}`);
}

function similarityKey(item: NewsItem): string {
  return normalize(item.title).split(" ").filter((word) => word.length > 2).slice(0, 12).join(" ");
}

export function dedupeNews(items: NewsItem[]): NewsItem[] {
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  const result: NewsItem[] = [];
  for (const item of items) {
    const urlKey = normalize(item.url || "");
    const titleKey = similarityKey(item);
    if ((!urlKey && !titleKey) || (urlKey && seenUrls.has(urlKey)) || (titleKey && seenTitles.has(titleKey))) continue;
    if (urlKey) seenUrls.add(urlKey);
    if (titleKey) seenTitles.add(titleKey);
    result.push(item);
  }
  return result;
}

function assetRelevance(item: NewsItem, asset: AssetItem): number {
  const text = articleText(item);
  const identifiers = [asset.id, asset.symbol, asset.name].filter(Boolean).map(normalize);
  let score = 0;
  if ((item.relatedAssets ?? []).some((value) => identifiers.includes(normalize(value)))) score += 100;
  if (identifiers.some((identifier) => identifier.length >= 3 && text.includes(identifier))) score += 70;
  if (GLOBAL_RELEVANCE.test(text)) score += 8;
  if (PHYSICAL_RELEVANCE.test(text) && /agrar|agri|energy|metall|commod|oil|gold|corn|soy|wheat/i.test(`${asset.category} ${asset.name}`)) score += 18;
  score += Math.max(0, Number(item.marketRelevance ?? 0)) * 0.5;
  score += Math.max(0, Number(item.priorityScore ?? 0)) * 0.25;
  return score;
}

export function rankAssetNews(items: NewsItem[], asset: AssetItem | null | undefined): NewsItem[] {
  if (!asset) return [];
  return dedupeNews(items)
    .map((item) => ({ item, score: assetRelevance(item, asset) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || String(b.item.publishedAt ?? b.item.timestamp ?? "").localeCompare(String(a.item.publishedAt ?? a.item.timestamp ?? "")))
    .slice(0, 32)
    .map(({ item }) => item);
}

export function rankGlobalNews(items: NewsItem[]): NewsItem[] {
  return dedupeNews(items)
    .filter((item) => GLOBAL_RELEVANCE.test(articleText(item)))
    .sort((a, b) => {
      const score = (item: NewsItem) => Number(item.priorityScore ?? item.marketRelevance ?? 0) + (GLOBAL_RELEVANCE.test(articleText(item)) ? 10 : 0);
      return score(b) - score(a) || String(b.publishedAt ?? b.timestamp ?? "").localeCompare(String(a.publishedAt ?? a.timestamp ?? ""));
    })
    .slice(0, 48);
}

export function isPhysicalNews(item: NewsItem): boolean {
  return PHYSICAL_RELEVANCE.test(articleText(item));
}
