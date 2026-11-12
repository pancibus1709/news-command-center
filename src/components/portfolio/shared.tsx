"use client";

import { useEffect, useState } from "react";
import type { Holding, SymbolRollup } from "@/lib/portfolio-types";

/** Same polling hook as the board. A null url skips the fetch entirely. */
export function usePoll<T>(url: string | null, ms: number) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = (await r.json()) as T;
        if (alive) {
          setData(j);
          setErr(null);
        }
      } catch (e) {
        if (alive) setErr((e as Error).message);
      }
    };
    load();
    const t = setInterval(load, ms);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [url, ms]);
  return { data, err };
}

export function Panel({ title, right, children, id, className = "" }: { title: string; right?: React.ReactNode; children: React.ReactNode; id?: string; className?: string }) {
  return (
    <section id={id} className={`panel ${className}`}>
      <div className="panel-head">
        <h2 className="text-inherit font-inherit">{title}</h2>
        {right && <span className="text-dim font-normal normal-case tracking-normal text-[10px] text-right">{right}</span>}
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}

export function Unavailable({ what, detail }: { what: string; detail?: string | null }) {
  return (
    <div className="p-2 text-down text-[11px]">
      {what} unavailable{detail ? ` (${detail})` : ""}. Retrying on the next cycle.
    </div>
  );
}

/**
 * One row shape for both scopes: a single account's holdings, or the
 * cross-account rollup. `weight` is the share of whatever is in scope.
 */
export type Row = Omit<Holding, "account" | "weightAccount" | "weightTotal"> & { weight: number; accounts: string[] };

export const fromHolding = (h: Holding): Row => ({ ...h, weight: h.weightAccount, accounts: [h.account] });
export const fromRollup = (r: SymbolRollup): Row => ({ ...r, weight: r.weightTotal });

/** Stocks and ETFs have a company page; funds and cash do not. */
export const hasPage = (r: { kind: Row["kind"] }) => r.kind === "stock" || r.kind === "etf";

const DAY = 86_400_000;
/** True when an earnings date falls in the next 14 days of `now`. */
export const earningsSoon = (iso: string | null, now: number) => {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= now - DAY && t - now <= 14 * DAY;
};

export const marketLabel = (s: string) =>
  s === "REGULAR" ? "market open" : s === "PRE" || s === "PREPRE" ? "pre-market" : s === "POST" || s === "POSTPOST" ? "after hours" : "market closed";

export const SWATCH = ["bg-amber", "bg-blue", "bg-cyan", "bg-purple", "bg-amber-dim", "bg-dim", "bg-mute", "bg-line-strong"] as const;
