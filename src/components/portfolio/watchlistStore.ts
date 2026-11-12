"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

// Watchlist symbols live in this browser only. useSyncExternalStore reads
// localStorage after hydration (the server snapshot is an empty list), so the
// first client render matches the server HTML.

const KEY = "ncc.watchlist.v1";
const EMPTY = "[]";
const listeners = new Set<() => void>();
let memory: string | null = null; // fallback when storage throws (private mode)

function read(): string {
  try {
    return window.localStorage.getItem(KEY) ?? memory ?? EMPTY;
  } catch {
    return memory ?? EMPTY;
  }
}

function write(list: string[]) {
  const raw = JSON.stringify(list);
  memory = raw;
  try {
    window.localStorage.setItem(KEY, raw);
  } catch {
    // Storage blocked: keep the in-memory copy for this session.
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) l();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

const parse = (raw: string): string[] => {
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && s.length > 0) : [];
  } catch {
    return [];
  }
};

export function useWatchlist() {
  const raw = useSyncExternalStore(subscribe, read, () => EMPTY);
  const list = useMemo(() => parse(raw), [raw]);
  const add = useCallback((sym: string) => {
    const s = sym.trim().toUpperCase();
    const cur = parse(read());
    if (!s || cur.includes(s)) return;
    write([...cur, s]);
  }, []);
  const remove = useCallback((sym: string) => write(parse(read()).filter((s) => s !== sym)), []);
  return { list, add, remove };
}
