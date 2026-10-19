import { cached, HOUR, MINUTE } from "./cache";

// FINRA TRACE reference data, the public dataset behind finra.org's
// "Corporate and Agency Bonds" explorer. No key: the service uses a
// double-submit XSRF token, so any UUID sent as both cookie and header is
// accepted. The old Morningstar Bond Center (finra-markets.morningstar.com)
// is gone; it redirects to finra.org and was dropped after a live probe
// on 2026-10-19.
//
// The dataset only filters with EQUAL and a free-text match, so a ticker is
// resolved to FINRA's exact issuer name first (see resolveIssuer).

const BASE = "https://services-dynarep.ddwa.finra.org/public/reporting/v2/data/group/FixedIncomeMarket/name/CorporateAndAgencySecurities";
const UA = "NewsCommandCenter (github: news-command-center)";

type Row = {
  issuerName: string | null;
  issueSymbolIdentifier: string | null;
  cusip: string | null;
  couponRate: string | null;
  couponType: string | null;
  maturityDate: string | null;
  lastSalePrice: string | null;
  lastSaleYield: string | null;
  lastTradeDate: string | null;
  moodysRating: string | null;
  moodyRatingDate: string | null;
  standardAndPoorsRating: string | null;
  standardAndPoorsRatingDate: string | null;
  productSubTypeCode: string | null;
  isConvertible: string | null;
  isPerpetual: string | null;
  is144A: string | null;
};

const FIELDS: (keyof Row)[] = [
  "issuerName", "issueSymbolIdentifier", "cusip", "couponRate", "couponType", "maturityDate",
  "lastSalePrice", "lastSaleYield", "lastTradeDate", "moodysRating", "moodyRatingDate",
  "standardAndPoorsRating", "standardAndPoorsRatingDate", "productSubTypeCode", "isConvertible", "isPerpetual", "is144A",
];

async function query(body: Record<string, unknown>): Promise<Row[] | null> {
  const token = crypto.randomUUID();
  try {
    const res = await fetch(BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": UA,
        Cookie: `XSRF-TOKEN=${token}`,
        "X-XSRF-TOKEN": token,
      },
      body: JSON.stringify({ fields: FIELDS, ...body }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { status: string; returnBody?: { data: string | null } };
    if (j.status !== "success") return null;
    return j.returnBody?.data ? (JSON.parse(j.returnBody.data) as Row[]) : [];
  } catch {
    return null;
  }
}

// FINRA abbreviates issuer names the way a 1980s mainframe did.
const ABBREV: Record<string, string> = {
  CORPORATION: "CORP", INCORPORATED: "INC", COMPANY: "CO", LIMITED: "LTD", HOLDINGS: "HLDGS", HOLDING: "HLDG",
  FINANCIAL: "FINL", FINANCE: "FIN", BANK: "BK", MOTOR: "MTR", MOTORS: "MTRS", INTERNATIONAL: "INTL", ENERGY: "ENERGY",
  TECHNOLOGIES: "TECHNOLOGIES", COMMUNICATIONS: "COMMUNICATIONS", INDUSTRIES: "INDS", AMERICA: "AMER", NATIONAL: "NATL",
};
const NOISE = new Set(["THE", "&", "AND", "PLC", "SA", "NV", "AG", "SE", "DEL"]);

function tokens(name: string): string[] {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9& ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t && !NOISE.has(t))
    .map((t) => ABBREV[t] ?? t);
}

/**
 * Maps a ticker and company name to FINRA's issuer string. Searches the
 * dataset's free-text index on the first name token, then scores each
 * distinct issuer by token overlap with the company name, penalising
 * extra words (so "JPMORGAN CHASE & CO" beats the medium-term-note and
 * finance-subsidiary programmes) and rewarding bond symbols that start
 * with the equity ticker.
 */
async function resolveIssuer(ticker: string, name: string): Promise<string | null> {
  const want = tokens(name);
  const key = want[0];
  if (!key || key.length < 3) return null;
  const rows = await query({
    fields: ["issuerName", "issueSymbolIdentifier"],
    multiFieldMatchFilters: [{ searchValue: key, fuzzy: false, synonym: true, fields: [{ name: "issuerName", boost: 1 }] }],
    limit: 500,
    offset: 0,
  });
  if (!rows) return null;
  const prefix = new RegExp(`^${ticker.replace(/[-.]/g, "")}(\\d|\\.|$)`);
  const stats = new Map<string, { n: number; ticker: number }>();
  for (const r of rows) {
    if (!r.issuerName) continue;
    const s = stats.get(r.issuerName) ?? { n: 0, ticker: 0 };
    s.n++;
    if (prefix.test(r.issueSymbolIdentifier ?? "")) s.ticker++;
    stats.set(r.issuerName, s);
  }
  let best: { name: string; score: number } | null = null;
  const wantSet = new Set(want);
  for (const [issuer, s] of stats) {
    const have = tokens(issuer);
    const overlap = have.filter((t) => wantSet.has(t)).length;
    if (!overlap || !have.includes(key)) continue;
    const extra = have.length - overlap;
    const score = overlap - 0.1 * extra + (s.ticker > s.n / 2 ? 0.5 : 0);
    if (!best || score > best.score) best = { name: issuer, score };
  }
  return best?.name ?? null;
}

export type Bond = {
  cusip: string;
  symbol: string;
  coupon: number | null;
  /** FXPV and friends are fixed; FR* are floaters, whose TRACE yield is blank. */
  floating: boolean;
  maturity: string;
  price: number | null;
  ytm: number | null;
  lastTrade: string | null;
  moodys: string | null;
  sp: string | null;
  is144A: boolean;
  source: string;
};

export type AgencyGrade = { rating: string; asOf: string | null; issues: number };

export type FinraCredit = {
  issuer: string | null;
  bonds: Bond[];
  /** Modal bond-level grade across the senior issues shown. */
  moodys: AgencyGrade | null;
  sp: AgencyGrade | null;
  /** Why the block is empty, in words a reader can act on. */
  note: string | null;
};

const EMPTY: FinraCredit = { issuer: null, bonds: [], moodys: null, sp: null, note: null };

const num = (s: string | null): number | null => {
  if (s === null || s === undefined) return null;
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : null;
};

function modal(rows: Row[], grade: keyof Row, date: keyof Row): AgencyGrade | null {
  const count = new Map<string, { n: number; asOf: string | null }>();
  for (const r of rows) {
    const g = r[grade];
    if (!g || g === "NR" || g === "WR") continue;
    const c = count.get(g) ?? { n: 0, asOf: null };
    c.n++;
    const d = r[date];
    if (d && (!c.asOf || d > c.asOf)) c.asOf = d;
    count.set(g, c);
  }
  let best: AgencyGrade | null = null;
  for (const [rating, c] of count) if (!best || c.n > best.issues) best = { rating, asOf: c.asOf, issues: c.n };
  return best;
}

export async function getFinraCredit(ticker: string, name: string): Promise<FinraCredit> {
  return cached(`finra:${ticker}`, 30 * MINUTE, async () => {
    const issuer = await cached(`finra:issuer:${ticker}`, 24 * HOUR, () => resolveIssuer(ticker, name));
    if (issuer === null) return { ...EMPTY, note: "No issuer matching this name in FINRA TRACE reference data" };

    const today = new Date();
    const start = new Date(today.getTime() - 90 * 864e5).toISOString().slice(0, 10);
    const end = today.toISOString().slice(0, 10);
    const rows = await query({
      compareFilters: [{ fieldName: "issuerName", fieldValue: issuer, compareType: "EQUAL" }],
      dateRangeFilters: [{ fieldName: "lastTradeDate", startDate: start, endDate: end }],
      sortFields: ["-lastTradeDate"],
      limit: 300,
      offset: 0,
    });
    if (!rows) return { ...EMPTY, issuer, note: "FINRA TRACE did not respond" };

    // Plain senior corporate paper only: no converts, no perpetuals, not
    // matured, and it must have printed in the last 90 days.
    const live = rows.filter(
      (r) =>
        r.productSubTypeCode === "CORP" &&
        r.isConvertible !== "Y" &&
        r.isPerpetual !== "Y" &&
        r.cusip &&
        r.maturityDate &&
        r.maturityDate >= end &&
        num(r.lastSalePrice) !== null,
    );
    if (!live.length) return { ...EMPTY, issuer, note: `${issuer} has no TRACE-reported bond trades in the last 90 days` };

    // Fixed-coupon issues carry a yield; floaters do not. Show fixed first,
    // most recent print first, then fill with floaters so banks that fund
    // mostly in floating-rate notes still get a ladder.
    const fixed = live.filter((r) => num(r.lastSaleYield) !== null);
    const picked = (fixed.length >= 3 ? fixed : live).slice(0, 24);
    picked.sort((a, b) => (a.maturityDate! < b.maturityDate! ? -1 : 1));
    const bonds: Bond[] = picked.slice(0, 8).map((r) => ({
      cusip: r.cusip!,
      symbol: r.issueSymbolIdentifier ?? "",
      coupon: num(r.couponRate),
      floating: (r.couponType ?? "").startsWith("FR"),
      maturity: r.maturityDate!,
      price: num(r.lastSalePrice),
      ytm: num(r.lastSaleYield),
      lastTrade: r.lastTradeDate,
      moodys: r.moodysRating && r.moodysRating !== "NR" ? r.moodysRating : null,
      sp: r.standardAndPoorsRating && r.standardAndPoorsRating !== "NR" ? r.standardAndPoorsRating : null,
      is144A: r.is144A === "Y",
      source: "FINRA TRACE",
    }));

    return {
      issuer,
      bonds,
      moodys: modal(live, "moodysRating", "moodyRatingDate"),
      sp: modal(live, "standardAndPoorsRating", "standardAndPoorsRatingDate"),
      note: null,
    };
  });
}
