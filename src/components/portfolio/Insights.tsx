"use client";

import Link from "next/link";
import { dirClass, fmtNum, fmtPct, fmtUsd } from "@/lib/format";
import { hasPage, Panel, SWATCH, type Row } from "./shared";

function MoverRows({ rows, empty }: { rows: Row[]; empty: string }) {
  if (!rows.length) return <div className="px-2 py-1 text-mute">{empty}</div>;
  return (
    <table>
      <tbody>
        {rows.map((r) => (
          <tr key={r.symbol} className="row-hover">
            <td className="font-semibold whitespace-nowrap">
              <Link href={`/company/${encodeURIComponent(r.symbol)}`} className="hover:text-amber" title={r.name}>{r.symbol}</Link>
            </td>
            <td className={`num ${dirClass(r.dayChangePct)}`}>{fmtPct(r.dayChangePct)}</td>
            <td className={`num ${dirClass(r.dayPnl)}`}>{fmtUsd(r.dayPnl, { sign: true })}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Movers({ rows, scope }: { rows: Row[]; scope: string }) {
  const live = rows.filter((r) => hasPage(r) && r.dayChangePct !== null && r.priceSource === "live");
  const byPct = [...live].sort((a, b) => b.dayChangePct! - a.dayChangePct!);
  const gainers = byPct.filter((r) => r.dayChangePct! > 0).slice(0, 3);
  const losers = byPct.filter((r) => r.dayChangePct! < 0).reverse().slice(0, 3);
  return (
    <Panel title="Movers" right={`${scope} · today, day $ = contribution`}>
      <div className="grid grid-cols-2 divide-x divide-line">
        <div>
          <div className="px-2 pt-1 text-[10px] uppercase tracking-wider text-amber-dim">Gainers</div>
          <MoverRows rows={gainers} empty="No gainers today." />
        </div>
        <div>
          <div className="px-2 pt-1 text-[10px] uppercase tracking-wider text-amber-dim">Losers</div>
          <MoverRows rows={losers} empty="No losers today." />
        </div>
      </div>
    </Panel>
  );
}

export function Allocation({ rows, scope }: { rows: Row[]; scope: string }) {
  const byWeight = [...rows].filter((r) => r.weight > 0).sort((a, b) => b.weight - a.weight);
  const top = byWeight.slice(0, 8);
  const other = byWeight.slice(8).reduce((s, r) => s + r.weight, 0);
  const top5 = byWeight.slice(0, 5).reduce((s, r) => s + r.weight, 0);
  const segs = [
    ...top.map((r, i) => ({ key: r.symbol, label: r.symbol, w: r.weight, cls: SWATCH[i] })),
    ...(other > 0.05 ? [{ key: "__other", label: "Other", w: other, cls: "bg-raised" }] : []),
  ];
  return (
    <Panel title="Allocation" right={scope}>
      <div className="p-2 flex flex-col gap-2">
        <div className="flex h-3 w-full gap-px bg-bg" role="img" aria-label={segs.map((s) => `${s.label} ${fmtNum(s.w, 1)}%`).join(", ")}>
          {segs.map((s) => (
            <div key={s.key} className={`${s.cls} h-full min-w-px`} style={{ width: `${s.w}%` }} title={`${s.label} ${fmtNum(s.w, 1)}%`} />
          ))}
        </div>
        <ul className="grid grid-cols-3 gap-x-3 gap-y-0.5 text-[11px]">
          {segs.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5 min-w-0">
              <span className={`${s.cls} w-2 h-2 shrink-0 ${s.key === "__other" ? "border border-line-strong" : ""}`} aria-hidden="true" />
              <span className="truncate">{s.label}</span>
              <span className="ml-auto text-dim">{fmtNum(s.w, 1)}%</span>
            </li>
          ))}
        </ul>
        <div className="text-dim text-[11px]">
          Top 5 = <span className="text-fg">{fmtNum(top5, 1)}%</span> of value
        </div>
      </div>
    </Panel>
  );
}
