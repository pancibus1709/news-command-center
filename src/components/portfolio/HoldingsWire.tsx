"use client";

import { useMemo } from "react";
import type { PortfolioNewsPayload } from "@/lib/portfolio-types";
import { hhmm, timeAgo } from "@/lib/format";
import { Panel, Unavailable } from "./shared";

/**
 * "auto" follows the account selector (that account's names, or everything
 * for All accounts). "all" and a symbol are explicit overrides.
 */
export type WireSel = { mode: "auto" } | { mode: "all" } | { mode: "sym"; sym: string };

type Props = {
  news: PortfolioNewsPayload | null;
  err: string | null;
  sel: WireSel;
  setSel: (s: WireSel) => void;
  /** Present when one account is selected. */
  account: { label: string; symbols: Set<string> } | null;
};

const chip = (on: boolean) =>
  `px-1.5 py-0.5 text-[10px] uppercase tracking-wider border whitespace-nowrap ${on ? "border-amber text-amber bg-raised" : "border-transparent text-dim hover:text-fg"}`;

export function HoldingsWire({ news, err, sel, setSel, account }: Props) {
  const filterSet = useMemo<Set<string> | null>(
    () => (sel.mode === "sym" ? new Set([sel.sym]) : sel.mode === "auto" && account ? account.symbols : null),
    [sel, account],
  );

  const items = useMemo(() => {
    if (!news) return [];
    const list = filterSet ? news.items.filter((i) => i.symbols.some((s) => filterSet.has(s))) : news.items;
    return list.slice(0, 300);
  }, [news, filterSet]);

  const chips = news?.symbols.filter((s) => s.count > 0) ?? [];
  const allOn = sel.mode === "all" || (sel.mode === "auto" && !account);
  const acctOn = sel.mode === "auto" && !!account;

  return (
    <Panel
      title="Holdings Wire"
      className="h-full"
      right={news ? `${items.length} stories · refreshed ${hhmm(news.fetchedAt)}` : err ? "error" : "loading"}
    >
      <div className="sticky top-0 z-10 flex items-center gap-1 border-b border-line bg-panel px-2 py-1 flex-wrap" role="group" aria-label="Filter by symbol">
        <button onClick={() => setSel({ mode: "all" })} className={chip(allOn)} aria-pressed={allOn}>All</button>
        {account && (
          <button onClick={() => setSel({ mode: "auto" })} className={chip(acctOn)} aria-pressed={acctOn}>{account.label}</button>
        )}
        {chips.map((s) => {
          const on = sel.mode === "sym" && sel.sym === s.symbol;
          return (
            <button
              key={s.symbol}
              onClick={() => setSel(on ? { mode: "auto" } : { mode: "sym", sym: s.symbol })}
              className={chip(on)}
              aria-pressed={on}
              title={s.name}
            >
              {s.symbol}
              <span className="ml-1 text-mute normal-case">{s.count}</span>
            </button>
          );
        })}
      </div>
      {!news && !err && (
        <div className="p-2 flex flex-col gap-1">
          {Array.from({ length: 8 }, (_, i) => <div key={i} className="h-8 skeleton" />)}
        </div>
      )}
      {!news && err && <Unavailable what="Holdings news" detail={err} />}
      {news && !items.length && <div className="p-3 text-dim">No headlines for this selection.</div>}
      <ul aria-live="polite">
        {items.map((i) => (
          <li key={i.id} className="row-hover border-b border-line-faint">
            <a href={i.link} target="_blank" rel="noreferrer" className="grid grid-cols-[44px_1fr] gap-2 px-2 py-1.5">
              <span className="text-mute text-[10px] pt-0.5" title={new Date(i.publishedAt).toLocaleString()}>{timeAgo(i.publishedAt)}</span>
              <span className="min-w-0">
                <span className="text-fg leading-snug">{i.title}</span>
                <span className="flex flex-wrap items-center gap-1 text-[10px] mt-0.5">
                  <span className="text-dim mr-1">{i.source}</span>
                  {i.symbols.map((s) => (
                    <span key={s} className="text-amber border border-amber-dim px-1 leading-tight">{s}</span>
                  ))}
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
