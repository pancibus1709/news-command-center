"use client";

import type { AccountSummary, PortfolioPayload, Totals } from "@/lib/portfolio-types";
import { dirClass, fmtPct, fmtUsd, hhmm, shortDate } from "@/lib/format";
import { marketLabel } from "./shared";

function Kpi({ label, value, sub, cls = "", subCls = "text-dim" }: { label: string; value: string; sub?: React.ReactNode; cls?: string; subCls?: string }) {
  return (
    <div className="bg-panel px-2 py-1.5 min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-dim">{label}</div>
      <div className={`text-[15px] font-semibold leading-tight truncate ${cls}`}>{value}</div>
      <div className={`text-[10px] truncate ${subCls}`}>{sub ?? " "}</div>
    </div>
  );
}

/** Secondary line of each KPI: the selected account's figure, or a context note. */
const subFor = (acct: AccountSummary | null, f: (t: Totals) => string, fallback: string) => (acct ? `${acct.label} ${f(acct)}` : fallback);

export function SummaryStrip({ p, acct }: { p: PortfolioPayload; acct: AccountSummary | null }) {
  const t = p.totals;
  const nPos = p.bySymbol.filter((r) => r.kind !== "cash").length;
  return (
    <div className="border-b border-line bg-raised">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-1">
        <h1 className="text-amber font-bold tracking-widest text-[13px] uppercase">
          {p.owner ? `${p.owner} ` : ""}<span className="text-dim font-normal">Portfolio</span>
        </h1>
        <span className="text-[10px] text-dim">
          {marketLabel(p.marketState)} · refreshed {hhmm(p.fetchedAt)}
          {p.snapshotAsOf && <> · positions as of {shortDate(p.snapshotAsOf)} export, prices live</>}
        </span>
        {p.staleSymbols.length > 0 && (
          <span className="text-[10px] text-amber">
            Export price shown for {p.staleSymbols.join(", ")} (no live quote)
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px bg-line border-t border-line">
        <Kpi label="Total value" value={fmtUsd(t.value)} sub={subFor(acct, (a) => fmtUsd(a.value), `${nPos} positions · ${p.accounts.length} accounts`)} />
        <Kpi
          label="Day P&L"
          value={`${fmtUsd(t.dayPnl, { sign: true })} ${fmtPct(t.dayPnlPct)}`}
          cls={dirClass(t.dayPnl)}
          sub={subFor(acct, (a) => `${fmtUsd(a.dayPnl, { sign: true })} ${fmtPct(a.dayPnlPct)}`, "since prior close")}
          subCls={acct ? dirClass(acct.dayPnl) : "text-dim"}
        />
        <Kpi
          label="Total P&L"
          value={`${fmtUsd(t.totalPnl, { sign: true })} ${fmtPct(t.totalPnlPct)}`}
          cls={dirClass(t.totalPnl)}
          sub={subFor(acct, (a) => `${fmtUsd(a.totalPnl, { sign: true })} ${fmtPct(a.totalPnlPct)}`, "vs cost basis")}
          subCls={acct ? dirClass(acct.totalPnl) : "text-dim"}
        />
        <Kpi label="Cost basis" value={fmtUsd(t.costBasis)} sub={subFor(acct, (a) => fmtUsd(a.costBasis), "invested, excl. cash")} />
        <Kpi label="Cash" value={fmtUsd(t.cash)} sub={subFor(acct, (a) => fmtUsd(a.cash), t.value ? `${((t.cash / t.value) * 100).toFixed(1)}% of value` : "")} />
      </div>
    </div>
  );
}

export function AccountSelector({ p, selected, onSelect }: { p: PortfolioPayload; selected: string | null; onSelect: (id: string | null) => void }) {
  const opts = [
    { id: null, label: "All accounts", value: p.totals.value, dayPct: p.totals.dayPnlPct },
    ...p.accounts.map((a) => ({ id: a.id as string | null, label: a.label, value: a.value, dayPct: a.dayPnlPct, note: a.note })),
  ];
  return (
    <div className="grid grid-cols-2 md:flex border-b border-line bg-panel" role="group" aria-label="Account">
      {opts.map((o) => {
        const on = selected === o.id;
        return (
          <button
            key={o.id ?? "all"}
            onClick={() => onSelect(o.id)}
            aria-pressed={on}
            title={"note" in o ? o.note : undefined}
            className={`md:flex-1 text-left px-3 py-1 border-r border-b md:border-b-0 border-line border-t-2 ${on ? "border-t-amber bg-raised text-amber" : "border-t-transparent text-dim hover:text-fg hover:bg-hover"}`}
          >
            <div className="text-[10px] uppercase tracking-wider truncate">{o.label}</div>
            <div className="flex gap-2 text-[12px]">
              <span className={on ? "text-fg" : ""}>{fmtUsd(o.value, { d: 0 })}</span>
              <span className={dirClass(o.dayPct)}>{fmtPct(o.dayPct)}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
