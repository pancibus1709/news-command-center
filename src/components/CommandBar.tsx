"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Hit = { symbol: string; name: string; exchange: string | null; type: string | null };

export function CommandBar() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const [clock, setClock] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("en-US", { hour12: false, timeZone: "America/New_York" }) + " ET");
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  // "/" focuses the bar from anywhere, like a terminal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      if (q.trim().length < 2) {
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

  const go = (sym: string) => {
    setOpen(false);
    setQ("");
    router.push(`/company/${encodeURIComponent(sym)}`);
  };

  return (
    <header className="flex items-center gap-3 border-b border-line bg-raised px-3 h-9 shrink-0">
      <Link href="/" className="text-amber font-bold tracking-widest text-[13px] whitespace-nowrap">
        NCC<span className="text-dim font-normal">/TERMINAL</span>
      </Link>
      <nav className="hidden sm:flex gap-4 text-[11px] text-dim uppercase tracking-wider">
        <Link href="/" className="hover:text-fg">Board</Link>
        <Link href="/#credit" className="hover:text-fg">Credit</Link>
        <Link href="/#news" className="hover:text-fg">Wire</Link>
        <Link href="/portfolio" className="hover:text-fg">Portfolio</Link>
      </nav>
      <div className="relative flex-1 min-w-[140px] max-w-xl">
        <input
          ref={ref}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => hits.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setSel((s) => Math.min(s + 1, hits.length - 1));
            else if (e.key === "ArrowUp") setSel((s) => Math.max(s - 1, 0));
            else if (e.key === "Enter") {
              if (hits[sel]) go(hits[sel].symbol);
              else if (q.trim()) go(q.trim().toUpperCase());
            } else if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Ticker or company name <GO>"
          className="w-full h-6 text-[12px] uppercase placeholder:normal-case placeholder:text-mute"
          spellCheck={false}
          autoComplete="off"
        />
        {open && hits.length > 0 && (
          <ul className="absolute left-0 right-0 top-7 z-50 border border-line-strong bg-panel shadow-xl">
            {hits.map((h, i) => (
              <li
                key={h.symbol}
                onMouseDown={() => go(h.symbol)}
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
      <span className="text-[10px] text-mute hidden md:inline">
        <span className="kbd">/</span> search
      </span>
      <span className="ml-auto text-[11px] text-dim whitespace-nowrap hidden sm:inline" suppressHydrationWarning>{clock}</span>
    </header>
  );
}
