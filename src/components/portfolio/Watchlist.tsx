"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { QuotesPayload, WatchQuote } from "@/lib/portfolio-types";
import { dirClass, fmtNum, fmtPct, fmtX, hhmm, shortDate } from "@/lib/format";
import { Panel, Unavailable, usePoll } from "./shared";
import { useWatchlist } from "./watchlistStore";

type Hit = { symbol: string; name: string; exchange: string | null; type: string | null };

function AddBox({ onAdd }: { onAdd: (s: string) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);

  // Debounced typeahead, same cadence as the command bar.
  useEffect(() => {
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      if (q.trim().length < 1) {
        setHits([]);
        return;
      }
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal });
        const j = await r.json();
        setHits(j.results ?? []);
        setSel(0);
        setOpen(true);
      } catch {}
    }, 300);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);

  const commit = (sym: string) => {
    onAdd(sym);
    setQ("");
    setHits([]);
    setOpen(false);
  };

  return (
    <div className="relative px-2 py-1.5 border-b border-line">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setSel((s) => Math.min(s + 1, hits.length - 1));
          else if (e.key === "ArrowUp") setSel((s) => Math.max(s - 1, 0));
          else if (e.key === "Enter") {
            if (open && hits[sel]) commit(hits[sel].symbol);
            else if (q.trim()) commit(q);
          } else if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Add ticker or company"
        aria-label="Add a ticker to the watchlist"
        className="w-full h-6 text-[12px] uppercase placeholder:normal-case placeholder:text-mute"
        spellCheck={false}
        autoComplete="off"
      />
      {open && hits.length > 0 && (
        <ul className="absolute left-2 right-2 top-8 z-20 border border-line-strong bg-panel">
          {hits.map((h, i) => (
            <li
              key={h.symbol}
              onMouseDown={() => commit(h.symbol)}
              className={`flex justify-between gap-3 px-2 py-1 cursor-pointer ${i === sel ? "bg-hover text-amber" : ""}`}
            >
              <span className="font-semibold w-16 shrink-0">{h.symbol}</span>
              <span className="truncate flex-1 text-fg">{h.name}</span>
              <span className="text-mute text-[10px] shrink-0">{h.exchange}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Thin 52-week track with a marker at the current price. */
function RangeBar({ q }: { q: WatchQuote }) {
  const { price, fiftyTwoWeekLow: lo, fiftyTwoWeekHigh: hi } = q;
  if (price === null || lo === null || hi === null || hi <= lo) return null;
  const pos = Math.min(Math.max((price - lo) / (hi - lo), 0), 1) * 100;
  const below = ((hi - price) / hi) * 100;
  return (
    <div className="flex items-center gap-2 text-[10px]" title={`52w range ${fmtNum(lo, 2)} to ${fmtNum(hi, 2)}`}>
      <span className="relative h-1 w-20 shrink-0 bg-line" aria-hidden="true">
        <span className="absolute top-1/2 h-2.5 w-0.5 -translate-y-1/2 bg-amber" style={{ left: `calc(${pos}% - 1px)` }} />
      </span>
      <span className="text-dim">{below < 0.05 ? "at 52w high" : `${fmtNum(below, 1)}% below high`}</span>
    </div>
  );
}

function WatchRow({ sym, q, held, onRemove }: { sym: string; q: WatchQuote | undefined; held: boolean; onRemove: () => void }) {
  const tags = (
    <>
      {held && <span className="text-[9px] text-cyan border border-line-strong px-0.5">held</span>}
    </>
  );
  return (
    <li className="row-hover border-b border-line-faint px-2 py-1.5">
      <div className="flex items-baseline gap-2">
        <Link href={`/company/${encodeURIComponent(sym)}`} className="font-semibold hover:text-amber">{sym}</Link>
        {tags}
        <span className="truncate text-dim text-[11px] min-w-0 flex-1">{q?.name ?? ""}</span>
        {q && !q.missing && (
          <>
            <span className="text-right">{fmtNum(q.price, 2)}</span>
            <span className={`text-right w-16 ${dirClass(q.changePct)}`}>{fmtPct(q.changePct)}</span>
          </>
        )}
        {q?.missing && <span className="text-mute text-[11px]">no quote</span>}
        {!q && <span className="text-mute text-[11px]">...</span>}
        <button onClick={onRemove} aria-label={`Remove ${sym} from watchlist`} className="text-mute hover:text-down px-1 leading-none">
          ×
        </button>
      </div>
      {q && !q.missing && (
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-dim">
          <RangeBar q={q} />
          {q.forwardPE !== null && <span>fwd P/E {fmtX(q.forwardPE)}</span>}
          {q.earningsDate && <span>ER {shortDate(q.earningsDate)}</span>}
        </div>
      )}
    </li>
  );
}

export function Watchlist({ held }: { held: Set<string> }) {
  const { list, add, remove } = useWatchlist();
  const url = list.length ? `/api/quotes?symbols=${list.map(encodeURIComponent).join(",")}` : null;
  const { data, err } = usePoll<QuotesPayload>(url, 60_000);
  const bySym = useMemo(() => new Map((data?.quotes ?? []).map((q) => [q.symbol.toUpperCase(), q])), [data]);

  return (
    <Panel title="Watchlist" className="h-full" right={list.length ? (data ? `${list.length} names · refreshed ${hhmm(data.fetchedAt)}` : err ? "error" : "loading") : "candidates"}>
      <AddBox onAdd={add} />
      {!list.length && <div className="p-2 text-dim">Add tickers you are considering.</div>}
      {list.length > 0 && !data && err && <Unavailable what="Quotes" detail={err} />}
      <ul>
        {list.map((s) => (
          <WatchRow key={s} sym={s} q={bySym.get(s)} held={held.has(s)} onRemove={() => remove(s)} />
        ))}
      </ul>
    </Panel>
  );
}
