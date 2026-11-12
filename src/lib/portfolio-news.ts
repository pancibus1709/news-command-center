import { cached, MINUTE } from "./cache";
import type { Feed } from "./feeds";
import { fetchFeed, nearDupePass, NOISE_SOURCES, normalizeTitle, type NewsItem } from "./news";
import { loadPortfolioFile } from "./positions";
import type { PortfolioNewsItem, PortfolioNewsPayload } from "./portfolio-types";

const DAY = 24 * 60 * MINUTE;
const PER_COMPANY = 12;
const MAX_ITEMS = 250;
const CONCURRENCY = 6;

// Short forms the press uses that suffix-stripping cannot derive.
const ALIASES: Record<string, string[]> = {
  GOOG: ["Google"],
  GOOGL: ["Google"],
  TSM: ["TSMC"],
  FCX: ["Freeport"],
  "BRK.A": ["Berkshire"],
  "BRK.B": ["Berkshire"],
  JPM: ["JPMorgan"],
};

// Quote/aggregator sites that rank on ticker queries but carry no news.
const EXTRA_NOISE = new Set([
  "Moomoo", "StockInvest.us", "GuruFocus", "Traders Union", "TradingKey", "CoinMarketCap", "finance.biggo.com",
  "kalkine.ca", "ChartMill", "Quantisnow", "Europa WSE", "Stock Traders Daily", "OKX", "MarketBeat", "Blockchain News",
  "blockchain.news", "Finbold", "Pluang", "KuCoin", "Intellectia AI", "Coinpedia",
]);

// Quote pages, option-chain pages, price-prediction filler, 13F/ETF flow
// filler ("ETFs Bought $84M of", "(IVV) Sells $26M of"), Zacks syndication,
// class-action law firm solicitations, phone-number spam.
const JUNK_TITLE =
  /stock price, (news|quote)|price,? quote|stock quotes?\b|price today|live price|real-time quotes|price (forecast|prediction)|prediction market|META_TITLE_QUOTE|\b\d+\.\d{3} (call|put)\b|\bETFs? (are )?(buying|bought|sold|net (buyers|sellers)|add to)|net ETF (buying|selling)|\([A-Z]{2,5}\) (buys|sells|adds|trims|pares)\b|\bZacks\b|shareholder alert|\) ALERT:|P\.C\.? Urgently|lead plaintiff|securities (investigation|class action|fraud)|investors: contact|\+1 \(\d{3}\)/i;

const SUFFIX = /\s+(Inc\.?|Corp\.?|Corporation|Co\.?|Company|Holdings|Group|Technologies|Technology|Platforms|ETF)$/i;

type Company = {
  symbols: string[];
  name: string;
  kind: "stock" | "etf";
  terms: string[];
  value: number;
  guard: RegExp;
};

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function buildGuard(terms: string[], tickers: string[]): RegExp {
  // Names match as whole words, case-sensitive so "Apple" is not "apple pie".
  // Two-letter tickers (MU) collide with ordinary words, so they only count
  // in cashtag or exchange form.
  const parts = terms.map((t) => `\\b${esc(t)}\\b`);
  for (const t of tickers) {
    parts.push(t.length >= 3 ? `\\b${esc(t)}\\b` : `(?:\\$|\\(|:)${esc(t)}\\b`);
  }
  return new RegExp(parts.join("|"));
}

function query(c: Company): string {
  const names = c.terms.map((t) => `"${t}"`).join(" OR ");
  // Requiring the ticker alongside the name drops brand chatter (product
  // reviews, the company's own blog) and keeps investor-relevant coverage.
  // ETFs are rarely named in full, so either side is enough.
  return c.kind === "etf"
    ? `${names} OR ${c.symbols.join(" OR ")} when:7d`
    : `(${names}) (${c.symbols.join(" OR ")}) when:7d`;
}

// splitGoogleTitle skips sources with a hyphen ("ad-hoc-news.de"), leaving
// the feed name as source. Split on the last " - " instead.
function fixSource(i: NewsItem): NewsItem {
  if (i.source !== "Holdings wire") return i;
  const at = i.title.lastIndexOf(" - ");
  return at > 0 ? { ...i, title: i.title.slice(0, at).trim(), source: i.title.slice(at + 3).trim() } : i;
}

// Google's summary is the headline plus the publisher name, so a company's
// own site would pass the guard on its byline alone. Test without it.
function guardText(i: NewsItem): string {
  return `${i.title} ${i.summary.split(i.source).join(" ")}`;
}

// The company's own blog and help pages (Shopify merchant stories, Robinhood
// product posts) are marketing, not news.
function selfPublished(source: string, terms: string[]): boolean {
  const s = source.toLowerCase().replace(/^www\./, "").replace(/\.(com|net|io|ai|co)$/, "");
  return terms.some((t) => new RegExp(`^${esc(t.toLowerCase())}(\\s|$)`).test(s));
}

async function companyNews(c: Company): Promise<NewsItem[]> {
  const feed: Feed = {
    id: `pf-${c.symbols[0]}`,
    name: "Holdings wire",
    url: `https://news.google.com/rss/search?q=${encodeURIComponent(query(c))}&hl=en-US&gl=US&ceid=US:en`,
    category: "markets",
    weight: 1,
  };
  const cutoff = Date.now() - 7 * DAY;
  const seen = new Set<string>();
  const items = (await fetchFeed(feed))
    .map(fixSource)
    .filter((i) => !NOISE_SOURCES.has(i.source) && !EXTRA_NOISE.has(i.source))
    .filter((i) => !selfPublished(i.source, c.terms))
    .filter((i) => !JUNK_TITLE.test(i.title))
    .filter((i) => new Date(i.publishedAt).getTime() >= cutoff)
    .filter((i) => c.guard.test(guardText(i)))
    .filter((i) => {
      const k = normalizeTitle(i.title);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  return nearDupePass(items).slice(0, PER_COMPANY);
}

async function pool<T, R>(xs: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let next = 0;
  const worker = async () => {
    while (next < xs.length) {
      const i = next++;
      out[i] = await fn(xs[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, worker));
  return out;
}

export async function getPortfolioNews(): Promise<PortfolioNewsPayload> {
  const file = await loadPortfolioFile();
  if (!file) return { items: [], symbols: [], fetchedAt: new Date().toISOString() };

  return cached("portfolio:news", 10 * MINUTE, async () => {
    const bySymbol = new Map<string, { name: string; kind: "stock" | "etf"; value: number }>();
    for (const p of file.positions) {
      if (p.kind !== "stock" && p.kind !== "etf") continue;
      const prev = bySymbol.get(p.symbol);
      bySymbol.set(p.symbol, { name: p.name, kind: p.kind, value: (prev?.value ?? 0) + p.snapValue });
    }
    const ranked = Array.from(bySymbol, ([symbol, v]) => ({ symbol, ...v })).sort((a, b) => b.value - a.value);

    // One query per company: share classes (GOOG, GOOGL) share a name.
    const byName = new Map<string, Company>();
    for (const r of ranked) {
      const key = r.name.toLowerCase();
      const c = byName.get(key);
      if (c) {
        c.symbols.push(r.symbol);
        c.value += r.value;
        continue;
      }
      byName.set(key, { symbols: [r.symbol], name: r.name, kind: r.kind, terms: [], value: r.value, guard: /$^/ });
    }
    const companies = Array.from(byName.values());
    for (const c of companies) {
      const short = c.name.replace(SUFFIX, "").trim();
      c.terms = Array.from(new Set([c.name.replace(/\s+ETF$/i, ""), short, ...c.symbols.flatMap((s) => ALIASES[s] ?? [])]));
      c.guard = buildGuard(c.terms, c.symbols);
    }

    const results = await pool(companies, CONCURRENCY, companyNews);

    const byTitle = new Map<string, NewsItem>();
    for (const item of results.flat()) {
      const k = normalizeTitle(item.title);
      if (!byTitle.has(k)) byTitle.set(k, item);
    }
    const merged = nearDupePass(
      Array.from(byTitle.values()).sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()),
    );

    // Tag after merging so a headline naming two holdings carries both.
    const items: PortfolioNewsItem[] = [];
    for (const i of merged) {
      const text = guardText(i);
      const symbols = companies.filter((c) => c.guard.test(text)).flatMap((c) => c.symbols);
      if (symbols.length) items.push({ ...i, symbols });
      if (items.length >= MAX_ITEMS) break;
    }

    const counts = new Map<string, number>();
    for (const i of items) for (const s of i.symbols) counts.set(s, (counts.get(s) ?? 0) + 1);
    return {
      items,
      symbols: ranked.map((r) => ({ symbol: r.symbol, name: r.name, count: counts.get(r.symbol) ?? 0 })),
      fetchedAt: new Date().toISOString(),
    };
  });
}
