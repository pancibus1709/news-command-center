import { yf } from "./yahoo";
import { cached, MINUTE } from "./cache";
import { getCompanyNews, type NewsItem } from "./news";
import { DEBT_FORMS, EMPTY_FUNDAMENTALS, getFilings, getFundamentals, tickerToCik, type Filing, type Fundamentals } from "./sec";

export type CompanyProfile = {
  ticker: string;
  name: string;
  exchange: string | null;
  currency: string | null;
  sector: string | null;
  industry: string | null;
  website: string | null;
  summary: string | null;
  employees: number | null;
  headquarters: string | null;
  /** Banks, insurers, brokers. EBITDA, net debt and EV are not meaningful. */
  isFinancial: boolean;

  price: number | null;
  change: number | null;
  changePct: number | null;
  marketState: string | null;
  marketCap: number | null;
  enterpriseValue: number | null;
  week52Low: number | null;
  week52High: number | null;
  avgVolume: number | null;
  beta: number | null;

  // Valuation
  trailingPE: number | null;
  forwardPE: number | null;
  priceToSales: number | null;
  priceToBook: number | null;
  priceToBookSource: "xbrl" | "yahoo" | null;
  evToEbitda: number | null;
  dividendYield: number | null;

  // Operating (Yahoo financialData, TTM unless noted)
  revenueTTM: number | null;
  revenueGrowthQoQ: number | null; // latest quarter YoY, not TTM
  grossMargin: number | null;
  operatingMargin: number | null;
  profitMargin: number | null;
  ebitdaTTM: number | null;
  freeCashFlowTTM: number | null; // null when Yahoo's figure fails the FCF <= OCF check
  operatingCashFlowTTM: number | null;
  returnOnEquity: number | null;

  // Credit (Yahoo balance sheet aggregates)
  totalDebt: number | null;
  totalCash: number | null;
  netDebt: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  netDebtToEbitda: number | null;
  ebitdaNegative: boolean;

  // Credit (SEC XBRL, latest fiscal year)
  interestCoverage: { value: number; fy: number } | null; // operating income / interest expense
  fcfFY: { value: number; fy: number } | null; // OCF - capex
  debtFilings: Filing[]; // 424B2/424B5/FWP/S-3

  // Street
  recommendation: string | null;
  targetMean: number | null;
  targetLow: number | null;
  targetHigh: number | null;
  analystCount: number | null;
  recTrend: { period: string; strongBuy: number; buy: number; hold: number; sell: number; strongSell: number }[];
  nextEarnings: string | null;
  nextEarningsEstimate: boolean;
  earningsHistory: { quarter: string; actual: number | null; estimate: number | null; surprisePct: number | null }[];
  shortPctFloat: number | null;
  insiderPct: number | null;
  institutionPct: number | null;

  history: { d: string; c: number }[]; // 1y daily closes

  sec: {
    cik: string | null;
    sic: string | null;
    sicDescription: string | null;
    stateOfIncorporation: string | null;
    fiscalYearEnd: string | null;
    filings: Filing[];
    fundamentals: Fundamentals;
  };

  news: NewsItem[];
  fetchedAt: string;
  warnings: string[];
};

export class UpstreamError extends Error {}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const pct = (v: unknown): number | null => (num(v) === null ? null : (v as number) * 100);
const last = <T>(a: T[]): T | undefined => a[a.length - 1];

// SIC 6000-6799: depository institutions, credit, brokers, insurance, real estate.
function financialBySic(sic: string | null | undefined): boolean {
  const n = sic ? parseInt(sic, 10) : NaN;
  return Number.isFinite(n) && n >= 6000 && n <= 6799;
}

export async function searchSymbols(q: string) {
  return cached(`search:${q.toLowerCase()}`, 10 * MINUTE, async () => {
    const r = await yf.search(q, { quotesCount: 8, newsCount: 0 });
    return r.quotes
      .filter((x): x is typeof x & { symbol: string } => "symbol" in x && typeof x.symbol === "string")
      .filter((x) => !x.symbol.includes("=") && !x.symbol.startsWith("^"))
      .map((x) => ({
        symbol: x.symbol,
        name: ("longname" in x && x.longname) || ("shortname" in x && x.shortname) || x.symbol,
        exchange: ("exchDisp" in x && x.exchDisp) || null,
        type: ("quoteType" in x && x.quoteType) || null,
      }));
  });
}

/**
 * Returns null only when the symbol does not exist. Upstream failures throw
 * UpstreamError so the cache does not pin an outage for five minutes.
 */
export async function getCompany(tickerRaw: string): Promise<CompanyProfile | null> {
  const ticker = tickerRaw.toUpperCase().trim();
  return cached(`company:${ticker}`, 5 * MINUTE, async () => {
    const warnings: string[] = [];

    const summary = await yf
      .quoteSummary(ticker, {
        modules: [
          "price",
          "summaryProfile",
          "summaryDetail",
          "financialData",
          "defaultKeyStatistics",
          "recommendationTrend",
          "calendarEvents",
          "earningsHistory",
          "majorHoldersBreakdown",
        ],
      })
      .catch((e: unknown) => {
        const msg = String((e as Error)?.message ?? e);
        if (/not found|no fundamentals|404|quote not found/i.test(msg)) return null;
        throw new UpstreamError(`Yahoo Finance did not respond (${msg.slice(0, 80)})`);
      });
    if (!summary?.price) return null;

    const p = summary.price;
    const prof = summary.summaryProfile;
    const det = summary.summaryDetail;
    const fin = summary.financialData;
    const ks = summary.defaultKeyStatistics;
    const name = p.longName ?? p.shortName ?? ticker;

    const [chart, cik, news] = await Promise.all([
      yf.chart(ticker, { period1: new Date(Date.now() - 370 * 864e5), interval: "1d" }).catch(() => null),
      tickerToCik(ticker),
      getCompanyNews(name).catch(() => [] as NewsItem[]),
    ]);
    if (!chart) warnings.push("Price history unavailable");
    if (!cik) warnings.push("No SEC EDGAR match (foreign or non-registrant)");

    const [sub, fundamentals] = cik
      ? await Promise.all([getFilings(cik), getFundamentals(cik)])
      : [{ meta: {} as { sic?: string; sicDescription?: string; stateOfIncorporation?: string; fiscalYearEnd?: string }, filings: [] as Filing[] }, EMPTY_FUNDAMENTALS];

    const isFinancial = prof?.sector === "Financial Services" || financialBySic(sub.meta.sic);

    const mcap = num(p.marketCap);
    let ev = num(ks?.enterpriseValue);
    // Yahoo nets securities portfolios into EV; a negative or sub-half EV is noise.
    if (isFinancial || (ev !== null && mcap !== null && (ev <= 0 || ev < 0.5 * mcap))) ev = null;

    const totalDebt = num(fin?.totalDebt);
    const totalCash = num(fin?.totalCash);
    const ebitda = isFinancial ? null : num(fin?.ebitda);
    const netDebt = !isFinancial && totalDebt !== null && totalCash !== null ? totalDebt - totalCash : null;
    const ebitdaNegative = ebitda !== null && ebitda <= 0;

    // P/B from XBRL equity when we have it. Yahoo's per-share figure breaks
    // on dual-class tickers (BRK-B divides B price by A book).
    const equity = last(fundamentals.stockholdersEquity)?.value;
    let priceToBook: number | null = null;
    let priceToBookSource: "xbrl" | "yahoo" | null = null;
    if (mcap && equity && equity > 0) {
      priceToBook = mcap / equity;
      priceToBookSource = "xbrl";
    } else {
      const y = num(ks?.priceToBook);
      if (y !== null && y >= 0.05 && y <= 500) {
        priceToBook = y;
        priceToBookSource = "yahoo";
      }
    }

    // Yahoo's freeCashflow sometimes exceeds OCF, which is impossible.
    const ocf = num(fin?.operatingCashflow);
    const yFcf = num(fin?.freeCashflow);
    const freeCashFlowTTM = yFcf !== null && (ocf === null || yFcf <= ocf) ? yFcf : null;
    if (yFcf !== null && freeCashFlowTTM === null) warnings.push("Yahoo FCF exceeds OCF; hidden");

    const opInc = last(fundamentals.operatingIncome);
    const intExp = fundamentals.interestExpense.find((r) => r.fy === opInc?.fy);
    const interestCoverage = opInc && intExp && intExp.value > 0 ? { value: opInc.value / intExp.value, fy: opInc.fy } : null;

    const ocfFY = last(fundamentals.operatingCashFlow);
    const capexFY = fundamentals.capex.find((r) => r.fy === ocfFY?.fy);
    const fcfFY = ocfFY && capexFY ? { value: ocfFY.value - Math.abs(capexFY.value), fy: ocfFY.fy } : null;

    // Banks report 0 for margins Yahoo cannot compute. Null, not 0.0%.
    const margin = (v: unknown) => (isFinancial && num(v) === 0 ? null : pct(v));

    const earningsDate = summary.calendarEvents?.earnings?.earningsDate?.[0];

    return {
      ticker,
      name,
      exchange: p.exchangeName ?? null,
      currency: p.currency ?? null,
      sector: prof?.sector ?? null,
      industry: prof?.industry ?? null,
      website: prof?.website ?? null,
      summary: prof?.longBusinessSummary ?? null,
      employees: num(prof?.fullTimeEmployees),
      headquarters: [prof?.city, prof?.state, prof?.country].filter(Boolean).join(", ") || null,
      isFinancial,

      price: num(p.regularMarketPrice),
      change: num(p.regularMarketChange),
      changePct: pct(p.regularMarketChangePercent),
      marketState: p.marketState ?? null,
      marketCap: mcap,
      enterpriseValue: ev,
      week52Low: num(det?.fiftyTwoWeekLow),
      week52High: num(det?.fiftyTwoWeekHigh),
      avgVolume: num(det?.averageVolume),
      beta: num(det?.beta),

      trailingPE: num(det?.trailingPE),
      forwardPE: num(det?.forwardPE),
      priceToSales: num(det?.priceToSalesTrailing12Months),
      priceToBook,
      priceToBookSource,
      evToEbitda: ev !== null && ebitda && ebitda > 0 ? ev / ebitda : null,
      dividendYield: pct(det?.dividendYield),

      revenueTTM: num(fin?.totalRevenue),
      revenueGrowthQoQ: pct(fin?.revenueGrowth),
      grossMargin: margin(fin?.grossMargins),
      operatingMargin: margin(fin?.operatingMargins),
      profitMargin: margin(fin?.profitMargins),
      ebitdaTTM: ebitda,
      freeCashFlowTTM,
      operatingCashFlowTTM: ocf,
      returnOnEquity: pct(fin?.returnOnEquity),

      totalDebt,
      totalCash,
      netDebt,
      debtToEquity: num(fin?.debtToEquity), // Yahoo reports this as a percentage (78.4 = 0.78x); verified against XBRL
      currentRatio: isFinancial ? null : num(fin?.currentRatio),
      netDebtToEbitda: netDebt !== null && ebitda !== null && ebitda > 0 ? +(netDebt / ebitda).toFixed(2) : null,
      ebitdaNegative,

      interestCoverage,
      fcfFY,
      debtFilings: sub.filings.filter((f) => DEBT_FORMS.has(f.form)).slice(0, 8),

      recommendation: fin?.recommendationKey ?? null,
      targetMean: num(fin?.targetMeanPrice),
      targetLow: num(fin?.targetLowPrice),
      targetHigh: num(fin?.targetHighPrice),
      analystCount: num(fin?.numberOfAnalystOpinions),
      recTrend: (summary.recommendationTrend?.trend ?? []).map((t) => ({
        period: t.period,
        strongBuy: t.strongBuy,
        buy: t.buy,
        hold: t.hold,
        sell: t.sell,
        strongSell: t.strongSell,
      })),
      nextEarnings: earningsDate instanceof Date ? earningsDate.toISOString().slice(0, 10) : null,
      nextEarningsEstimate: Boolean(summary.calendarEvents?.earnings?.isEarningsDateEstimate),
      earningsHistory: (summary.earningsHistory?.history ?? []).map((h) => ({
        quarter: h.quarter instanceof Date ? h.quarter.toISOString().slice(0, 10) : String(h.quarter ?? ""),
        actual: num(h.epsActual),
        estimate: num(h.epsEstimate),
        surprisePct: pct(h.surprisePercent),
      })),
      shortPctFloat: pct(ks?.shortPercentOfFloat),
      insiderPct: pct(summary.majorHoldersBreakdown?.insidersPercentHeld),
      institutionPct: pct(summary.majorHoldersBreakdown?.institutionsPercentHeld),

      history: (chart?.quotes ?? [])
        .filter((q) => typeof q.close === "number")
        .map((q) => ({ d: new Date(q.date).toISOString().slice(0, 10), c: +(q.close as number).toFixed(2) })),

      sec: {
        cik,
        sic: sub.meta.sic ?? null,
        sicDescription: sub.meta.sicDescription ?? null,
        stateOfIncorporation: sub.meta.stateOfIncorporation ?? null,
        fiscalYearEnd: sub.meta.fiscalYearEnd ?? null,
        filings: sub.filings,
        fundamentals,
      },

      news,
      fetchedAt: new Date().toISOString(),
      warnings,
    };
  });
}
