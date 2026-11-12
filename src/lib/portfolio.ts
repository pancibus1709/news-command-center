import { yf } from "./yahoo";
import { cached, MINUTE } from "./cache";
import { loadPortfolioFile } from "./positions";
import type {
  AccountSummary,
  Holding,
  PortfolioPayload,
  PositionRecord,
  QuotesPayload,
  SymbolRollup,
  Totals,
  WatchQuote,
} from "./portfolio-types";

const quoteList = (symbols: string[]) => yf.quote(symbols);
type YQuote = Awaited<ReturnType<typeof quoteList>>[number];

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const iso = (v: unknown): string | null => (v instanceof Date && !isNaN(+v) ? v.toISOString() : null);
const pct = (n: number, d: number): number | null => (d ? (n / d) * 100 : null);

function futureEarnings(q: YQuote | undefined): string | null {
  const d = q?.earningsTimestamp ?? q?.earningsTimestampStart;
  return d instanceof Date && d.getTime() > Date.now() ? d.toISOString() : null;
}

/**
 * One batched call; if Yahoo rejects the batch (it throws when a list holds
 * nothing it recognizes, or on a schema validation miss), retry per symbol so
 * one bad ticker cannot blank the rest. Never throws.
 */
async function fetchQuotes(symbols: string[]): Promise<Map<string, YQuote>> {
  const out = new Map<string, YQuote>();
  if (!symbols.length) return out;
  try {
    for (const q of await quoteList(symbols)) out.set(q.symbol, q);
    return out;
  } catch {
    const each = await Promise.allSettled(symbols.map((s) => quoteList([s])));
    for (const r of each) if (r.status === "fulfilled") for (const q of r.value) out.set(q.symbol, q);
    return out;
  }
}

function zeroTotals(): Totals {
  return { value: 0, costBasis: 0, cash: 0, dayPnl: 0, dayPnlPct: null, totalPnl: 0, totalPnlPct: null };
}

function sumTotals(rows: { kind: string; value: number; costBasis: number | null; dayPnl: number | null; totalPnl: number | null }[]): Totals {
  const t = zeroTotals();
  for (const r of rows) {
    t.value += r.value;
    if (r.kind === "cash") {
      t.cash += r.value;
      continue;
    }
    t.costBasis += r.costBasis ?? 0;
    t.dayPnl += r.dayPnl ?? 0;
    t.totalPnl += r.totalPnl ?? 0;
  }
  t.dayPnlPct = pct(t.dayPnl, t.value - t.dayPnl);
  t.totalPnlPct = pct(t.totalPnl, t.costBasis);
  return t;
}

const byValue = (a: { kind: string; value: number }, b: { kind: string; value: number }) =>
  Number(a.kind === "cash") - Number(b.kind === "cash") || b.value - a.value;

function buildHolding(p: PositionRecord, q: YQuote | undefined): Holding {
  const base = {
    ...p,
    weightAccount: 0,
    weightTotal: 0,
    state: q?.marketState ?? null,
    asOf: iso(q?.regularMarketTime),
    delayMin: num(q?.exchangeDataDelayedBy),
    earningsDate: futureEarnings(q),
    fiftyTwoWeekLow: num(q?.fiftyTwoWeekLow),
    fiftyTwoWeekHigh: num(q?.fiftyTwoWeekHigh),
  };
  const price = num(q?.regularMarketPrice);

  if (p.kind === "cash" || p.quantity == null) {
    return {
      ...base,
      price: null,
      dayChange: null,
      dayChangePct: null,
      value: p.snapValue,
      dayPnl: null,
      totalPnl: null,
      totalPnlPct: null,
      priceSource: "snapshot",
    };
  }

  const live = price != null;
  const value = live ? p.quantity * price : p.snapValue;
  const dayChange = live ? num(q?.regularMarketChange) : null;
  const totalPnl = p.costBasis != null ? value - p.costBasis : null;
  return {
    ...base,
    price: live ? price : p.snapPrice,
    dayChange,
    dayChangePct: live ? num(q?.regularMarketChangePercent) : null,
    value,
    dayPnl: dayChange != null ? p.quantity * dayChange : null,
    totalPnl,
    totalPnlPct: totalPnl != null && p.costBasis ? pct(totalPnl, p.costBasis) : null,
    priceSource: live ? "live" : "snapshot",
  };
}

function rollup(holdings: Holding[], grand: number): SymbolRollup[] {
  const groups = new Map<string, Holding[]>();
  for (const h of holdings) groups.set(h.symbol, [...(groups.get(h.symbol) ?? []), h]);

  const sumOrNull = (xs: (number | null)[]) =>
    xs.some((x) => x != null) ? xs.reduce<number>((s, x) => s + (x ?? 0), 0) : null;

  return [...groups.values()]
    .map((hs): SymbolRollup => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { account, weightAccount, ...first } = hs[0];
      const value = hs.reduce((s, h) => s + h.value, 0);
      const costBasis = sumOrNull(hs.map((h) => h.costBasis));
      const totalPnl = sumOrNull(hs.map((h) => h.totalPnl));
      return {
        ...first,
        accounts: [...new Set(hs.map((h) => h.account))],
        quantity: sumOrNull(hs.map((h) => h.quantity)),
        costBasis,
        snapValue: hs.reduce((s, h) => s + h.snapValue, 0),
        value,
        dayPnl: sumOrNull(hs.map((h) => h.dayPnl)),
        totalPnl,
        totalPnlPct: totalPnl != null && costBasis ? pct(totalPnl, costBasis) : null,
        priceSource: hs.some((h) => h.priceSource === "snapshot") ? "snapshot" : "live",
        weightTotal: pct(value, grand) ?? 0,
      };
    })
    .sort(byValue);
}

export async function getPortfolio(): Promise<PortfolioPayload> {
  const file = await loadPortfolioFile();
  const fetchedAt = new Date().toISOString();
  if (!file) {
    return {
      configured: false,
      owner: "",
      snapshotAsOf: null,
      fetchedAt,
      marketState: "UNKNOWN",
      totals: zeroTotals(),
      accounts: [],
      bySymbol: [],
      staleSymbols: [],
    };
  }

  const symbols = [...new Set(file.positions.filter((p) => p.kind !== "cash").map((p) => p.symbol))].sort();
  const quotes = await cached("portfolio:live", MINUTE, () => fetchQuotes(symbols));

  const holdings = file.positions.map((p) => buildHolding(p, quotes.get(p.symbol)));
  const totals = sumTotals(holdings);
  for (const h of holdings) h.weightTotal = pct(h.value, totals.value) ?? 0;

  const accounts: AccountSummary[] = file.accounts.map((a) => {
    const hs = holdings.filter((h) => h.account === a.id).sort(byValue);
    const t = sumTotals(hs);
    for (const h of hs) h.weightAccount = pct(h.value, t.value) ?? 0;
    return { ...t, id: a.id, label: a.label, ...(a.note ? { note: a.note } : {}), holdings: hs };
  });

  const stale = holdings.filter((h) => h.kind !== "cash" && h.priceSource === "snapshot").map((h) => h.symbol);
  const equity = [...quotes.values()].find((q) => q.quoteType === "EQUITY" && q.marketState) ?? [...quotes.values()].find((q) => q.marketState);

  return {
    configured: true,
    owner: file.owner,
    snapshotAsOf: file.asOf,
    fetchedAt,
    marketState: equity?.marketState ?? "UNKNOWN",
    totals,
    accounts,
    bySymbol: rollup(holdings, totals.value),
    staleSymbols: [...new Set(stale)],
  };
}

const SYMBOL_RE = /^[A-Z0-9.^=-]{1,12}$/;

export function sanitizeSymbols(input: string[]): string[] {
  const out: string[] = [];
  for (const raw of input) {
    const s = raw.trim().toUpperCase();
    if (SYMBOL_RE.test(s) && !out.includes(s)) out.push(s);
    if (out.length >= 40) break;
  }
  return out;
}

export async function getWatchQuotes(symbols: string[]): Promise<QuotesPayload> {
  const list = sanitizeSymbols(symbols);
  const fetchedAt = new Date().toISOString();
  if (!list.length) return { quotes: [], fetchedAt };

  const key = `quotes:${[...list].sort().join(",")}`;
  const bySym = await cached(key, MINUTE, () => fetchQuotes(list));

  const quotes = list.map((symbol): WatchQuote => {
    const q = bySym.get(symbol);
    return {
      symbol,
      name: q?.shortName ?? q?.longName ?? null,
      price: num(q?.regularMarketPrice),
      change: num(q?.regularMarketChange),
      changePct: num(q?.regularMarketChangePercent),
      state: q?.marketState ?? null,
      asOf: iso(q?.regularMarketTime),
      fiftyTwoWeekLow: num(q?.fiftyTwoWeekLow),
      fiftyTwoWeekHigh: num(q?.fiftyTwoWeekHigh),
      marketCap: num(q?.marketCap),
      trailingPE: num(q?.trailingPE),
      forwardPE: num(q?.forwardPE),
      earningsDate: futureEarnings(q),
      missing: !q,
    };
  });
  return { quotes, fetchedAt };
}
