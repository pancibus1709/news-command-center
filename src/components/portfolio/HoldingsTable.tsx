"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { dirClass, fmtNum, fmtPct, fmtUsd, shortDate } from "@/lib/format";
import { earningsSoon, hasPage, type Row } from "./shared";

type Key = "symbol" | "name" | "quantity" | "price" | "dayChangePct" | "dayPnl" | "value" | "weight" | "costBasis" | "totalPnl" | "totalPnlPct";

type Col = { key: Key; label: string; num?: boolean; hide?: string };

// Lower-value columns drop out on narrow screens instead of scrolling sideways.
const COLS: Col[] = [
  { key: "symbol", label: "Symbol" },
  { key: "name", label: "Name", hide: "hidden lg:table-cell" },
  { key: "quantity", label: "Qty", num: true, hide: "hidden md:table-cell" },
  { key: "price", label: "Price", num: true, hide: "hidden sm:table-cell" },
  { key: "dayChangePct", label: "Day %", num: true },
  { key: "dayPnl", label: "Day $", num: true, hide: "hidden md:table-cell" },
  { key: "value", label: "Value", num: true },
  { key: "weight", label: "Weight", num: true },
  { key: "costBasis", label: "Cost", num: true, hide: "hidden md:table-cell" },
  { key: "totalPnl", label: "Total $", num: true, hide: "hidden sm:table-cell" },
  { key: "totalPnlPct", label: "Total %", num: true },
];

const val = (r: Row, k: Key): string | number | null => (k === "symbol" || k === "name" ? r[k].toUpperCase() : r[k]);

export function HoldingsTable({ rows, now }: { rows: Row[]; now: number }) {
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: "value", dir: -1 });

  const sorted = useMemo(() => {
    const list = [...rows];
    list.sort((a, b) => {
      // Cash sits at the bottom whatever the sort.
      if ((a.kind === "cash") !== (b.kind === "cash")) return a.kind === "cash" ? 1 : -1;
      const x = val(a, sort.key);
      const y = val(b, sort.key);
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
    return list;
  }, [rows, sort]);

  const maxWeight = Math.max(1, ...rows.map((r) => r.weight));

  const onSort = (key: Key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "symbol" || key === "name" ? 1 : -1 }));

  return (
    <table className="max-sm:[&_td]:px-1! max-sm:[&_th]:px-1!">
      <thead>
        <tr>
          {COLS.map((c) => {
            const active = sort.key === c.key;
            return (
              <th
                key={c.key}
                className={`${c.num ? "num" : ""} ${c.hide ?? ""} z-[1]`}
                aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
              >
                <button onClick={() => onSort(c.key)} className={`uppercase tracking-[inherit] whitespace-nowrap ${active ? "text-amber" : "hover:text-fg"}`}>
                  {c.label}
                  <span aria-hidden="true" className="inline-block w-2">{active ? (sort.dir === 1 ? "▲" : "▼") : ""}</span>
                </button>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => {
          const snap = r.priceSource === "snapshot" && r.kind !== "cash";
          const er = earningsSoon(r.earningsDate, now);
          const day = dirClass(r.dayChangePct);
          const tot = dirClass(r.totalPnl);
          return (
            <tr key={`${r.symbol}-${r.accounts.join(",")}`} className="row-hover">
              <td className="whitespace-nowrap">
                {hasPage(r) ? (
                  <Link href={`/company/${encodeURIComponent(r.symbol)}`} className="font-semibold text-fg hover:text-amber" title={r.name}>
                    {r.symbol}
                  </Link>
                ) : (
                  <span className="font-semibold text-dim" title={r.name}>{r.symbol}</span>
                )}
                {er && (
                  <span className="ml-1 text-[9px] text-amber border border-amber-dim px-0.5" title={`Earnings ${new Date(r.earningsDate!).toDateString()}`}>
                    ER {shortDate(r.earningsDate)}
                  </span>
                )}
                {snap && (
                  <span className="ml-1 text-[9px] text-mute" title="No live quote, showing the export price">snap</span>
                )}
              </td>
              <td className="hidden lg:table-cell text-dim max-w-0 w-[22%] truncate" title={r.name}>{r.name}</td>
              <td className="num hidden md:table-cell">{r.quantity === null ? "" : fmtNum(r.quantity, r.quantity % 1 ? 3 : 0)}</td>
              <td className="num hidden sm:table-cell">{r.kind === "cash" ? "" : fmtNum(r.price, 2)}</td>
              <td className={`num ${day}`}>{r.kind === "cash" ? "" : fmtPct(r.dayChangePct)}</td>
              <td className={`num hidden md:table-cell ${day}`}>{r.kind === "cash" ? "" : fmtUsd(r.dayPnl, { sign: true })}</td>
              <td className="num font-semibold">{fmtUsd(r.value)}</td>
              <td className="num whitespace-nowrap">
                <span className="inline-flex items-center gap-1.5 justify-end">
                  <span className="hidden sm:inline-block w-10 h-1 bg-line-faint" aria-hidden="true">
                    <span className="block h-full bg-amber-dim" style={{ width: `${(r.weight / maxWeight) * 100}%` }} />
                  </span>
                  {fmtNum(r.weight, 1)}%
                </span>
              </td>
              <td className="num hidden md:table-cell text-dim">{r.costBasis === null ? "" : fmtUsd(r.costBasis)}</td>
              <td className={`num hidden sm:table-cell ${tot}`}>{r.totalPnl === null ? "" : fmtUsd(r.totalPnl, { sign: true })}</td>
              <td className={`num ${tot}`}>{r.totalPnlPct === null ? "" : fmtPct(r.totalPnlPct)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
