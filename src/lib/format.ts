export const fmtNum = (v: number | null | undefined, d = 2): string =>
  v === null || v === undefined || !Number.isFinite(v) ? "--" : v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

export const fmtPct = (v: number | null | undefined, d = 2, sign = true): string => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "--";
  const r = +v.toFixed(d);
  const s = sign && r > 0 ? "+" : "";
  return `${s}${r.toFixed(d)}%`;
};

/** Signed, rounded first so -0.004 renders as 0.00 and not -0.00. */
export const fmtSigned = (v: number | null | undefined, d = 2): string => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "--";
  const r = +v.toFixed(d);
  return `${r > 0 ? "+" : ""}${r.toFixed(d)}`;
};

/** Yield change in basis points: 0.033 (yield points) -> "+3.3bp". */
export const fmtBp = (yieldDelta: number | null | undefined, d = 1): string =>
  yieldDelta === null || yieldDelta === undefined || !Number.isFinite(yieldDelta) ? "--" : `${fmtSigned(yieldDelta * 100, d)}bp`;

/** Compact money: 1.23T, 456.7B, 12.3M. */
export const fmtMoney = (v: number | null | undefined, currency = "USD"): string => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "--";
  const sym = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : currency === "JPY" ? "¥" : `${currency} `;
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${sym}${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}${sym}${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}${sym}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}${sym}${(abs / 1e3).toFixed(0)}K`;
  return `${sign}${sym}${abs.toFixed(0)}`;
};

export const fmtInt = (v: number | null | undefined): string =>
  v === null || v === undefined || !Number.isFinite(v) ? "--" : Math.round(v).toLocaleString("en-US");

export const fmtX = (v: number | null | undefined, d = 1): string =>
  v === null || v === undefined || !Number.isFinite(v) ? "--" : `${v.toFixed(d)}x`;

export const dirClass = (v: number | null | undefined): string =>
  v === null || v === undefined || v === 0 ? "flat" : v > 0 ? "up" : "down";

export const timeAgo = (iso: string): string => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

/**
 * Freshness label for a quote panel, from the exchange state rather than a
 * hardcoded word. "live", "delayed 15m", or "close Fri Oct 30".
 */
export const freshness = (q: { state: string | null; asOf: string | null; delayMin: number | null } | undefined): string => {
  if (!q || !q.asOf) return "";
  if (q.state === "REGULAR") return q.delayMin ? `delayed ${q.delayMin}m` : "live";
  const d = new Date(q.asOf);
  const day = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York" });
  const session = q.state === "PRE" ? "pre-mkt, last close" : q.state === "POST" ? "after hours, close" : "close";
  return `${session} ${day}`;
};

/** One clock for the whole app: New York time, 24h. */
export const hhmm = (iso: string): string =>
  new Date(iso).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", timeZone: "America/New_York" }) + " ET";

/**
 * Full-precision dollars: 1234.5 -> "$1,234.50". With sign, "+$1,234.56" or
 * "-$84.31"; rounded first so a -0.004 day reads $0.00, not -$0.00.
 */
export const fmtUsd = (v: number | null | undefined, opts: { sign?: boolean; d?: number } = {}): string => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "--";
  const d = opts.d ?? 2;
  const r = +v.toFixed(d);
  const s = r < 0 ? "-" : opts.sign && r > 0 ? "+" : "";
  return `${s}$${Math.abs(r).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
};

/** Short New York calendar date: "Nov 18". */
export const shortDate = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" }) : "--";
