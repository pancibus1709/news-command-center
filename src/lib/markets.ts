import { yf } from "./yahoo";
import { cached, MINUTE } from "./cache";

export type Quote = {
  symbol: string;
  label: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
  /** Rates quote in yield points, everything else in price. */
  unit: "price" | "yield";
};

export type MarketBoard = {
  indices: Quote[];
  rates: Quote[];
  creditEtfs: Quote[];
  risk: Quote[];
  sectors: Quote[];
  fetchedAt: string;
  marketState: string;
};

type Def = { symbol: string; label: string; unit?: "price" | "yield" };

const INDICES: Def[] = [
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^DJI", label: "Dow" },
  { symbol: "^IXIC", label: "Nasdaq" },
  { symbol: "^RUT", label: "Russell 2000" },
  { symbol: "^STOXX50E", label: "Euro Stoxx 50" },
  { symbol: "^N225", label: "Nikkei 225" },
];

const RATES: Def[] = [
  { symbol: "^IRX", label: "3M T-Bill", unit: "yield" },
  { symbol: "^FVX", label: "5Y Treasury", unit: "yield" },
  { symbol: "^TNX", label: "10Y Treasury", unit: "yield" },
  { symbol: "^TYX", label: "30Y Treasury", unit: "yield" },
];

const CREDIT: Def[] = [
  { symbol: "HYG", label: "HY Corp (HYG)" },
  { symbol: "JNK", label: "HY Corp (JNK)" },
  { symbol: "LQD", label: "IG Corp (LQD)" },
  { symbol: "BKLN", label: "Lev Loans (BKLN)" },
  { symbol: "EMB", label: "EM Debt (EMB)" },
  { symbol: "TLT", label: "20Y+ Tsy (TLT)" },
];

const RISK: Def[] = [
  { symbol: "^VIX", label: "VIX" },
  { symbol: "DX-Y.NYB", label: "US Dollar" },
  { symbol: "CL=F", label: "WTI Crude" },
  { symbol: "GC=F", label: "Gold" },
  { symbol: "BTC-USD", label: "Bitcoin" },
  { symbol: "EURUSD=X", label: "EUR/USD" },
];

const SECTORS: Def[] = [
  { symbol: "XLK", label: "Tech" },
  { symbol: "XLF", label: "Financials" },
  { symbol: "XLE", label: "Energy" },
  { symbol: "XLV", label: "Health" },
  { symbol: "XLI", label: "Industrials" },
  { symbol: "XLY", label: "Cons Disc" },
  { symbol: "XLP", label: "Staples" },
  { symbol: "XLU", label: "Utilities" },
  { symbol: "XLRE", label: "Real Estate" },
  { symbol: "XLB", label: "Materials" },
  { symbol: "XLC", label: "Comm Svcs" },
];

const ALL = [...INDICES, ...RATES, ...CREDIT, ...RISK, ...SECTORS];

export async function getMarketBoard(): Promise<MarketBoard> {
  return cached("markets:board", MINUTE, async () => {
    const symbols = ALL.map((d) => d.symbol);
    const raw = await yf.quote(symbols);
    const bySym = new Map(raw.map((q) => [q.symbol, q]));

    const build = (defs: Def[]): Quote[] =>
      defs.map((d) => {
        const q = bySym.get(d.symbol);
        return {
          symbol: d.symbol,
          label: d.label,
          price: q?.regularMarketPrice ?? null,
          change: q?.regularMarketChange ?? null,
          changePct: q?.regularMarketChangePercent ?? null,
          unit: d.unit ?? "price",
        };
      });

    const spx = bySym.get("^GSPC");
    return {
      indices: build(INDICES),
      rates: build(RATES),
      creditEtfs: build(CREDIT),
      risk: build(RISK),
      sectors: build(SECTORS).sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0)),
      fetchedAt: new Date().toISOString(),
      marketState: spx?.marketState ?? "UNKNOWN",
    };
  });
}
