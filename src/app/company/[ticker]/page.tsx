import Link from "next/link";
import { getCompany, UpstreamError, type CompanyProfile } from "@/lib/company";
import { LineChart } from "@/components/Sparkline";
import { dirClass, fmtInt, fmtMoney, fmtNum, fmtPct, fmtSigned, fmtX, hhmm, timeAgo } from "@/lib/format";
import type { AnnualFact } from "@/lib/sec";

function Stat({ label, value, cls = "", hint }: { label: string; value: string; cls?: string; hint?: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-line-faint px-2 py-1" title={hint}>
      <span className="text-dim">{label}</span>
      <span className={`font-semibold text-right ${cls}`}>{value}</span>
    </div>
  );
}

/** Investment grade reads neutral, high yield amber, distressed red. */
function ratingClass(r: string | null): string {
  if (!r) return "text-dim";
  if (/^(Aaa|Aa|A|Baa|AAA|AA|A|BBB)/.test(r)) return "";
  if (/^(Caa|Ca|C|CCC|CC|C|D)/.test(r)) return "down";
  return "text-amber";
}

function Panel({ title, right, children, className = "" }: { title: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-head">
        <h2 className="text-inherit font-inherit">{title}</h2>
        {right && <span className="text-dim font-normal normal-case tracking-normal text-[10px]">{right}</span>}
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}

function AnnualTable({ f, currency, isFinancial }: { f: CompanyProfile["sec"]["fundamentals"]; currency: string; isFinancial: boolean }) {
  const rows: { label: string; data: AnnualFact[] }[] = [
    { label: "Revenue", data: f.revenue },
    { label: "Operating income", data: f.operatingIncome },
    { label: "Net income", data: f.netIncome },
    { label: "Interest expense", data: f.interestExpense },
    { label: "Operating cash flow", data: f.operatingCashFlow },
    { label: "Capex", data: f.capex },
    { label: "Cash & equivalents", data: f.cash },
    { label: isFinancial ? "LT debt" : "LT debt (noncurrent)", data: f.longTermDebt },
    { label: "Deposits", data: f.deposits },
    { label: "Total assets", data: f.totalAssets },
    { label: "Equity", data: f.stockholdersEquity },
  ].filter((r) => r.data.length);
  if (!rows.length) return <div className="p-3 text-dim">No XBRL fundamentals on EDGAR for this filer. Foreign private issuers file 20-F without us-gaap tags.</div>;
  const years = Array.from(new Set(rows.flatMap((r) => r.data.map((d) => d.fy)))).sort((a, b) => a - b).slice(-5);
  return (
    <table>
      <thead>
        <tr>
          <th>FY (10-K, restated where refiled)</th>
          {years.map((y) => (
            <th key={y} className="num">{y}</th>
          ))}
          <th className="num" title="Compound annual growth from the row's first shown year to its last. n/m when either endpoint is at or below zero or the base is under a fifth of the end value.">CAGR</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const by = new Map(r.data.map((d) => [d.fy, d.value]));
          const own = years.filter((y) => by.has(y));
          const first = own.length ? by.get(own[0])! : null;
          const lastV = own.length ? by.get(own[own.length - 1])! : null;
          const n = own.length - 1;
          const cagr =
            first !== null && lastV !== null && n > 0 && first > 0 && lastV > 0 && first >= 0.2 * lastV
              ? (Math.pow(lastV / first, 1 / n) - 1) * 100
              : null;
          return (
            <tr key={r.label} className="row-hover">
              <td>{r.label}</td>
              {years.map((y) => {
                const v = by.get(y);
                return (
                  <td key={y} className={`num ${v !== undefined && v < 0 ? "down" : ""}`}>{v === undefined ? "--" : fmtMoney(v, currency)}</td>
                );
              })}
              <td className={`num ${dirClass(cagr)}`}>{cagr === null ? "n/m" : fmtPct(cagr, 1)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default async function CompanyPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const symbol = decodeURIComponent(ticker).toUpperCase();

  let c: CompanyProfile | null;
  try {
    c = await getCompany(symbol);
  } catch (e) {
    const upstream = e instanceof UpstreamError;
    return (
      <div className="p-6">
        <div className="text-down text-lg">{upstream ? "Yahoo Finance did not respond" : "Something failed while loading"}</div>
        <p className="text-dim mt-2">{symbol} may be fine. Retry in a minute.</p>
        <p className="text-mute mt-1 text-[10px]">{(e as Error).message}</p>
        <Link href="/" className="text-amber mt-4 inline-block">&larr; Back to board</Link>
      </div>
    );
  }

  if (!c) {
    return (
      <div className="p-6">
        <div className="text-down text-lg">No listing for {symbol}</div>
        <p className="text-dim mt-2">Use the search bar to find the right symbol.</p>
        <Link href="/" className="text-amber mt-4 inline-block">&larr; Back to board</Link>
      </div>
    );
  }

  const cur = c.currency ?? "USD";
  const cls = dirClass(c.changePct);
  const range =
    c.week52Low !== null && c.week52High !== null && c.price !== null && c.week52High > c.week52Low
      ? ((c.price - c.week52Low) / (c.week52High - c.week52Low)) * 100
      : null;
  const upside = c.targetMean !== null && c.price ? ((c.targetMean - c.price) / c.price) * 100 : null;
  const lev = c.netDebtToEbitda;
  const levText = c.isFinancial ? "n/m" : c.netDebt !== null && c.netDebt < 0 ? "net cash" : c.ebitdaNegative ? "n/m (EBITDA ≤ 0)" : fmtX(lev);
  const levCls = c.isFinancial ? "text-dim" : c.netDebt !== null && c.netDebt < 0 ? "up" : c.ebitdaNegative ? "down" : "";
  const latestRec = c.recTrend[0];
  const recTotal = latestRec ? latestRec.strongBuy + latestRec.buy + latestRec.hold + latestRec.sell + latestRec.strongSell : 0;
  const fund = c.sec.fundamentals;
  const latestDebt = fund.longTermDebt[fund.longTermDebt.length - 1];
  const latestDeposits = fund.deposits[fund.deposits.length - 1];

  return (
    <div className="p-1 flex flex-col gap-1">
      {/* Header */}
      <section className="panel">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2 px-3 py-2">
          <div>
            <h1 className="text-amber text-2xl font-bold tracking-wide leading-none">{c.ticker}</h1>
            <div className="text-fg mt-1">{c.name}</div>
            <div className="text-dim text-[10px] uppercase tracking-wider mt-0.5">
              {[c.exchange, c.sector, c.industry].filter(Boolean).join(" · ")}
              {c.isFinancial && <span className="ml-2 text-amber-dim">financial issuer</span>}
            </div>
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold">{fmtNum(c.price)}</span>
            <span className={`text-lg ${cls}`}>{fmtSigned(c.change)}</span>
            <span className={`text-lg ${cls}`}>{fmtPct(c.changePct)}</span>
            <span className="text-mute text-[10px] uppercase">{cur} · {c.marketState}</span>
          </div>
          <div className="ml-auto flex gap-6 text-right">
            <div><div className="text-dim text-[10px] uppercase">Mkt cap</div><div className="font-semibold">{fmtMoney(c.marketCap, cur)}</div></div>
            <div title={c.isFinancial ? "Enterprise value is not meaningful for banks and insurers" : "Yahoo Finance"}>
              <div className="text-dim text-[10px] uppercase">EV</div>
              <div className="font-semibold">{c.isFinancial ? "n/m" : fmtMoney(c.enterpriseValue, cur)}</div>
            </div>
            <div title="(Total debt - cash & ST investments) / TTM EBITDA. Yahoo Finance.">
              <div className="text-dim text-[10px] uppercase">Net debt / EBITDA</div>
              <div className={`font-semibold ${levCls}`}>{levText}</div>
            </div>
            <div title={c.nextEarningsEstimate ? "Yahoo Finance estimate, not company-confirmed" : "Yahoo Finance"}>
              <div className="text-dim text-[10px] uppercase">Next earnings</div>
              <div className="font-semibold">{c.nextEarnings ?? "--"}{c.nextEarnings && c.nextEarningsEstimate ? <span className="text-dim"> (est)</span> : null}</div>
            </div>
          </div>
        </div>
        {c.warnings.length > 0 && (
          <div className="px-3 pb-2 text-[10px] text-amber-dim">{c.warnings.join(" · ")}</div>
        )}
      </section>

      <div className="grid gap-1 grid-cols-1 lg:grid-cols-3 xl:grid-cols-4">
        {/* Chart */}
        <Panel title="1Y Price" className="lg:col-span-2 xl:col-span-2" right={c.history.length ? `${c.history[0].d} to ${c.history[c.history.length - 1].d}` : ""}>
          <LineChart data={c.history} />
          <div className="flex justify-between px-3 pb-2 text-[10px] text-dim">
            <span>52W {fmtNum(c.week52Low)} - {fmtNum(c.week52High)}</span>
            <span title="(Price - 52W low) / (52W high - 52W low)">{range !== null ? `${range.toFixed(0)}% of 52W range` : ""}</span>
            <span>Beta {fmtNum(c.beta)}</span>
            <span>Avg vol {fmtInt(c.avgVolume)}</span>
          </div>
        </Panel>

        {/* Valuation */}
        <Panel title="Valuation" right="Yahoo Finance">
          <Stat label="P/E (TTM)" value={fmtX(c.trailingPE)} />
          <Stat label="P/E (fwd)" value={fmtX(c.forwardPE)} />
          <Stat label="EV / EBITDA" value={c.isFinancial ? "n/m" : fmtX(c.evToEbitda)} cls={c.isFinancial ? "text-dim" : ""} hint={c.isFinancial ? "Not meaningful for financial issuers" : "EV / TTM EBITDA"} />
          <Stat label="P / Sales" value={fmtX(c.priceToSales)} />
          <Stat label="P / Book" value={fmtX(c.priceToBook, 2)} hint={c.priceToBookSource === "xbrl" ? "Market cap / latest 10-K stockholders' equity (SEC XBRL)" : "Yahoo Finance per-share figure"} />
          <Stat label="Dividend yield" value={fmtPct(c.dividendYield, 2, false)} />
          <Stat label="Short % float" value={fmtPct(c.shortPctFloat, 1, false)} />
          <Stat label="Insiders / Inst." value={`${fmtPct(c.insiderPct, 0, false)} / ${fmtPct(c.institutionPct, 0, false)}`} />
        </Panel>

        {/* Operating */}
        <Panel title="Operating (TTM)" right="Yahoo Finance">
          <Stat label="Revenue" value={fmtMoney(c.revenueTTM, cur)} />
          <Stat label="Rev growth (latest qtr YoY)" value={fmtPct(c.revenueGrowthQoQ, 1)} cls={dirClass(c.revenueGrowthQoQ)} hint="Most recent quarter vs the same quarter a year ago, not TTM growth" />
          <Stat label="Gross margin" value={fmtPct(c.grossMargin, 1, false)} />
          <Stat label="Operating margin" value={fmtPct(c.operatingMargin, 1, false)} cls={dirClass(c.operatingMargin)} />
          <Stat label="Net margin" value={fmtPct(c.profitMargin, 1, false)} cls={dirClass(c.profitMargin)} />
          <Stat label="EBITDA" value={c.isFinancial ? "n/m" : fmtMoney(c.ebitdaTTM, cur)} cls={c.isFinancial ? "text-dim" : ""} />
          <Stat label="Operating cash flow" value={fmtMoney(c.operatingCashFlowTTM, cur)} cls={dirClass(c.operatingCashFlowTTM)} />
          <Stat label="Free cash flow" value={fmtMoney(c.freeCashFlowTTM, cur)} cls={dirClass(c.freeCashFlowTTM)} hint="Yahoo figure, shown only when it does not exceed operating cash flow" />
          <Stat label="ROE" value={fmtPct(c.returnOnEquity, 1, false)} />
          <Stat label="Employees" value={fmtInt(c.employees)} />
        </Panel>

        {/* Credit */}
        <Panel title="Credit Profile" right={c.isFinancial ? "bank / insurer view · FINRA TRACE" : "Yahoo + SEC XBRL + FINRA TRACE"}>
          {c.isFinancial ? (
            <>
              <Stat label="LT debt (10-K)" value={latestDebt ? `${fmtMoney(latestDebt.value, cur)} FY${latestDebt.fy}` : "--"} hint="Long-term debt from the latest 10-K, SEC XBRL" />
              <Stat label="Deposits (10-K)" value={latestDeposits ? `${fmtMoney(latestDeposits.value, cur)} FY${latestDeposits.fy}` : "--"} hint="SEC XBRL us-gaap:Deposits" />
              <Stat label="P / Book" value={fmtX(c.priceToBook, 2)} />
              <Stat label="ROE" value={fmtPct(c.returnOnEquity, 1, false)} />
              <Stat label="Net debt, EBITDA, current ratio" value="n/m" cls="text-dim" hint="Balance-sheet aggregates for a financial issuer carry no credit meaning" />
            </>
          ) : (
            <>
              <Stat label="Total debt (incl. current, leases)" value={fmtMoney(c.totalDebt, cur)} hint="Yahoo Finance" />
              <Stat label="Cash & ST investments" value={fmtMoney(c.totalCash, cur)} hint="Yahoo Finance. The XBRL table below shows cash & equivalents only." />
              <Stat label="Net debt" value={fmtMoney(c.netDebt, cur)} cls={c.netDebt !== null && c.netDebt < 0 ? "up" : ""} hint="Total debt - cash & ST investments. Negative is net cash." />
              <Stat label="Net debt / EBITDA" value={levText} cls={levCls} hint="(Total debt - cash & ST investments) / TTM EBITDA. Yahoo Finance." />
              <Stat label="Debt / Equity" value={c.debtToEquity === null ? "--" : fmtX(c.debtToEquity / 100, 2)} hint="Total debt / stockholders' equity. Yahoo reports this as a percentage; shown as a multiple." />
              <Stat label="Current ratio" value={fmtX(c.currentRatio, 2)} hint="Yahoo Finance" />
              <Stat label="Cash / Total debt" value={c.totalCash !== null && c.totalDebt ? fmtX(c.totalCash / c.totalDebt, 2) : "--"} hint="Cash & ST investments / total debt. Yahoo Finance." />
            </>
          )}
          <Stat
            label={c.interestCoverage ? `EBIT / Interest (FY${c.interestCoverage.fy})` : "EBIT / Interest"}
            value={c.interestCoverage ? fmtX(c.interestCoverage.value) : "--"}
            cls={c.interestCoverage && c.interestCoverage.value < 1 ? "down" : ""}
            hint="Operating income / interest expense from the latest 10-K. SEC XBRL."
          />
          <Stat
            label={c.fcfFY ? `FCF (FY${c.fcfFY.fy}, 10-K)` : "FCF (10-K)"}
            value={c.fcfFY ? fmtMoney(c.fcfFY.value, cur) : "--"}
            cls={c.fcfFY ? dirClass(c.fcfFY.value) : ""}
            hint="Operating cash flow - capex from the latest 10-K. SEC XBRL."
          />
          {fund.maturities.length > 0 && (
            <div className="px-2 py-1 border-b border-line-faint" title="Principal due by year from the latest 10-K debt footnote. SEC XBRL.">
              <div className="text-dim mb-1">Maturities</div>
              <div className="flex justify-between gap-1 text-[11px]">
                {fund.maturities.map((m) => (
                  <span key={m.year} className="text-center">
                    <span className="block text-mute text-[10px]">{m.year}</span>
                    <span className="font-semibold">{fmtMoney(m.value, cur)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="px-2 py-1 border-b border-line-faint">
            <div className="text-dim mb-1" title="Issuer-level grade. FINRA TRACE reference data carries Moody's and S&P grades per bond; the modal grade across recently traded senior issues is shown. Outlooks and Fitch come from the issuer's own 10-K, 10-Q and 8-K text on EDGAR.">Ratings</div>
            {c.ratings.length === 0 && <div className="text-dim text-[11px]" title={c.ratingsNote ?? undefined}>no public ratings found</div>}
            {c.ratings.map((r) => (
              <div key={r.agency} className="flex justify-between gap-3 text-[11px]" title={`${r.source}${r.asOf ? `, as of ${r.asOf}` : ""}${r.note ? `. ${r.note}` : ""}`}>
                <span className="text-dim shrink-0">{r.agency}</span>
                <span className="text-right">
                  <span className={`font-semibold ${ratingClass(r.rating)}`}>{r.rating ?? "n/a"}</span>
                  {r.outlook && <span className="text-dim"> · {r.outlook.toLowerCase()}</span>}
                  {r.url ? (
                    <a href={r.url} target="_blank" rel="noreferrer" className="text-mute hover:text-amber"> · {r.source.startsWith("SEC") ? r.source.replace(/^SEC /, "").replace(/ filed .*/, "") : "TRACE"} {r.asOf ?? ""}</a>
                  ) : (
                    <span className="text-mute"> · TRACE {r.asOf ?? ""}</span>
                  )}
                  {r.note && <span className="block text-amber-dim text-[10px]">{r.note}</span>}
                </span>
              </div>
            ))}
          </div>
          <div className="px-2 py-1 border-b border-line-faint">
            <div className="text-dim mb-1" title="Senior corporate bonds that printed on TRACE in the last 90 days, sorted by maturity. Price per 100 and yield to maturity from the latest trade. Floating-rate notes carry no TRACE yield.">
              Bonds (FINRA TRACE){c.bonds.length > 0 && <span className="text-mute"> · last trade {c.bonds.reduce((m, b) => (b.lastTrade && b.lastTrade > m ? b.lastTrade : m), "")}</span>}
            </div>
            {c.bonds.length === 0 && <div className="text-dim text-[11px]" title={c.bondsNote ?? undefined}>{c.bondsNote ?? "no TRACE-reported bonds"}</div>}
            {c.bonds.length > 0 && (
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-mute text-[10px]">
                    <th className="text-left font-normal px-0 py-0">Coupon</th>
                    <th className="text-left font-normal px-0 py-0">Maturity</th>
                    <th className="num font-normal px-0 py-0">Px</th>
                    <th className="num font-normal px-0 py-0">YTM</th>
                    <th className="num font-normal px-0 py-0">Mdy / S&P</th>
                  </tr>
                </thead>
                <tbody>
                  {c.bonds.map((b) => (
                    <tr key={b.cusip} title={`CUSIP ${b.cusip} · ${b.symbol}${b.is144A ? " · 144A" : ""} · last trade ${b.lastTrade ?? "--"} · FINRA TRACE`}>
                      <td className="px-0 py-0 border-0">{b.coupon === null ? "--" : `${b.coupon.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}%`}{b.floating && <span className="text-mute"> FRN</span>}</td>
                      <td className="px-0 py-0 border-0 text-dim">{b.maturity}</td>
                      <td className="num px-0 py-0 border-0 font-semibold">{fmtNum(b.price)}</td>
                      <td className={`num px-0 py-0 border-0 ${b.ytm !== null && b.ytm >= 8 ? "down" : ""}`}>{b.ytm === null ? "--" : fmtPct(b.ytm, 2, false)}</td>
                      <td className="num px-0 py-0 border-0 text-dim">{b.moodys ?? "--"} / {b.sp ?? "--"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {c.debtFilings.length > 0 && (
            <div className="px-2 py-1" title="424B2, 424B5, FWP and S-3 filings: note offerings and shelf registrations">
              <div className="text-dim mb-1">Debt & shelf filings</div>
              {c.debtFilings.map((f, i) => (
                <a key={i} href={f.url} target="_blank" rel="noreferrer" className="flex gap-3 text-[11px] hover:text-amber">
                  <span className="text-amber w-14 shrink-0">{f.form}</span>
                  <span className="text-dim">{f.filed}</span>
                  <span className="truncate">{f.description}</span>
                </a>
              ))}
            </div>
          )}
          <Stat label="SIC" value={c.sec.sicDescription ?? "--"} />
          <Stat label="Incorporated" value={c.sec.stateOfIncorporation ?? "--"} />
        </Panel>

        {/* Street */}
        <Panel title="Street" right={c.analystCount ? `${c.analystCount} analysts · Yahoo Finance` : "Yahoo Finance"}>
          <Stat label="Consensus" value={(c.recommendation ?? "--").replace("_", " ").toUpperCase()} cls={c.recommendation?.includes("buy") ? "up" : c.recommendation?.includes("sell") ? "down" : ""} />
          <Stat label="Target (mean)" value={fmtNum(c.targetMean)} />
          <Stat label="Implied upside" value={fmtPct(upside, 1)} cls={dirClass(upside)} hint="(Mean target - price) / price" />
          <Stat label="Target range" value={`${fmtNum(c.targetLow)} - ${fmtNum(c.targetHigh)}`} />
          {latestRec && recTotal > 0 && (
            <div className="px-2 py-2">
              <div className="flex h-2 w-full overflow-hidden" role="img" aria-label={`Buy ${latestRec.strongBuy + latestRec.buy}, hold ${latestRec.hold}, sell ${latestRec.sell + latestRec.strongSell}`}>
                <div style={{ width: `${((latestRec.strongBuy + latestRec.buy) / recTotal) * 100}%`, background: "var(--up)" }} />
                <div style={{ width: `${(latestRec.hold / recTotal) * 100}%`, background: "var(--amber)" }} />
                <div style={{ width: `${((latestRec.sell + latestRec.strongSell) / recTotal) * 100}%`, background: "var(--down)" }} />
              </div>
              <div className="flex justify-between text-[10px] mt-1">
                <span className="up">Buy {latestRec.strongBuy + latestRec.buy}</span>
                <span className="text-amber">Hold {latestRec.hold}</span>
                <span className="down">Sell {latestRec.sell + latestRec.strongSell}</span>
              </div>
            </div>
          )}
          {c.earningsHistory.length > 0 && (
            <table className="mt-1">
              <thead>
                <tr><th>Qtr</th><th className="num">EPS act</th><th className="num">Est</th><th className="num">Surprise</th></tr>
              </thead>
              <tbody>
                {c.earningsHistory.slice(-4).map((e) => (
                  <tr key={e.quarter}>
                    <td>{e.quarter}</td>
                    <td className="num">{fmtNum(e.actual)}</td>
                    <td className="num">{fmtNum(e.estimate)}</td>
                    <td className={`num ${dirClass(e.surprisePct)}`}>{fmtPct(e.surprisePct, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        {/* Fundamentals from EDGAR */}
        <Panel title="Annual Fundamentals (SEC XBRL)" className="lg:col-span-2 xl:col-span-2" right={c.sec.cik ? `CIK ${c.sec.cik} · FYE ${c.sec.fiscalYearEnd ?? "?"}` : "no EDGAR match"}>
          <AnnualTable f={fund} currency={cur} isFinancial={c.isFinancial} />
        </Panel>

        {/* Filings */}
        <Panel title="SEC Filings" right={c.sec.filings.length ? `${c.sec.filings.length} recent, Form 4 excluded` : ""}>
          {c.sec.filings.length === 0 ? (
            <div className="p-3 text-dim">No filings on EDGAR for this symbol.</div>
          ) : (
            <table>
              <tbody>
                {c.sec.filings.map((f, i) => (
                  <tr key={i} className="row-hover">
                    <td className="text-amber w-16 whitespace-nowrap">{f.form}</td>
                    <td className="text-dim w-24">{f.filed}</td>
                    <td className="truncate max-w-[220px]"><a href={f.url} target="_blank" rel="noreferrer" className="hover:text-amber">{f.description || "open"}</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        {/* Profile */}
        <Panel title="Profile" right={c.headquarters ?? ""}>
          <p className="p-3 text-fg/90 leading-relaxed text-[11.5px]">{c.summary ?? "No description on file."}</p>
          {c.website && (
            <a href={c.website} target="_blank" rel="noreferrer" className="block px-3 pb-3 text-blue text-[11px]">{c.website}</a>
          )}
        </Panel>

        {/* News */}
        <Panel title="Company Wire" className="lg:col-span-3 xl:col-span-4" right={`${c.news.length} stories · Google News, promo sources removed`}>
          {c.news.length === 0 ? (
            <div className="p-3 text-dim">No headlines in the last three days from non-promotional sources.</div>
          ) : (
            <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
              {c.news.map((n) => (
                <li key={n.id} className="row-hover border-b border-line-faint md:border-r">
                  <a href={n.link} target="_blank" rel="noreferrer" className="grid grid-cols-[36px_1fr] gap-2 px-2 py-1.5">
                    <span className="text-mute text-[10px] pt-0.5">{timeAgo(n.publishedAt)}</span>
                    <span>
                      <span className="leading-snug">{n.title}</span>
                      <span className="block text-[10px] text-amber-dim mt-0.5">{n.source}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="px-2 py-1 text-[10px] text-mute">
        Sources: Yahoo Finance (quotes, TTM financials, estimates), SEC EDGAR (filings, XBRL annual facts), Google News. Fetched {hhmm(c.fetchedAt)}. Not investment advice.
      </div>
    </div>
  );
}
