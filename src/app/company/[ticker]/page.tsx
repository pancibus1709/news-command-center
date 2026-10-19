import Link from "next/link";
import { getCompany, type CompanyProfile } from "@/lib/company";
import { LineChart } from "@/components/Sparkline";
import { dirClass, fmtInt, fmtMoney, fmtNum, fmtPct, fmtSigned, fmtX, timeAgo } from "@/lib/format";
import type { AnnualFact } from "@/lib/sec";

function Stat({ label, value, cls = "", hint }: { label: string; value: string; cls?: string; hint?: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-[#161616] px-2 py-1" title={hint}>
      <span className="text-dim">{label}</span>
      <span className={`font-semibold ${cls}`}>{value}</span>
    </div>
  );
}

function Panel({ title, right, children, className = "" }: { title: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-head">
        <span>{title}</span>
        {right && <span className="text-dim font-normal normal-case tracking-normal text-[10px]">{right}</span>}
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}

function AnnualTable({ f, currency }: { f: CompanyProfile["sec"]["fundamentals"]; currency: string }) {
  const rows: { label: string; data: AnnualFact[] }[] = [
    { label: "Revenue", data: f.revenue },
    { label: "Net income", data: f.netIncome },
    { label: "Operating cash flow", data: f.operatingCashFlow },
    { label: "Cash", data: f.cash },
    { label: "Long-term debt", data: f.longTermDebt },
    { label: "Total assets", data: f.totalAssets },
    { label: "Equity", data: f.stockholdersEquity },
  ].filter((r) => r.data.length);
  if (!rows.length) return <div className="p-3 text-dim">No XBRL fundamentals on EDGAR for this filer.</div>;
  const years = Array.from(new Set(rows.flatMap((r) => r.data.map((d) => d.fy)))).sort((a, b) => a - b).slice(-5);
  return (
    <table>
      <thead>
        <tr>
          <th>FY (10-K)</th>
          {years.map((y) => (
            <th key={y} className="num">{y}</th>
          ))}
          <th className="num">CAGR</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const by = new Map(r.data.map((d) => [d.fy, d.value]));
          const first = by.get(years[0]);
          const last = by.get(years[years.length - 1]);
          const n = years.length - 1;
          const cagr = first && last && first > 0 && last > 0 && n > 0 ? (Math.pow(last / first, 1 / n) - 1) * 100 : null;
          return (
            <tr key={r.label} className="row-hover">
              <td>{r.label}</td>
              {years.map((y) => {
                const v = by.get(y);
                return (
                  <td key={y} className={`num ${v !== undefined && v < 0 ? "down" : ""}`}>{v === undefined ? "--" : fmtMoney(v, currency)}</td>
                );
              })}
              <td className={`num ${dirClass(cagr)}`}>{cagr === null ? "--" : fmtPct(cagr, 1)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default async function CompanyPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const c = await getCompany(decodeURIComponent(ticker));

  if (!c) {
    return (
      <div className="p-6">
        <div className="text-down text-lg">No data for {ticker.toUpperCase()}</div>
        <p className="text-dim mt-2">Check the symbol. Use the search bar to find the right listing.</p>
        <Link href="/" className="text-amber mt-4 inline-block">&larr; Back to board</Link>
      </div>
    );
  }

  const cur = c.currency ?? "USD";
  const cls = dirClass(c.changePct);
  const range = c.week52Low !== null && c.week52High !== null && c.price !== null ? ((c.price - c.week52Low) / (c.week52High - c.week52Low)) * 100 : null;
  const upside = c.targetMean !== null && c.price ? ((c.targetMean - c.price) / c.price) * 100 : null;
  const lev = c.netDebtToEbitda;
  const levCls = lev === null ? "" : lev < 0 ? "up" : lev < 2 ? "up" : lev < 4 ? "text-amber" : "down";
  const latestRec = c.recTrend[0];
  const recTotal = latestRec ? latestRec.strongBuy + latestRec.buy + latestRec.hold + latestRec.sell + latestRec.strongSell : 0;

  return (
    <div className="p-1 flex flex-col gap-1">
      {/* Header */}
      <section className="panel">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2 px-3 py-2">
          <div>
            <div className="text-amber text-2xl font-bold tracking-wide leading-none">{c.ticker}</div>
            <div className="text-fg mt-1">{c.name}</div>
            <div className="text-dim text-[10px] uppercase tracking-wider mt-0.5">
              {[c.exchange, c.sector, c.industry].filter(Boolean).join(" · ")}
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
            <div><div className="text-dim text-[10px] uppercase">EV</div><div className="font-semibold">{fmtMoney(c.enterpriseValue, cur)}</div></div>
            <div><div className="text-dim text-[10px] uppercase">Net debt / EBITDA</div><div className={`font-semibold ${levCls}`}>{fmtX(lev)}</div></div>
            <div><div className="text-dim text-[10px] uppercase">Next earnings</div><div className="font-semibold">{c.nextEarnings ?? "--"}</div></div>
          </div>
        </div>
        {c.warnings.length > 0 && (
          <div className="px-3 pb-2 text-[10px] text-amber-dim">{c.warnings.join(" · ")}</div>
        )}
      </section>

      <div className="grid gap-1 grid-cols-1 lg:grid-cols-3 xl:grid-cols-4">
        {/* Chart */}
        <Panel title="1Y Price" className="lg:col-span-2 xl:col-span-2" right={c.history.length ? `${c.history[0].d} to ${c.history[c.history.length - 1].d}` : ""}>
          <LineChart data={c.history} height={240} />
          <div className="flex justify-between px-3 pb-2 text-[10px] text-dim">
            <span>52W {fmtNum(c.week52Low)} - {fmtNum(c.week52High)}</span>
            <span>{range !== null ? `${range.toFixed(0)}% of 52W range` : ""}</span>
            <span>Beta {fmtNum(c.beta)}</span>
            <span>Avg vol {fmtInt(c.avgVolume)}</span>
          </div>
        </Panel>

        {/* Valuation */}
        <Panel title="Valuation">
          <Stat label="P/E (TTM)" value={fmtX(c.trailingPE)} />
          <Stat label="P/E (fwd)" value={fmtX(c.forwardPE)} />
          <Stat label="EV / EBITDA" value={fmtX(c.evToEbitda)} />
          <Stat label="P / Sales" value={fmtX(c.priceToSales)} />
          <Stat label="P / Book" value={fmtX(c.priceToBook)} />
          <Stat label="Dividend yield" value={fmtPct(c.dividendYield, 2, false)} />
          <Stat label="Short % float" value={fmtPct(c.shortPctFloat, 1, false)} />
          <Stat label="Insiders / Inst." value={`${fmtPct(c.insiderPct, 0, false)} / ${fmtPct(c.institutionPct, 0, false)}`} />
        </Panel>

        {/* Operating */}
        <Panel title="Operating (TTM)">
          <Stat label="Revenue" value={fmtMoney(c.revenueTTM, cur)} />
          <Stat label="Revenue growth" value={fmtPct(c.revenueGrowth, 1)} cls={dirClass(c.revenueGrowth)} />
          <Stat label="Gross margin" value={fmtPct(c.grossMargin, 1, false)} />
          <Stat label="Operating margin" value={fmtPct(c.operatingMargin, 1, false)} cls={dirClass(c.operatingMargin)} />
          <Stat label="Net margin" value={fmtPct(c.profitMargin, 1, false)} cls={dirClass(c.profitMargin)} />
          <Stat label="EBITDA" value={fmtMoney(c.ebitdaTTM, cur)} />
          <Stat label="Free cash flow" value={fmtMoney(c.freeCashFlowTTM, cur)} cls={dirClass(c.freeCashFlowTTM)} />
          <Stat label="ROE" value={fmtPct(c.returnOnEquity, 1, false)} />
          <Stat label="Employees" value={fmtInt(c.employees)} />
        </Panel>

        {/* Credit */}
        <Panel title="Credit Profile">
          <Stat label="Total debt" value={fmtMoney(c.totalDebt, cur)} />
          <Stat label="Cash" value={fmtMoney(c.totalCash, cur)} />
          <Stat label="Net debt" value={fmtMoney(c.netDebt, cur)} cls={c.netDebt !== null && c.netDebt < 0 ? "up" : ""} hint="Negative means net cash" />
          <Stat label="Net debt / EBITDA" value={fmtX(lev)} cls={levCls} hint="Below 2x: conservative. 2-4x: moderate. Above 4x: levered." />
          <Stat label="Debt / Equity" value={c.debtToEquity === null ? "--" : fmtX(c.debtToEquity / 100, 2)} hint="Yahoo reports D/E as a percentage; shown here as a multiple" />
          <Stat label="Current ratio" value={fmtX(c.currentRatio, 2)} />
          <Stat label="Cash / Total debt" value={c.totalCash !== null && c.totalDebt ? fmtX(c.totalCash / c.totalDebt, 2) : "--"} hint="Liquidity cover: cash on hand as a multiple of total debt" />
          <Stat label="FCF / Total debt" value={c.freeCashFlowTTM !== null && c.totalDebt ? fmtPct((c.freeCashFlowTTM / c.totalDebt) * 100, 0, false) : "--"} cls={dirClass(c.freeCashFlowTTM)} hint="Annual free cash flow as a share of total debt. Above 20% is comfortable for most IG issuers." />
          <Stat label="SIC" value={c.sec.sicDescription ?? "--"} />
          <Stat label="Incorporated" value={c.sec.stateOfIncorporation ?? "--"} />
        </Panel>

        {/* Street */}
        <Panel title="Street" right={c.analystCount ? `${c.analystCount} analysts` : ""}>
          <Stat label="Consensus" value={(c.recommendation ?? "--").replace("_", " ").toUpperCase()} cls={c.recommendation?.includes("buy") ? "up" : c.recommendation?.includes("sell") ? "down" : ""} />
          <Stat label="Target (mean)" value={fmtNum(c.targetMean)} />
          <Stat label="Implied upside" value={fmtPct(upside, 1)} cls={dirClass(upside)} />
          <Stat label="Target range" value={`${fmtNum(c.targetLow)} - ${fmtNum(c.targetHigh)}`} />
          {latestRec && recTotal > 0 && (
            <div className="px-2 py-2">
              <div className="flex h-2 w-full overflow-hidden">
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
          <AnnualTable f={c.sec.fundamentals} currency={cur} />
        </Panel>

        {/* Filings */}
        <Panel title="SEC Filings" right={c.sec.filings.length ? `${c.sec.filings.length} recent` : ""}>
          {c.sec.filings.length === 0 ? (
            <div className="p-3 text-dim">No filings.</div>
          ) : (
            <table>
              <tbody>
                {c.sec.filings.map((f, i) => (
                  <tr key={i} className="row-hover">
                    <td className="text-amber w-16 whitespace-nowrap">{f.form}</td>
                    <td className="text-dim w-24">{f.filed}</td>
                    <td className="truncate max-w-[220px]"><a href={f.url} target="_blank" rel="noreferrer" className="hover:text-amber">{f.description}</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        {/* Profile */}
        <Panel title="Profile" right={c.headquarters ?? ""}>
          <p className="p-3 text-fg/90 leading-relaxed text-[11.5px]">{c.summary ?? "No description."}</p>
          {c.website && (
            <a href={c.website} target="_blank" rel="noreferrer" className="block px-3 pb-3 text-blue text-[11px]">{c.website}</a>
          )}
        </Panel>

        {/* News */}
        <Panel title="Company Wire" className="lg:col-span-3 xl:col-span-4" right={`${c.news.length} stories`}>
          {c.news.length === 0 ? (
            <div className="p-3 text-dim">No recent headlines.</div>
          ) : (
            <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
              {c.news.map((n) => (
                <li key={n.id} className="row-hover border-b border-[#141414] md:border-r">
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
        Sources: Yahoo Finance (quotes, TTM financials, estimates), SEC EDGAR (filings, XBRL annual facts), Google News. Fetched {c.fetchedAt.slice(11, 19)} UTC. Not investment advice.
      </div>
    </div>
  );
}
