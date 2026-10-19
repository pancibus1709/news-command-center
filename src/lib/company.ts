import { yf } from "./yahoo";
import { cached, MINUTE } from "./cache";
import { getCompanyNews, type NewsItem } from "./news";
import { getFilings, getFundamentals, tickerToCik, type Filing, type Fundamentals } from "./sec";

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
  evToEbitda: number | null;
  dividendYield: number | null;

  // Operating (TTM from Yahoo financialData)
  revenueTTM: number | null;
  revenueGrowth: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  profitMargin: number | null;
  ebitdaTTM: number | null;
  freeCashFlowTTM: number | null;
  returnOnEquity: number | null;

  // Credit profile
  totalDebt: number | null;
  totalCash: number | null;
  netDebt: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  netDebtToEbitda: number | null;

  // Street
  recommendation: string | null;
  targetMean: number | null;
  targetLow: number | null;
  targetHigh: number | null;
  analystCount: number | null;
  recTrend: { period: string; strongBuy: number; buy: number; hold: number; sell: number; strongSell: number }[];
  nextEarnings: string | null;
  earningsHistory: { quarter: string; actual: number | null; estimate: number | null; surprisePct: number | null }[];
  shortPctFloat: number | null;
  insiderPct: number | null;
  institutionPct: number | null;

  history: { d: string; c: number }[]; // 1y daily closes

  sec: {
    cik: string | null;
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

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export async function searchSymbols(q: string) {
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
}

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
      .catch(() => null);
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
      getCompanyNews(name, ticker).catch(() => [] as NewsItem[]),
    ]);
    if (!chart) warnings.push("Price history unavailable");
    if (!cik) warnings.push("No SEC EDGAR match (foreign or non-registrant)");

    const [sub, fundamentals] = cik
      ? await Promise.all([getFilings(cik), getFundamentals(cik)])
      : [{ meta: {}, filings: [] as Filing[] }, { revenue: [], netIncome: [], operatingCashFlow: [], longTermDebt: [], cash: [], totalAssets: [], stockholdersEquity: [] } as Fundamentals];

    const totalDebt = num(fin?.totalDebt);
    const totalCash = num(fin?.totalCash);
    const ebitda = num(fin?.ebitda);
    const netDebt = totalDebt !== null && totalCash !== null ? totalDebt - totalCash : null;

    const ev = num(ks?.enterpriseValue);
    const mcap = num(p.marketCap);

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

      price: num(p.regularMarketPrice),
      change: num(p.regularMarketChange),
      changePct: num(p.regularMarketChangePercent) !== null ? p.regularMarketChangePercent! * 100 : null,
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
      priceToBook: num(ks?.priceToBook),
      evToEbitda: num(ks?.enterpriseToEbitda),
      dividendYield: num(det?.dividendYield) !== null ? det!.dividendYield! * 100 : null,

      revenueTTM: num(fin?.totalRevenue),
      revenueGrowth: num(fin?.revenueGrowth) !== null ? fin!.revenueGrowth! * 100 : null,
      grossMargin: num(fin?.grossMargins) !== null ? fin!.grossMargins! * 100 : null,
      operatingMargin: num(fin?.operatingMargins) !== null ? fin!.operatingMargins! * 100 : null,
      profitMargin: num(fin?.profitMargins) !== null ? fin!.profitMargins! * 100 : null,
      ebitdaTTM: ebitda,
      freeCashFlowTTM: num(fin?.freeCashflow),
      returnOnEquity: num(fin?.returnOnEquity) !== null ? fin!.returnOnEquity! * 100 : null,

      totalDebt,
      totalCash,
      netDebt,
      debtToEquity: num(fin?.debtToEquity), // Yahoo reports this as a percentage (e.g. 150 = 1.5x)
      currentRatio: num(fin?.currentRatio),
      netDebtToEbitda: netDebt !== null && ebitda ? +(netDebt / ebitda).toFixed(2) : null,

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
      nextEarnings: (() => {
        const e = summary.calendarEvents?.earnings?.earningsDate?.[0];
        return e instanceof Date ? e.toISOString().slice(0, 10) : null;
      })(),
      earningsHistory: (summary.earningsHistory?.history ?? []).map((h) => ({
        quarter: h.quarter instanceof Date ? h.quarter.toISOString().slice(0, 10) : String(h.quarter ?? ""),
        actual: num(h.epsActual),
        estimate: num(h.epsEstimate),
        surprisePct: num(h.surprisePercent) !== null ? h.surprisePercent! * 100 : null,
      })),
      shortPctFloat: num(ks?.shortPercentOfFloat) !== null ? ks!.shortPercentOfFloat! * 100 : null,
      insiderPct: num(summary.majorHoldersBreakdown?.insidersPercentHeld) !== null ? summary.majorHoldersBreakdown!.insidersPercentHeld! * 100 : null,
      institutionPct: num(summary.majorHoldersBreakdown?.institutionsPercentHeld) !== null ? summary.majorHoldersBreakdown!.institutionsPercentHeld! * 100 : null,

      history: (chart?.quotes ?? [])
        .filter((q) => typeof q.close === "number")
        .map((q) => ({ d: new Date(q.date).toISOString().slice(0, 10), c: +(q.close as number).toFixed(2) })),

      sec: {
        cik,
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
