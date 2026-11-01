"use client";

import { useEffect, useMemo, useState } from "react";
import type { MarketBoard, Quote } from "@/lib/markets";
import type { Series } from "@/lib/credit";
import type { NewsItem, FeedStatus } from "@/lib/news";
import { CATEGORY_LABELS, CATEGORY_ORDER, type Category } from "@/lib/feeds";
import { dirClass, fmtBp, fmtNum, fmtPct, fmtSigned, freshness, hhmm, timeAgo } from "@/lib/format";
import { Sparkline } from "./Sparkline";

type NewsPayload = { items: NewsItem[]; status: FeedStatus[]; fetchedAt: string; sort: "ranked" | "latest" };
type CreditPayload = { series: Series[]; fetchedAt: string; latestObs: string | null };

function usePoll<T>(url: string, ms: number) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
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

const CAT_COLOR: Record<Category, string> = {
  markets: "text-amber",
  credit: "text-cyan",
  economy: "text-blue",
  politics: "text-purple",
  regulatory: "text-down",
  ai: "text-up",
  world: "text-dim",
};

const priceDecimals = (q: Quote) => (q.price !== null && q.price < 10 ? 4 : 2);

function QuoteRows({ rows, link }: { rows: Quote[]; link?: boolean }) {
  return (
    <table>
      <tbody>
        {rows.map((q) => {
          const isYield = q.unit === "yield";
          // Yields move in basis points, not percent of the yield. A 10Y going
          // 5.098 to 5.131 is +3.3bp, and a desk reads "+0.65%" as 65bp.
          const cls = dirClass(q.change);
          const inner = (
            <>
              <td className="text-fg w-[42%] whitespace-nowrap overflow-hidden text-ellipsis max-w-0" title={q.label}>{q.label}</td>
              <td className="num">{isYield ? `${fmtNum(q.price, 3)}%` : fmtNum(q.price, priceDecimals(q))}</td>
              <td className={`num ${cls}`}>{isYield ? fmtBp(q.change) : fmtSigned(q.change, priceDecimals(q))}</td>
              <td className={`num ${cls} w-16`} title={q.asOf ? `As of ${new Date(q.asOf).toLocaleString("en-US", { timeZone: "America/New_York" })} ET` : undefined}>{isYield ? "" : fmtPct(q.changePct)}</td>
            </>
          );
          return (
            <tr key={q.symbol} className="row-hover">
              {link ? (
                <td colSpan={4} className="p-0">
                  <a href={`/company/${encodeURIComponent(q.symbol)}`} className="block">
                    <table><tbody><tr>{inner}</tr></tbody></table>
                  </a>
                </td>
              ) : (
                inner
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Panel({ title, right, children, id, className = "" }: { title: string; right?: React.ReactNode; children: React.ReactNode; id?: string; className?: string }) {
  return (
    <section id={id} className={`panel ${className}`}>
      <div className="panel-head">
        <h2 className="text-inherit font-inherit">{title}</h2>
        {right && <span className="text-dim font-normal normal-case tracking-normal text-[10px]">{right}</span>}
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}

function Unavailable({ what, detail }: { what: string; detail?: string | null }) {
  return (
    <div className="p-2 text-down text-[11px]">
      {what} unavailable{detail ? ` (${detail})` : ""}. Retrying on the next cycle.
    </div>
  );
}

function Tape({ board }: { board: MarketBoard | null }) {
  const items = board ? [...board.indices, ...board.rates, ...board.risk, ...board.creditEtfs] : [];
  if (!items.length) return <div className="h-7 border-b border-line skeleton" />;
  const cell = (q: Quote, i: number) => {
    const isYield = q.unit === "yield";
    return (
      <span key={`${q.symbol}-${i}`} className="inline-flex gap-2">
        <span className="text-dim">{q.label}</span>
        <span>{isYield ? `${fmtNum(q.price, 3)}%` : fmtNum(q.price, priceDecimals(q))}</span>
        <span className={dirClass(q.change)}>{isYield ? fmtBp(q.change) : fmtPct(q.changePct)}</span>
      </span>
    );
  };
  return (
    <div className="h-7 border-b border-line bg-panel overflow-hidden flex items-center" aria-hidden="true">
      <div className="tape px-4">
        {items.map(cell)}
        {items.map((q, i) => cell(q, i + 100))}
      </div>
    </div>
  );
}

function SectorHeat({ sectors }: { sectors: Quote[] }) {
  return (
    <div className="grid grid-cols-4 gap-px bg-line p-px">
      {sectors.map((s) => {
        const v = s.changePct ?? 0;
        const a = Math.min(Math.abs(v) / 2.5, 1);
        const bg = v >= 0 ? `rgba(45,211,111,${0.12 + a * 0.55})` : `rgba(255,77,77,${0.12 + a * 0.55})`;
        return (
          <a
            key={s.symbol}
            href={`/company/${s.symbol}`}
            className="p-1.5 text-center leading-tight hover:outline hover:outline-amber"
            style={{ background: bg }}
            title={`${s.symbol} ${fmtPct(s.changePct)}`}
            aria-label={`${s.label} ${s.symbol} ${fmtPct(s.changePct)}`}
          >
            <div className="text-[10px] text-fg/90 truncate">{s.label}</div>
            <div className="text-[12px] font-semibold">{fmtPct(s.changePct)}</div>
          </a>
        );
      })}
    </div>
  );
}

function CreditRows({ series }: { series: Series[] }) {
  if (series.every((s) => s.latest === null)) return <Unavailable what="FRED" />;
  const groups: { key: Series["group"]; label: string }[] = [
    { key: "spreads", label: "Spreads (OAS, bp)" },
    { key: "rates", label: "Rates (%, FRED H.15 close, 1-2 days behind the CBOE panel, deltas in bp)" },
    { key: "policy", label: "Policy & Funding (%, deltas in bp)" },
  ];
  return (
    <table>
      <thead>
        <tr>
          <th>Series</th>
          <th className="num">Last</th>
          <th className="num">1D</th>
          <th className="num">1W</th>
          <th className="num">1M</th>
          <th>90D</th>
        </tr>
      </thead>
      <tbody>
        {groups.map((g) => (
          <GroupRows key={g.key} label={g.label} rows={series.filter((s) => s.group === g.key)} />
        ))}
      </tbody>
    </table>
  );
}

function GroupRows({ label, rows }: { label: string; rows: Series[] }) {
  return (
    <>
      <tr>
        <td colSpan={6} className="text-[10px] uppercase tracking-wider text-amber-dim pt-2">{label}</td>
      </tr>
      {rows.map((s) => {
        const bp = s.unit === "bp";
        // Credit desk convention: wider spreads and higher rates are risk-off
        // (red). Curve and breakeven direction is ambiguous, so no color.
        const d = (v: number | null) => (v === null ? "--" : bp ? fmtSigned(v, 0) : fmtBp(v, 0));
        const c = (v: number | null) => (v === null || v === 0 || s.rising === "neutral" ? "flat" : v > 0 ? "down" : "up");
        return (
          <tr key={s.id} className="row-hover" title={`FRED ${s.id}, as of ${s.latestDate ?? "n/a"}`}>
            <td>
              <div>{s.label}</div>
              <div className="text-[10px] text-mute">{s.latestDate ?? ""}</div>
            </td>
            <td className="num font-semibold">{bp ? fmtNum(s.latest, 0) : fmtNum(s.latest, 2)}</td>
            <td className={`num ${c(s.change1d)}`}>{s.freq === "w" ? "--" : d(s.change1d)}</td>
            <td className={`num ${c(s.change1w)}`}>{d(s.change1w)}</td>
            <td className={`num ${c(s.change1m)}`}>{d(s.change1m)}</td>
            <td>
              <Sparkline
                points={s.points.map((p) => p.v)}
                width={90}
                height={22}
                invert={s.rising === "off"}
                neutral={s.rising === "neutral"}
                label={`${s.label}, 90 day trend`}
              />
            </td>
          </tr>
        );
      })}
    </>
  );
}

type Sort = "ranked" | "latest";

function Wire({ news, newsErr, cat, setCat, sort, setSort, filter, setFilter }: { news: NewsPayload | null; newsErr: string | null; cat: Category | "all"; setCat: (c: Category | "all") => void; sort: Sort; setSort: (s: Sort) => void; filter: string; setFilter: (s: string) => void }) {
  // Lane and ranking are applied server-side; only the free-text filter is local.
  const items = useMemo(() => {
    if (!news) return [];
    let list = news.items;
    if (filter.trim()) {
      const f = filter.toLowerCase();
      list = list.filter((i) => i.title.toLowerCase().includes(f) || i.source.toLowerCase().includes(f));
    }
    return list.slice(0, 300);
  }, [news, filter]);

  return (
    <Panel
      id="news"
      title="Wire"
      className="h-full"
      right={news ? `${items.length} stories · ${sort === "ranked" ? "ranked, 10% cap per source" : "newest first"} · refreshed ${hhmm(news.fetchedAt)}` : newsErr ? "error" : "loading"}
    >
      <div className="sticky top-0 z-10 flex items-center gap-1 border-b border-line bg-panel px-2 py-1 flex-wrap">
        {(["all", ...CATEGORY_ORDER] as const).map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`px-2 py-0.5 text-[10px] uppercase tracking-wider border ${cat === c ? "border-amber text-amber bg-raised" : "border-transparent text-dim hover:text-fg"}`}
          >
            {c === "all" ? "All" : CATEGORY_LABELS[c]}
          </button>
        ))}
        <span className="ml-auto flex border border-line-strong" role="group" aria-label="Sort">
          {(["ranked", "latest"] as const).map((s) => (
            <button key={s} onClick={() => setSort(s)} className={`px-2 py-0.5 text-[10px] uppercase tracking-wider ${sort === s ? "bg-raised text-amber" : "text-dim hover:text-fg"}`}>
              {s}
            </button>
          ))}
        </span>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="filter" aria-label="Filter headlines" className="h-5 w-32 text-[11px]" />
      </div>
      {!news && !newsErr && <div className="p-3 text-dim">Pulling feeds...</div>}
      {!news && newsErr && <Unavailable what="News feeds" detail={newsErr} />}
      <ul aria-live="polite">
        {items.map((i) => (
          <li key={i.id} className="row-hover border-b border-line-faint">
            <a href={i.link} target="_blank" rel="noreferrer" className="grid grid-cols-[44px_1fr] gap-2 px-2 py-1.5">
              <span className="text-mute text-[10px] pt-0.5" title={new Date(i.publishedAt).toLocaleString()}>{timeAgo(i.publishedAt)}</span>
              <span>
                <span className="text-fg leading-snug">{i.title}</span>
                <span className="block text-[10px] mt-0.5">
                  <span className={CAT_COLOR[i.category]}>{i.source}</span>
                  {i.tags.filter((t) => t !== i.category).map((t) => (
                    <span key={t} className={`ml-2 ${CAT_COLOR[t]} opacity-80`}>#{t}</span>
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

export function Board() {
  const { data: mk, err: mkErr } = usePoll<MarketBoard>("/api/markets", 60_000);
  const { data: cr, err: crErr } = usePoll<CreditPayload>("/api/credit", 30 * 60_000);
  const [cat, setCat] = useState<Category | "all">("all");
  const [sort, setSort] = useState<Sort>("ranked");
  const [filter, setFilter] = useState("");
  const newsUrl = `/api/news?sort=${sort}${cat === "all" ? "" : `&category=${cat}`}`;
  const { data: news, err: newsErr } = usePoll<NewsPayload>(newsUrl, 3 * 60_000);

  // Freshness per panel from the exchange, not a hardcoded word.
  const fresh = (rows: Quote[] | undefined) => (rows ? freshness(rows.find((q) => q.asOf)) : "");

  const feedsDown = news?.status.filter((s) => !s.ok) ?? [];
  const quotes = (rows: Quote[] | undefined, h: string, link?: boolean) =>
    rows ? <QuoteRows rows={rows} link={link} /> : mkErr ? <Unavailable what="Yahoo Finance" detail={mkErr} /> : <div className={`${h} skeleton`} />;

  return (
    <div className="xl:h-full flex flex-col">
      <Tape board={mk} />
      <div className="xl:flex-1 xl:min-h-0 grid gap-1 p-1 grid-cols-1 xl:grid-cols-[300px_1fr_440px] xl:grid-rows-[1fr]">
        {/* Left: equities and rates. The column scrolls; panels keep their natural height. */}
        <div className="flex flex-col gap-1 xl:min-h-0 xl:overflow-auto [&>.panel]:shrink-0">
          <Panel title="Indices" right={mk ? fresh(mk.indices) : mkErr ? "error" : "loading"}>{quotes(mk?.indices, "h-28")}</Panel>
          <Panel title="Treasuries (CBOE)" right={mk ? `${fresh(mk.rates)} · chg in bp` : ""}>{quotes(mk?.rates, "h-20")}</Panel>
          <Panel title="Credit ETFs" right={mk ? fresh(mk.creditEtfs) : ""}>{quotes(mk?.creditEtfs, "h-28", true)}</Panel>
          <Panel title="Risk & Macro" right={mk ? fresh(mk.risk.filter((q) => q.symbol !== "BTC-USD")) : ""}>{quotes(mk?.risk, "h-28")}</Panel>
          <Panel title="Sectors (SPDR)" right={mk ? fresh(mk.sectors) : ""}>{mk ? <SectorHeat sectors={mk.sectors} /> : mkErr ? <Unavailable what="Yahoo Finance" /> : <div className="h-24 skeleton" />}</Panel>
        </div>

        {/* Center: wire */}
        <div className="h-[70vh] xl:h-auto xl:min-h-0">
          <Wire news={news} newsErr={newsErr} cat={cat} setCat={setCat} sort={sort} setSort={setSort} filter={filter} setFilter={setFilter} />
        </div>

        {/* Right: credit */}
        <div className="grid gap-1 xl:min-h-0 xl:grid-rows-[1fr_auto] xl:overflow-auto">
          <Panel id="credit" title="Credit Monitor" right={cr ? `FRED · latest obs ${cr.latestObs ?? "n/a"}` : crErr ? "error" : "loading"}>
            {cr ? <CreditRows series={cr.series} /> : crErr ? <Unavailable what="FRED" detail={crErr} /> : <div className="h-64 skeleton" />}
          </Panel>
          <Panel title="Sources" right={news ? `${news.status.filter((s) => s.ok).length}/${news.status.length} live` : ""}>
            <div className="flex flex-wrap gap-1 p-2">
              {news?.status.map((s) => (
                <span key={s.id} className={`text-[10px] px-1 border ${s.ok ? "border-line text-dim" : "border-down text-down"}`} title={`${s.count} items`}>
                  {s.name}
                </span>
              ))}
              {feedsDown.length > 0 && (
                <span className="text-[10px] text-down w-full">
                  {feedsDown.length === 1 ? "1 feed returned nothing." : `${feedsDown.length} feeds returned nothing.`}
                </span>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
