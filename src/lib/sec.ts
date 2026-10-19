import { cached, HOUR } from "./cache";

// SEC EDGAR requires a descriptive User-Agent with contact info. Set
// SEC_USER_AGENT in .env.local to your own name and email before heavy use.
const UA = process.env.SEC_USER_AGENT ?? "NewsCommandCenter research@localhost";

async function secJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

type TickerRow = { cik_str: number; ticker: string; title: string };

export async function tickerToCik(ticker: string): Promise<string | null> {
  const map = await cached("sec:tickers", 24 * HOUR, async () => {
    const data = await secJson<Record<string, TickerRow>>("https://www.sec.gov/files/company_tickers.json");
    const m = new Map<string, string>();
    if (data) for (const row of Object.values(data)) m.set(row.ticker.toUpperCase(), String(row.cik_str).padStart(10, "0"));
    return m;
  });
  return map.get(ticker.toUpperCase().replace(/[-.]/g, "")) ?? map.get(ticker.toUpperCase()) ?? null;
}

export type Filing = {
  form: string;
  filed: string;
  description: string;
  url: string;
};

type Submissions = {
  name: string;
  sic: string;
  sicDescription: string;
  stateOfIncorporation: string;
  fiscalYearEnd: string;
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      form: string[];
      primaryDocument: string[];
      primaryDocDescription: string[];
    };
  };
};

// Form 4 insider trades are excluded; they would bury everything else.
const WATCH_FORMS = new Set(["10-K", "10-Q", "8-K", "DEF 14A", "S-1", "S-3", "424B2", "424B5", "SC 13D", "SC 13G", "10-K/A", "10-Q/A", "20-F", "6-K"]);

export async function getFilings(cik: string): Promise<{ meta: Partial<Submissions>; filings: Filing[] }> {
  return cached(`sec:sub:${cik}`, 6 * HOUR, async () => {
    const s = await secJson<Submissions>(`https://data.sec.gov/submissions/CIK${cik}.json`);
    if (!s) return { meta: {}, filings: [] };
    const r = s.filings.recent;
    const filings: Filing[] = [];
    for (let i = 0; i < r.form.length && filings.length < 40; i++) {
      if (!WATCH_FORMS.has(r.form[i])) continue;
      const acc = r.accessionNumber[i].replace(/-/g, "");
      filings.push({
        form: r.form[i],
        filed: r.filingDate[i],
        description: r.primaryDocDescription[i] || r.form[i],
        url: `https://www.sec.gov/Archives/edgar/data/${parseInt(cik, 10)}/${acc}/${r.primaryDocument[i]}`,
      });
    }
    return {
      meta: { name: s.name, sic: s.sic, sicDescription: s.sicDescription, stateOfIncorporation: s.stateOfIncorporation, fiscalYearEnd: s.fiscalYearEnd },
      filings,
    };
  });
}

export type AnnualFact = { fy: number; end: string; value: number };
export type Fundamentals = {
  revenue: AnnualFact[];
  netIncome: AnnualFact[];
  operatingCashFlow: AnnualFact[];
  longTermDebt: AnnualFact[];
  cash: AnnualFact[];
  totalAssets: AnnualFact[];
  stockholdersEquity: AnnualFact[];
};

type Facts = {
  facts: Record<string, Record<string, { units: Record<string, { fy: number; fp: string; form: string; end: string; val: number; start?: string }[]> }>>;
};

// XBRL concept names drift between filers. Try each alias in order and take
// the first with data.
const CONCEPTS: Record<keyof Fundamentals, { aliases: string[]; unit: string; duration: boolean }> = {
  revenue: { aliases: ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet", "RevenuesNetOfInterestExpense"], unit: "USD", duration: true },
  netIncome: { aliases: ["NetIncomeLoss", "ProfitLoss"], unit: "USD", duration: true },
  operatingCashFlow: { aliases: ["NetCashProvidedByUsedInOperatingActivities"], unit: "USD", duration: true },
  longTermDebt: { aliases: ["LongTermDebtNoncurrent", "LongTermDebt", "LongTermDebtAndCapitalLeaseObligations"], unit: "USD", duration: false },
  cash: { aliases: ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"], unit: "USD", duration: false },
  totalAssets: { aliases: ["Assets"], unit: "USD", duration: false },
  stockholdersEquity: { aliases: ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"], unit: "USD", duration: false },
};

export async function getFundamentals(cik: string): Promise<Fundamentals> {
  return cached(`sec:facts:${cik}`, 12 * HOUR, async () => {
    const empty: Fundamentals = { revenue: [], netIncome: [], operatingCashFlow: [], longTermDebt: [], cash: [], totalAssets: [], stockholdersEquity: [] };
    const f = await secJson<Facts>(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`);
    if (!f?.facts?.["us-gaap"]) return empty;
    const gaap = f.facts["us-gaap"];
    const out = { ...empty };
    for (const key of Object.keys(CONCEPTS) as (keyof Fundamentals)[]) {
      const { aliases, unit, duration } = CONCEPTS[key];
      // Filers migrate between concept names over time (Apple moved from
      // Revenues to RevenueFromContractWithCustomer... in 2018). Evaluate
      // every alias and keep the one with the most recent fiscal year.
      let best: AnnualFact[] = [];
      for (const alias of aliases) {
        const entries = gaap[alias]?.units?.[unit];
        if (!entries) continue;
        // Annual values only: 10-K rows with fp=FY. For durations, require a
        // full-year span so Q4-only values don't sneak in.
        const byFy = new Map<number, AnnualFact>();
        for (const e of entries) {
          if (!e.form.startsWith("10-K") || e.fp !== "FY") continue;
          if (duration && e.start) {
            const days = (new Date(e.end).getTime() - new Date(e.start).getTime()) / 864e5;
            if (days < 300) continue;
          }
          // Later filings restate earlier years; keep the most recent "end" per fy.
          const prev = byFy.get(e.fy);
          if (!prev || e.end > prev.end) byFy.set(e.fy, { fy: e.fy, end: e.end, value: e.val });
        }
        const rows = Array.from(byFy.values()).sort((a, b) => a.fy - b.fy).slice(-6);
        if (!rows.length) continue;
        const newer = !best.length || rows[rows.length - 1].fy > best[best.length - 1].fy;
        const sameYearMoreRows = best.length && rows[rows.length - 1].fy === best[best.length - 1].fy && rows.length > best.length;
        if (newer || sameYearMoreRows) best = rows;
      }
      out[key] = best;
    }
    return out;
  });
}
