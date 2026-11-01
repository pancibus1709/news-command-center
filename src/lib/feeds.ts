// Public RSS sources, verified live on 2026-10-19. Every feed here returned
// HTTP 200 with items when probed. Reuters, Yahoo Finance and Treasury feeds
// were tried and are dead (404), so they are not listed.

export type Category =
  | "markets"
  | "credit"
  | "economy"
  | "politics"
  | "ai"
  | "regulatory"
  | "world";

export type Feed = {
  id: string;
  name: string;
  url: string;
  category: Category;
  /** Ranking weight, 1 to 5. Feeds at 4 or above are official sources and keep 10 days of history. */
  weight: number;
  /**
   * Broad publisher feeds (a whole newsroom, not a topic) do not stamp their
   * lane on every story as a tag; tags come from the headline alone. The
   * lane still comes from `category`.
   */
  broad?: boolean;
  /** Shown only inside its own lane, never in the All view. */
  hideFromAll?: boolean;
};

const gnews = (q: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

export const FEEDS: Feed[] = [
  // Markets
  { id: "cnbc-top", name: "CNBC", url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", category: "markets", weight: 3, broad: true },
  { id: "cnbc-markets", name: "CNBC Markets", url: "https://www.cnbc.com/id/10000664/device/rss/rss.html", category: "markets", weight: 3, broad: true },
  { id: "cnbc-finance", name: "CNBC Finance", url: "https://www.cnbc.com/id/10000113/device/rss/rss.html", category: "markets", weight: 2, broad: true },
  { id: "wsj-markets", name: "WSJ Markets", url: "https://feeds.content.dowjones.io/public/rss/RSSMarketsMain", category: "markets", weight: 4, broad: true },
  { id: "mw-pulse", name: "MarketWatch", url: "https://feeds.marketwatch.com/marketwatch/marketpulse/", category: "markets", weight: 2, broad: true },
  { id: "ft-home", name: "Financial Times", url: "https://www.ft.com/rss/home", category: "markets", weight: 4, broad: true },
  { id: "sa-currents", name: "Seeking Alpha", url: "https://seekingalpha.com/market_currents.xml", category: "markets", weight: 1, broad: true },

  // Credit
  { id: "gn-credit", name: "Credit wire", url: gnews('"high yield" OR "leveraged loans" OR "credit markets" OR "junk bonds" OR "private credit"'), category: "credit", weight: 2 },
  { id: "gn-distressed", name: "Distressed wire", url: gnews('"distressed debt" OR "chapter 11" OR "debt restructuring" OR "credit default swaps" OR "bond spreads"'), category: "credit", weight: 2 },
  { id: "gn-ratings", name: "Ratings wire", url: gnews('"Moody\'s" OR "S&P Global Ratings" OR "Fitch Ratings" downgrade OR upgrade'), category: "credit", weight: 1 },

  // Economy and central banks
  { id: "cnbc-economy", name: "CNBC Economy", url: "https://www.cnbc.com/id/20910258/device/rss/rss.html", category: "economy", weight: 2 },
  { id: "fed-press", name: "Federal Reserve", url: "https://www.federalreserve.gov/feeds/press_all.xml", category: "economy", weight: 5 },
  { id: "gn-macro", name: "Macro wire", url: gnews('"Federal Reserve" OR inflation OR "jobs report" OR "Treasury yields" OR GDP'), category: "economy", weight: 1 },

  // Politics
  { id: "politico", name: "Politico", url: "https://rss.politico.com/politics-news.xml", category: "politics", weight: 3 },
  // The Hill's firehose carries entertainment; its finance feed is empty (probed 2026-10-19).
  // Kept at weight 1 with the filler filter in news.ts doing the cleanup.
  { id: "thehill", name: "The Hill", url: "https://thehill.com/feed/", category: "politics", weight: 1, broad: true, hideFromAll: true },

  // Regulatory
  { id: "sec-press", name: "SEC", url: "https://www.sec.gov/news/pressreleases.rss", category: "regulatory", weight: 4 },
  { id: "gn-reg", name: "Regulatory wire", url: gnews('SEC OR FTC OR DOJ antitrust OR "bank regulators" OR Basel'), category: "regulatory", weight: 1 },

  // AI
  { id: "tc-ai", name: "TechCrunch AI", url: "https://techcrunch.com/category/artificial-intelligence/feed/", category: "ai", weight: 3 },
  { id: "cnbc-tech", name: "CNBC Tech", url: "https://www.cnbc.com/id/19854910/device/rss/rss.html", category: "ai", weight: 2, broad: true },
  { id: "gn-ai", name: "AI wire", url: gnews('OpenAI OR Anthropic OR Nvidia OR "AI chips" OR "data center" OR "artificial intelligence" funding'), category: "ai", weight: 1 },

  // World
  { id: "wsj-world", name: "WSJ World", url: "https://feeds.content.dowjones.io/public/rss/RSSWorldNews", category: "world", weight: 3, broad: true },
  { id: "cnbc-world", name: "CNBC World", url: "https://www.cnbc.com/id/100727362/device/rss/rss.html", category: "world", weight: 2, broad: true },
];

export const CATEGORY_LABELS: Record<Category, string> = {
  markets: "Markets",
  credit: "Credit",
  economy: "Macro",
  politics: "Politics",
  regulatory: "Reg",
  ai: "AI/Tech",
  world: "World",
};

export const CATEGORY_ORDER: Category[] = [
  "markets",
  "credit",
  "economy",
  "politics",
  "regulatory",
  "ai",
  "world",
];
