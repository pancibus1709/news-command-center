"use client";

import { useMemo, useState } from "react";
import type { PortfolioNewsPayload, PortfolioPayload } from "@/lib/portfolio-types";
import { fromHolding, fromRollup, Panel, Unavailable, usePoll } from "./shared";
import { AccountSelector, SummaryStrip } from "./Summary";
import { HoldingsTable } from "./HoldingsTable";
import { Allocation, Movers } from "./Insights";
import { HoldingsWire, type WireSel } from "./HoldingsWire";
import { Watchlist } from "./Watchlist";

function SetupNote() {
  return (
    <div className="p-3 text-dim leading-relaxed">
      No positions loaded. Run <span className="kbd text-fg">node scripts/import-positions.mjs &lt;fidelity-export.csv&gt;</span> locally, or set{" "}
      <span className="kbd text-fg">PORTFOLIO_JSON</span> in Vercel.
    </div>
  );
}

export function PortfolioBoard() {
  const { data: p, err: pErr } = usePoll<PortfolioPayload>("/api/portfolio", 60_000);
  const { data: news, err: newsErr } = usePoll<PortfolioNewsPayload>("/api/portfolio/news", 5 * 60_000);
  const [acctId, setAcctId] = useState<string | null>(null);
  const [wireSel, setWireSel] = useState<WireSel>({ mode: "auto" });

  const configured = !!p?.configured;
  const acct = (configured && acctId && p?.accounts.find((a) => a.id === acctId)) || null;

  const rows = useMemo(() => {
    if (!p?.configured) return [];
    return acct ? acct.holdings.map(fromHolding) : p.bySymbol.map(fromRollup);
  }, [p, acct]);

  const wireAccount = useMemo(
    () => (acct ? { label: acct.label, symbols: new Set(acct.holdings.map((h) => h.symbol)) } : null),
    [acct],
  );
  const held = useMemo(() => new Set(p?.configured ? p.bySymbol.map((r) => r.symbol.toUpperCase()) : []), [p]);

  // Switching accounts resets the wire to follow it; a chip click overrides.
  const selectAccount = (id: string | null) => {
    setAcctId(id);
    setWireSel({ mode: "auto" });
  };

  const now = p ? Date.parse(p.fetchedAt) : 0;
  const scope = acct ? acct.label : "All accounts";

  let main: React.ReactNode;
  if (!p) {
    main = pErr ? (
      <Panel title="Holdings"><Unavailable what="Portfolio" detail={pErr} /></Panel>
    ) : (
      <>
        <div className="grid gap-1 md:grid-cols-2 shrink-0">
          <div className="h-32 skeleton" />
          <div className="h-32 skeleton" />
        </div>
        <div className="h-96 skeleton" />
      </>
    );
  } else if (!configured) {
    main = <Panel title="Holdings"><SetupNote /></Panel>;
  } else {
    main = (
      <>
        <div className="grid gap-1 md:grid-cols-2 shrink-0">
          <Movers rows={rows} scope={scope} />
          <Allocation rows={rows} scope={scope} />
        </div>
        <Panel
          title="Holdings"
          className="xl:flex-1 xl:min-h-[320px]"
          right={`${scope} · ${rows.filter((r) => r.kind !== "cash").length} positions${pErr ? " · update failed, showing last" : ""}`}
        >
          <HoldingsTable rows={rows} now={now} />
        </Panel>
      </>
    );
  }

  return (
    <div className="xl:h-full flex flex-col">
      {p && configured ? (
        <div className="shrink-0">
          <SummaryStrip p={p} acct={acct} />
          <AccountSelector p={p} selected={acct?.id ?? null} onSelect={selectAccount} />
        </div>
      ) : (
        <div className="shrink-0 border-b border-line bg-raised px-3 py-1">
          <h1 className="text-amber font-bold tracking-widest text-[13px] uppercase">Portfolio</h1>
          {!p && !pErr && <div className="h-12 mt-1 skeleton" />}
        </div>
      )}
      <div className="xl:flex-1 xl:min-h-0 grid gap-1 p-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px_360px] xl:grid-rows-[1fr]">
        {/* Left: movers, allocation, holdings. */}
        <div className="flex flex-col gap-1 min-w-0 xl:min-h-0 xl:overflow-auto">{main}</div>

        {/* Center: news on the names held. */}
        <div className="h-[70vh] xl:h-auto xl:min-h-0 min-w-0">
          <HoldingsWire news={news} err={newsErr} sel={wireSel} setSel={setWireSel} account={wireAccount} />
        </div>

        {/* Right: candidates. */}
        <div className="min-h-[240px] xl:min-h-0 min-w-0">
          <Watchlist held={held} />
        </div>
      </div>
    </div>
  );
}
