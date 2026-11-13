import Parser from "rss-parser";
import { FEEDS, type Category, type Feed } from "./feeds";
import { cached, MINUTE } from "./cache";

export type NewsItem = {
  id: string;
  title: string;
  link: string;
  source: string;
  feedId: string;
  category: Category;
  /** Topic tags inferred from the headline, plus the lane for narrow keyword wires. */
  tags: Category[];
  publishedAt: string; // ISO
  summary: string;
  weight: number;
  /** Ranking score: weight x topic boost x time decay. Higher first. */
  score: number;
  hideFromAll: boolean;
};

const parser = new Parser({
  timeout: 10_000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    Accept: "application/rss+xml, application/xml, text/xml, */*",
  },
});

// Headline taggers. A story from a markets feed that mentions spreads gets a
// credit tag so it shows in both lanes.
const TAGGERS: { tag: Category; re: RegExp }[] = [
  { tag: "credit", re: /\b(bond|bonds|credit|spread|spreads|high[- ]yield|junk|leveraged loan|private credit|default|downgrade|upgrade|CDS|refinanc|debt|yield curve|treasur(y|ies))\b/i },
  { tag: "ai", re: /\b(AI|artificial intelligence|OpenAI|Anthropic|Nvidia|LLM|chatbot|data center|GPU|chips?)\b/ },
  { tag: "politics", re: /\b(Congress|Senate|House|White House|President|Trump|tariff|election|GOP|Democrat|Republican|shutdown)\b/ },
  { tag: "economy", re: /\b(Fed|Federal Reserve|inflation|CPI|PCE|jobs|payrolls|unemployment|GDP|rate cut|rate hike|FOMC|Powell)\b/ },
  { tag: "regulatory", re: /\b(SEC|FTC|DOJ|antitrust|regulator|lawsuit|settlement|fine|probe)\b/ },
];

// Headlines that are not financial news, whatever feed they ride in on.
const FILLER = /\b(Daily Show|Earhart|Wahlberg|Amanpour|recipe|horoscope|celebrity|late[- ]night|box office|Emmy|Grammy|Oscars?|royal family|My husband|My wife|My mother|My father|I'm \d\d and|I am \d\d and|days? left|Founder Summit|TechCrunch (Disrupt|Sessions|Founder)|last chance to|concert|tour dates)\b/i;

// Stock-promo and 13F-filler publishers that dominate Google News company queries.
export const NOISE_SOURCES = new Set([
  "MarketBeat", "Stocktwits", "Gotrade", "StocksToTrade", "JournalArta", "Simply Wall St", "Simply Wall Street",
  "Trefis", "Stock Titan", "Stocks Down Under", "The Motley Fool", "Motley Fool", "Zacks", "Zacks Investment Research",
  "TipRanks", "InvestorPlace", "Benzinga", "Insider Monkey", "MarketScreener", "Defense World", "ETF Daily News",
  "Quiver Quantitative", "Kalkine Media", "24/7 Wall St.", "AAII", "Sharewise", "Investing News Network",
]);

function strip(html: string | undefined): string {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
}

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function normalizeTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

// Google News titles end with " - Source". Pull the source out so the card
// shows the publisher, not "Credit wire".
function splitGoogleTitle(title: string, fallback: string): { title: string; source: string } {
  const m = title.match(/^(.*)\s-\s([^-]{2,60})$/);
  if (m) return { title: m[1].trim(), source: m[2].trim() };
  return { title, source: fallback };
}

export async function fetchFeed(feed: Feed): Promise<NewsItem[]> {
  try {
    const out = await parser.parseURL(feed.url);
    const isGoogle = feed.url.startsWith("https://news.google.com");
    return (out.items ?? [])
      .filter((i) => i.title && i.link && !FILLER.test(i.title))
      .map((i) => {
        const { title, source } = isGoogle
          ? splitGoogleTitle(i.title!, feed.name)
          : { title: i.title!, source: feed.name };
        // Some publishers stamp local time with no zone, which lands in the
        // future. Clamp so the age column never reads 0s for hours.
        const parsed = i.isoDate ? new Date(i.isoDate) : i.pubDate ? new Date(i.pubDate) : new Date();
        const published = (Number.isNaN(parsed.getTime()) || parsed.getTime() > Date.now() ? new Date() : parsed).toISOString();
        const summary = strip(i.contentSnippet ?? i.content ?? i.summary);
        const text = `${title} ${summary}`;
        const contentTags = TAGGERS.filter((t) => t.re.test(text)).map((t) => t.tag);
        // Broad newsroom feeds tag from content only; a CNBC story is not
        // "#ai" because it also ran in the CNBC Tech feed. Narrow keyword
        // wires keep their lane as a tag since the query defines the topic.
        const tags = feed.broad ? contentTags : Array.from(new Set([feed.category, ...contentTags]));
        return {
          id: hash(i.link!),
          title: title.trim(),
          link: i.link!,
          source,
          feedId: feed.id,
          category: feed.category,
          tags,
          publishedAt: published,
          summary,
          weight: feed.weight,
          score: 0,
          hideFromAll: Boolean(feed.hideFromAll),
        };
      });
  } catch {
    // A dead feed should never take the board down. Log and move on.
    return [];
  }
}

export type FeedStatus = { id: string; name: string; ok: boolean; count: number };

export async function getAllNews(): Promise<{ items: NewsItem[]; status: FeedStatus[]; fetchedAt: string }> {
  return cached("news:all", 3 * MINUTE, async () => {
    const results = await Promise.all(FEEDS.map(fetchFeed));
    const status: FeedStatus[] = FEEDS.map((f, i) => ({
      id: f.id,
      name: f.name,
      ok: results[i].length > 0,
      count: results[i].length,
    }));

    // Dedupe on normalized headline. Keep the higher-weight copy. Tags merge
    // across copies (they are content-derived now, so the union is honest).
    const byTitle = new Map<string, NewsItem>();
    for (const item of results.flat()) {
      const key = normalizeTitle(item.title);
      const prev = byTitle.get(key);
      if (!prev || item.weight > prev.weight) {
        byTitle.set(key, prev ? { ...item, tags: Array.from(new Set([...prev.tags, ...item.tags])), hideFromAll: prev.hideFromAll && item.hideFromAll } : item);
      } else {
        prev.tags = Array.from(new Set([...prev.tags, ...item.tags]));
        prev.hideFromAll = prev.hideFromAll && item.hideFromAll;
      }
    }

    // Wires older than 3 days are noise. Official sources (weight 4+) post
    // rarely and matter most, so they keep 10 days.
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const fresh = Array.from(byTitle.values()).filter((i) => {
      const age = now - new Date(i.publishedAt).getTime();
      return age < (i.weight >= 4 ? 10 : 3) * DAY;
    });

    for (const i of fresh) i.score = rankScore(i, now);

    const items = nearDupePass(fresh.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()));
    return { items, status, fetchedAt: new Date().toISOString() };
  });
}

/**
 * Ranking: feed weight, a boost for the lanes this board exists for, and a
 * six-hour half-life so a high-weight story from yesterday still loses to a
 * decent one from this morning.
 */
const HALF_LIFE_HOURS = 6;
function rankScore(i: NewsItem, now: number): number {
  const ageHours = Math.max(0, (now - new Date(i.publishedAt).getTime()) / 3_600_000);
  const topicBoost = i.tags.includes("credit") ? 1.6 : i.tags.includes("economy") || i.tags.includes("regulatory") ? 1.3 : 1;
  return i.weight * topicBoost * Math.pow(0.5, ageHours / HALF_LIFE_HOURS);
}

/**
 * Ranked view with a per-publisher cap so no newsroom owns the board.
 * `capShare` is the share of `limit` one source may take (0.1 = ten percent).
 */
export function rankItems(items: NewsItem[], limit: number, capShare = 0.1): NewsItem[] {
  const cap = Math.max(3, Math.floor(limit * capShare));
  const perSource = new Map<string, number>();
  const out: NewsItem[] = [];
  for (const i of [...items].sort((a, b) => b.score - a.score)) {
    const n = perSource.get(i.source) ?? 0;
    if (n >= cap) continue;
    perSource.set(i.source, n + 1);
    out.push(i);
    if (out.length >= limit) break;
  }
  return out;
}

const tokens = (t: string) => new Set(normalizeTitle(t).split(" ").filter((w) => w.length > 3));

/**
 * Second dedupe pass for the same story under two headlines: drop an item
 * when its headline shares more than half its words with one kept in the
 * previous six hours. Also drops repeats of the same link. Input must be
 * sorted newest first.
 */
export function nearDupePass(items: NewsItem[]): NewsItem[] {
  const kept: { t: Set<string>; at: number }[] = [];
  const out: NewsItem[] = [];
  // A publisher can re-title a story and leave both headlines in its feed
  // under one URL. The id is the link hash and is the React key, so keep one.
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) continue;
    ids.add(item.id);
    const t = tokens(item.title);
    const at = new Date(item.publishedAt).getTime();
    let dupe = false;
    for (let i = kept.length - 1; i >= 0 && kept[i].at - at < 6 * 3600 * 1000; i--) {
      const k = kept[i].t;
      let inter = 0;
      for (const w of t) if (k.has(w)) inter++;
      const union = t.size + k.size - inter;
      if (union > 0 && inter / union > 0.5) {
        dupe = true;
        break;
      }
    }
    if (!dupe) {
      kept.push({ t, at });
      out.push(item);
    }
  }
  return out;
}

/** Company-specific headlines via Google News, promo sources removed, newest first. */
export async function getCompanyNews(name: string): Promise<NewsItem[]> {
  const feed: Feed = {
    id: `co-${name}`,
    name: "Company wire",
    url: `https://news.google.com/rss/search?q=${encodeURIComponent(`"${name}"`)}&hl=en-US&gl=US&ceid=US:en`,
    category: "markets",
    weight: 1,
  };
  return cached(`news:co:${name}`, 10 * MINUTE, async () => {
    const items = await fetchFeed(feed);
    const seen = new Set<string>();
    return nearDupePass(
      items
        .filter((i) => !NOISE_SOURCES.has(i.source))
        .filter((i) => {
          const k = normalizeTitle(i.title);
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()),
    ).slice(0, 25);
  });
}
