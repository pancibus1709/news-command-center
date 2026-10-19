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

// ---------------------------------------------------------------------------
// Agency ratings as the issuer states them in its own filings. Banks print a
// ratings table in every 10-K and 10-Q; most industrials only mention a grade
// in an 8-K press release when it changes. EDGAR full-text search finds the
// newest filings that name an agency, the documents are fetched and stripped
// to text, and a grade is read only when it sits within a short window after
// the agency's name. Credit-agreement exhibits (EX-10, EX-4) are skipped: they
// list every grade on the pricing grid, not the issuer's own rating.

export type Agency = "Moody's" | "S&P" | "Fitch";

export type FilingRating = {
  agency: Agency;
  rating: string | null; // null when a filing mentions an action but not the grade
  outlook: string | null;
  action: "upgrade" | "downgrade" | "investment grade" | null;
  filed: string;
  form: string;
  url: string;
};

type FtsHit = {
  _id: string;
  _source: { file_date: string; form: string; file_type: string; adsh: string; ciks: string[] };
};

const AGENCY_RX: Record<Agency, RegExp> = {
  "Moody's": /Moody[’']s(?: Investors Service| Ratings)?/g,
  "S&P": /S&P(?: Global)?(?: Ratings)?|Standard\s*&\s*Poor[’']s/g,
  Fitch: /Fitch(?: Ratings)?/g,
};
// A grade must be followed by whitespace or punctuation, never a digit (A-1 is
// a short-term rating) and never a lowercase word ("A rating is not...").
// Single-letter grades (S&P "A", Moody's "C") also have to avoid reading the
// article in "A rating is not a recommendation" as a grade.
const END = "(?=[\\s,.;:)])";
const MOODYS_GRADE = new RegExp(`\\b(?:(Aaa|Aa[1-3]|A[1-3]|Baa[1-3]|Ba[1-3]|B[1-3]|Caa[1-3]|Ca)${END}|(C)${END}(?!\\s?[a-z]))`);
const SP_GRADE = new RegExp(`\\b(?:(AAA|AA[+-]?|A[+-]|BBB[+-]?|BB[+-]?|B[+-]|CCC[+-]?|CC)${END}|([ABCD])${END}(?!\\s?[a-z]))`);
const OUTLOOK = /\b(stable|positive|negative|developing)\b/i;
const ACTION = /upgrad|downgrad|investment grade/i;
const actionWord = (m: string): FilingRating["action"] => (/^upgrad/i.test(m) ? "upgrade" : /^downgrad/i.test(m) ? "downgrade" : "investment grade");
const INDEX = /^\s*(500|Financials|Index|Composite|MidCap|SmallCap|Dow|Global Market)/;

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8217;|&rsquo;/g, "’")
    .replace(/&[a-z]+;|&#\d+;/g, " ")
    .replace(/\s+/g, " ");
}

const cap = (w: string | undefined): string | null => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : null);

function scanRatings(text: string, hit: FtsHit, url: string): FilingRating[] {
  const out: FilingRating[] = [];
  for (const agency of Object.keys(AGENCY_RX) as Agency[]) {
    const rx = new RegExp(AGENCY_RX[agency].source, "g");
    let m: RegExpExecArray | null;
    let found = false;
    while ((m = rx.exec(text)) && out.length < 30) {
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 140);
      if (INDEX.test(after)) continue;
      const g = (agency === "Moody's" ? MOODYS_GRADE : SP_GRADE).exec(after);
      // The grade has to belong to this sentence and this agency.
      const grade = g && !/[.;]/.test(after.slice(0, g.index)) && !/Moody|S&P|Standard|Fitch/.test(after.slice(0, g.index)) ? g : null;
      const around = text.slice(Math.max(0, m.index - 120), m.index + m[0].length + 160);
      const action = ACTION.exec(around);
      if (grade) {
        const o = OUTLOOK.exec(after.slice(grade.index + grade[0].length, grade.index + grade[0].length + 90));
        out.push({ agency, rating: grade[1] ?? grade[2], outlook: cap(o?.[1]), action: action ? actionWord(action[0]) : null, filed: hit._source.file_date, form: hit._source.form, url });
        found = true;
        break; // first grade in the newest filing is the issuer-level one
      }
      if (action && !found) {
        const o = OUTLOOK.exec(around);
        out.push({ agency, rating: null, outlook: cap(o?.[1]), action: actionWord(action[0]), filed: hit._source.file_date, form: hit._source.form, url });
        found = true;
      }
    }
  }
  return out;
}

const SKIP_EXHIBIT = /^EX-(10|4)/;
const MAX_DOC_BYTES = 16 * 1024 * 1024;

/**
 * Rating statements from the six newest 10-K, 10-Q and 8-K documents of
 * the last two years that name an agency. Prospectus supplements are left
 * out: frequent issuers file hundreds that only cite the S&P 500. Empty when the issuer never states a grade, which
 * is the norm for non-financial investment-grade names.
 */
export async function getFilingRatings(cik: string): Promise<FilingRating[]> {
  return cached(`sec:ratings:${cik}`, 12 * HOUR, async () => {
    const end = new Date();
    const start = new Date(end.getTime() - 2 * 365 * 864e5);
    const q = encodeURIComponent(`Moody's OR Fitch OR S&P OR "Standard & Poor's"`);
    const url =
      `https://efts.sec.gov/LATEST/search-index?q=${q}&dateRange=custom` +
      `&startdt=${start.toISOString().slice(0, 10)}&enddt=${end.toISOString().slice(0, 10)}` +
      `&ciks=${cik}&forms=10-K,10-Q,8-K`;
    const res = await secJson<{ hits: { hits: FtsHit[] } }>(url);
    if (!res) return [];
    const docs = res.hits.hits
      .filter((h) => !SKIP_EXHIBIT.test(h._source.file_type))
      .sort((a, b) => (a._source.file_date < b._source.file_date ? 1 : -1))
      .slice(0, 6);

    const results = await Promise.all(
      docs.map(async (h) => {
        const [adsh, file] = h._id.split(":");
        const docUrl = `https://www.sec.gov/Archives/edgar/data/${parseInt(cik, 10)}/${adsh.replace(/-/g, "")}/${file}`;
        try {
          const r = await fetch(docUrl, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
          if (!r.ok) return [];
          const len = Number(r.headers.get("content-length") ?? 0);
          if (len > MAX_DOC_BYTES) return [];
          return scanRatings(htmlToText(await r.text()), h, docUrl);
        } catch {
          return [];
        }
      }),
    );
    return results.flat();
  });
}
