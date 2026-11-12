// Shared contract for the portfolio section. The data file itself
// (data/portfolio.json, or the PORTFOLIO_JSON env var on Vercel) is private
// and never committed: this repo is public.

import type { NewsItem } from "./news";

export type PositionKind = "stock" | "etf" | "fund" | "cash";

/** One lot-aggregated position as imported from the broker export. */
export type PositionRecord = {
  /** Account id, matches PortfolioFile.accounts[].id */
  account: string;
  symbol: string;
  /** Clean display / news-search name, e.g. "Advanced Micro Devices". */
  name: string;
  kind: PositionKind;
  /** Null for cash sweeps. */
  quantity: number | null;
  /** Total cost basis in USD. Null for cash. */
  costBasis: number | null;
  /** Price and value at export time; the fallback when no live quote exists. */
  snapPrice: number | null;
  snapValue: number;
};

export type PortfolioFile = {
  owner: string;
  /** ISO timestamp of the broker export. */
  asOf: string;
  source: string;
  accounts: { id: string; label: string; note?: string }[];
  positions: PositionRecord[];
};

export type Holding = PositionRecord & {
  price: number | null;
  /** Per-share change today. */
  dayChange: number | null;
  dayChangePct: number | null;
  /** quantity x price (snapValue when no live quote). */
  value: number;
  dayPnl: number | null;
  totalPnl: number | null;
  totalPnlPct: number | null;
  /** Share of its account, 0-100. */
  weightAccount: number;
  /** Share of the whole portfolio, 0-100. */
  weightTotal: number;
  /** "snapshot" means Yahoo had no quote and the export price is shown. */
  priceSource: "live" | "snapshot";
  state: string | null;
  asOf: string | null;
  delayMin: number | null;
  /** Next earnings date, ISO, when Yahoo reports one in the future. */
  earningsDate: string | null;
  fiftyTwoWeekLow: number | null;
  fiftyTwoWeekHigh: number | null;
};

export type Totals = {
  value: number;
  costBasis: number;
  cash: number;
  dayPnl: number;
  /** Day P&L over prior-day value, percent. */
  dayPnlPct: number | null;
  totalPnl: number;
  totalPnlPct: number | null;
};

export type AccountSummary = Totals & {
  id: string;
  label: string;
  note?: string;
  /** Sorted by value, largest first. Cash last. */
  holdings: Holding[];
};

/** A symbol held in more than one account, rolled into one row. */
export type SymbolRollup = Omit<Holding, "account" | "weightAccount"> & {
  accounts: string[];
};

export type PortfolioPayload = {
  /** False when no data file or env var is present; the UI shows setup steps. */
  configured: boolean;
  owner: string;
  snapshotAsOf: string | null;
  fetchedAt: string;
  marketState: string;
  totals: Totals;
  accounts: AccountSummary[];
  /** Consolidated across accounts, sorted by value. */
  bySymbol: SymbolRollup[];
  /** Symbols priced from the snapshot because no live quote came back. */
  staleSymbols: string[];
};

export type PortfolioNewsItem = NewsItem & {
  /** Held symbols this headline is about. */
  symbols: string[];
};

export type PortfolioNewsPayload = {
  items: PortfolioNewsItem[];
  /** Symbols covered, with headline counts, largest position first. */
  symbols: { symbol: string; name: string; count: number }[];
  fetchedAt: string;
};

/** Quote row for the watchlist (any symbol, not only holdings). */
export type WatchQuote = {
  symbol: string;
  name: string | null;
  price: number | null;
  change: number | null;
  changePct: number | null;
  state: string | null;
  asOf: string | null;
  fiftyTwoWeekLow: number | null;
  fiftyTwoWeekHigh: number | null;
  marketCap: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  earningsDate: string | null;
  /** True when Yahoo returned nothing for the symbol. */
  missing: boolean;
};

export type QuotesPayload = { quotes: WatchQuote[]; fetchedAt: string };
