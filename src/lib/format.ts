export const fmtNum = (v: number | null | undefined, d = 2): string =>
  v === null || v === undefined || !Number.isFinite(v) ? "--" : v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

export const fmtPct = (v: number | null | undefined, d = 2, sign = true): string => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "--";
  const s = sign && v > 0 ? "+" : "";
  return `${s}${v.toFixed(d)}%`;
};

export const fmtSigned = (v: number | null | undefined, d = 2): string => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "--";
  return `${v > 0 ? "+" : ""}${v.toFixed(d)}`;
};

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

export const hhmm = (iso: string): string =>
  new Date(iso).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" });
