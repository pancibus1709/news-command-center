import { cached, HOUR } from "./cache";

// SEC EDGAR requires a descriptive User-Agent with contact info. Set
// SEC_USER_AGENT in .env.local to your own name and email; EDGAR blocks
// anonymous clients at the IP level and the failure is silent.
const UA = process.env.SEC_USER_AGENT ?? "NewsCommandCenter research@localhost";
if (!process.env.SEC_USER_AGENT) console.warn("[sec] SEC_USER_AGENT is not set. Copy .env.example to .env.local before heavy use.");

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
      items: string[];
      primaryDocument: string[];
      primaryDocDescription: string[];
    };
  };
};

// Form 4 insider trades are excluded; they would bury everything else.
const WATCH_FORMS = new Set(["10-K", "10-Q", "8-K", "DEF 14A", "S-1", "S-3", "S-3ASR", "424B2", "424B5", "FWP", "SC 13D", "SC 13G", "10-K/A", "10-Q/A", "20-F", "6-K"]);

/** Forms that signal debt issuance or a shelf registration. */
export const DEBT_FORMS = new Set(["424B2", "424B5", "FWP", "S-3", "S-3ASR"]);

// 8-K item numbers a reader actually cares about. Source: SEC Form 8-K instructions.
const ITEMS: Record<string, string> = {
  "1.01": "Material agreement",
  "1.02": "Agreement terminated",
  "1.03": "Bankruptcy",
  "2.01": "Acquisition / disposition",
  "2.02": "Results",
  "2.03": "Debt obligation",
  "2.04": "Acceleration of obligation",
  "2.05": "Exit costs",
  "2.06": "Impairment",
  "3.01": "Delisting notice",
  "3.02": "Unregistered equity sale",
  "4.01": "Auditor change",
  "4.02": "Non-reliance on financials",
  "5.01": "Change in control",
  "5.02": "Officer / director change",
  "5.03": "Charter / bylaw change",
  "5.07": "Shareholder vote",
  "7.01": "Reg FD",
  "8.01": "Other events",
  "9.01": "Exhibits",
};

function describe8K(items: string | undefined): string | null {
  if (!items) return null;
  const names = items
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && s !== "9.01")
    .map((s) => ITEMS[s] ?? `Item ${s}`);
  return names.length ? names.join(", ") : null;
}

export async function getFilings(cik: string): Promise<{ meta: Partial<Submissions>; filings: Filing[] }> {
  return cached(`sec:sub:${cik}`, 6 * HOUR, async () => {
    const s = await secJson<Submissions>(`https://data.sec.gov/submissions/CIK${cik}.json`);
    if (!s) return { meta: {}, filings: [] };
    const r = s.filings.recent;
    const filings: Filing[] = [];
    // Frequent issuers (banks) file dozens of 424B2 takedowns a month. Cap
    // those so the 10-K, 10-Q and 8-K rows still make the list.
    const perForm = new Map<string, number>();
    for (let i = 0; i < r.form.length && filings.length < 40; i++) {
      if (!WATCH_FORMS.has(r.form[i])) continue;
      const seen = perForm.get(r.form[i]) ?? 0;
      if (DEBT_FORMS.has(r.form[i]) && seen >= 6) continue;
      perForm.set(r.form[i], seen + 1);
      const acc = r.accessionNumber[i].replace(/-/g, "");
      const desc = r.form[i] === "8-K" ? describe8K(r.items?.[i]) : null;
      filings.push({
        form: r.form[i],
        filed: r.filingDate[i],
        description: desc ?? (r.primaryDocDescription[i] && r.primaryDocDescription[i] !== r.form[i] ? r.primaryDocDescription[i] : ""),
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
  operatingIncome: AnnualFact[];
  interestExpense: AnnualFact[];
  operatingCashFlow: AnnualFact[];
  capex: AnnualFact[];
  longTermDebt: AnnualFact[];
  cash: AnnualFact[];
  totalAssets: AnnualFact[];
  stockholdersEquity: AnnualFact[];
  deposits: AnnualFact[];
  /** Principal due in FY+1..FY+5 from the latest 10-K, when the filer tags it. */
  maturities: { year: number; value: number }[];
};

export const EMPTY_FUNDAMENTALS: Fundamentals = {
  revenue: [], netIncome: [], operatingIncome: [], interestExpense: [], operatingCashFlow: [], capex: [],
  longTermDebt: [], cash: [], totalAssets: [], stockholdersEquity: [], deposits: [], maturities: [],
};

type Fact = { fy: number; fp: string; form: string; end: string; val: number; start?: string; filed: string };
type Facts = { facts: Record<string, Record<string, { units: Record<string, Fact[]> }>> };

// XBRL concept names drift between filers and over time. Evaluate every
// alias and keep the one with the most recent fiscal year.
const CONCEPTS: Record<Exclude<keyof Fundamentals, "maturities">, { aliases: string[]; duration: boolean }> = {
  revenue: { aliases: ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet", "RevenuesNetOfInterestExpense"], duration: true },
  netIncome: { aliases: ["NetIncomeLoss", "ProfitLoss"], duration: true },
  operatingIncome: { aliases: ["OperatingIncomeLoss"], duration: true },
  interestExpense: { aliases: ["InterestExpense", "InterestExpenseNonoperating", "InterestExpenseDebt", "InterestAndDebtExpense"], duration: true },
  operatingCashFlow: { aliases: ["NetCashProvidedByUsedInOperatingActivities"], duration: true },
  capex: { aliases: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"], duration: true },
  longTermDebt: {
    aliases: [
      "LongTermDebtNoncurrent",
      "LongTermDebt",
      "LongTermDebtAndCapitalLeaseObligations",
      "LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities",
      "DebtLongtermAndShorttermCombinedAmount",
    ],
    duration: false,
  },
  cash: { aliases: ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"], duration: false },
  totalAssets: { aliases: ["Assets"], duration: false },
  stockholdersEquity: { aliases: ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"], duration: false },
  deposits: { aliases: ["Deposits"], duration: false },
};

const MATURITY_CONCEPTS = [
  "LongTermDebtMaturitiesRepaymentsOfPrincipalInNextTwelveMonths",
  "LongTermDebtMaturitiesRepaymentsOfPrincipalInYearTwo",
  "LongTermDebtMaturitiesRepaymentsOfPrincipalInYearThree",
  "LongTermDebtMaturitiesRepaymentsOfPrincipalInYearFour",
  "LongTermDebtMaturitiesRepaymentsOfPrincipalInYearFive",
];

/**
 * Annual values from 10-K rows with fp=FY. Keyed on period end, not on the
 * filing's fy: later 10-Ks restate prior years as comparatives, and the
 * most recently filed value for a given period end is the restated one.
 * The displayed FY is the calendar year the period ends in, which matches
 * SEC convention (NVDA's year ending Jan 2026 is FY2026).
 */
function annualSeries(entries: Fact[] | undefined, duration: boolean): AnnualFact[] {
  if (!entries) return [];
  const byEnd = new Map<string, Fact>();
  for (const e of entries) {
    if (!e.form.startsWith("10-K") || e.fp !== "FY") continue;
    if (duration) {
      if (!e.start) continue;
      const days = (new Date(e.end).getTime() - new Date(e.start).getTime()) / 864e5;
      if (days < 300 || days > 380) continue;
    }
    const prev = byEnd.get(e.end);
    if (!prev || e.filed > prev.filed) byEnd.set(e.end, e);
  }
  return Array.from(byEnd.values())
    .map((e) => ({ fy: parseInt(e.end.slice(0, 4), 10), end: e.end, value: e.val }))
    .sort((a, b) => (a.end < b.end ? -1 : 1))
    .slice(-6);
}

export async function getFundamentals(cik: string): Promise<Fundamentals> {
  return cached(`sec:facts:${cik}`, 12 * HOUR, async () => {
    const f = await secJson<Facts>(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`);
    if (!f?.facts?.["us-gaap"]) return EMPTY_FUNDAMENTALS;
    const gaap = f.facts["us-gaap"];
    const out: Fundamentals = { ...EMPTY_FUNDAMENTALS };
    const staleBefore = new Date().getFullYear() - 2;

    for (const key of Object.keys(CONCEPTS) as (keyof typeof CONCEPTS)[]) {
      const { aliases, duration } = CONCEPTS[key];
      let best: AnnualFact[] = [];
      for (const alias of aliases) {
        const rows = annualSeries(gaap[alias]?.units?.USD, duration);
        if (!rows.length) continue;
        const lastFy = rows[rows.length - 1].fy;
        const bestFy = best.length ? best[best.length - 1].fy : -1;
        if (lastFy > bestFy || (lastFy === bestFy && rows.length > best.length)) best = rows;
      }
      // A concept the filer abandoned years ago is worse than a blank row.
      out[key] = best.length && best[best.length - 1].fy >= staleBefore ? best : [];
    }

    // Maturity ladder from the latest 10-K, when tagged.
    const latestEnd = out.longTermDebt[out.longTermDebt.length - 1]?.end;
    if (latestEnd) {
      const baseYear = parseInt(latestEnd.slice(0, 4), 10);
      const ladder: { year: number; value: number }[] = [];
      MATURITY_CONCEPTS.forEach((concept, i) => {
        const rows = gaap[concept]?.units?.USD?.filter((e) => e.form.startsWith("10-K") && e.end === latestEnd);
        if (!rows?.length) return;
        const latest = rows.reduce((a, b) => (a.filed > b.filed ? a : b));
        ladder.push({ year: baseYear + i + 1, value: latest.val });
      });
      if (ladder.length >= 3) out.maturities = ladder;
    }
    return out;
  });
}
