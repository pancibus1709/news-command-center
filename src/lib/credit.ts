import { cached, HOUR } from "./cache";

// FRED's public CSV endpoint needs no API key. Each series is one request.
// Spreads are ICE BofA option-adjusted spreads, converted to basis points.

export type Series = {
  id: string;
  label: string;
  group: "spreads" | "rates" | "policy";
  unit: "pct" | "bp";
  freq: "d" | "w";
  /** How a credit desk reads a rise: "off" = risk-off (red), "neutral" = no color. */
  rising: "off" | "neutral";
  latest: number | null;
  latestDate: string | null;
  change1d: number | null; // null for weekly series
  change1w: number | null;
  change1m: number | null;
  points: { d: string; v: number }[]; // last ~90 observations
};

type Def = Pick<Series, "id" | "label" | "group" | "unit" | "freq" | "rising">;

const DEFS: Def[] = [
  { id: "BAMLH0A0HYM2", label: "US High Yield OAS", group: "spreads", unit: "bp", freq: "d", rising: "off" },
  { id: "BAMLC0A0CM", label: "US IG Corp OAS", group: "spreads", unit: "bp", freq: "d", rising: "off" },
  { id: "BAMLH0A3HYC", label: "CCC & Lower OAS", group: "spreads", unit: "bp", freq: "d", rising: "off" },
  { id: "BAMLC0A4CBBB", label: "BBB OAS", group: "spreads", unit: "bp", freq: "d", rising: "off" },
  { id: "BAMLEMCBPIOAS", label: "EM Corp OAS", group: "spreads", unit: "bp", freq: "d", rising: "off" },
  { id: "DGS2", label: "2Y Treasury", group: "rates", unit: "pct", freq: "d", rising: "off" },
  { id: "DGS10", label: "10Y Treasury", group: "rates", unit: "pct", freq: "d", rising: "off" },
  { id: "DGS30", label: "30Y Treasury", group: "rates", unit: "pct", freq: "d", rising: "off" },
  { id: "T10Y2Y", label: "2s10s Curve", group: "rates", unit: "pct", freq: "d", rising: "neutral" },
  { id: "T10YIE", label: "10Y Breakeven", group: "rates", unit: "pct", freq: "d", rising: "neutral" },
  { id: "DFF", label: "Effective Fed Funds", group: "policy", unit: "pct", freq: "d", rising: "off" },
  { id: "SOFR", label: "SOFR", group: "policy", unit: "pct", freq: "d", rising: "off" },
  { id: "MORTGAGE30US", label: "30Y Mortgage (weekly)", group: "policy", unit: "pct", freq: "w", rising: "off" },
];

async function fetchSeries(def: Def): Promise<Series> {
  const empty: Series = { ...def, latest: null, latestDate: null, change1d: null, change1w: null, change1m: null, points: [] };
  try {
    const since = new Date(Date.now() - 200 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const res = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${def.id}&cosd=${since}`, {
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return empty;
    const text = await res.text();
    const rows = text
      .trim()
      .split("\n")
      .slice(1)
      .map((l) => l.split(","))
      .filter((r) => r[1] && r[1] !== ".")
      .map((r) => ({ d: r[0], v: def.unit === "bp" ? Math.round(parseFloat(r[1]) * 100) : parseFloat(r[1]) }));
    if (rows.length === 0) return empty;

    const lastRow = rows[rows.length - 1];
    const at = (daysBack: number) => {
      const target = new Date(lastRow.d).getTime() - daysBack * 24 * 3600 * 1000;
      // Nearest observation at or before target.
      for (let i = rows.length - 1; i >= 0; i--) if (new Date(rows[i].d).getTime() <= target) return rows[i].v;
      return null;
    };
    const prev = rows.length > 1 ? rows[rows.length - 2].v : null;
    const delta = (a: number | null) => (a === null ? null : +(lastRow.v - a).toFixed(def.unit === "bp" ? 0 : 2));

    return {
      ...def,
      latest: lastRow.v,
      latestDate: lastRow.d,
      change1d: def.freq === "d" ? delta(prev) : null,
      change1w: delta(at(7)),
      change1m: delta(at(30)),
      points: rows.slice(-90),
    };
  } catch {
    return empty;
  }
}

export async function getCreditBoard(): Promise<{ series: Series[]; fetchedAt: string; latestObs: string | null }> {
  return cached("credit:board", HOUR, async () => {
    const series = await Promise.all(DEFS.map(fetchSeries));
    const dates = series.map((s) => s.latestDate).filter((d): d is string => Boolean(d));
    return {
      series,
      fetchedAt: new Date().toISOString(),
      latestObs: dates.length ? dates.sort().at(-1)! : null,
    };
  });
}
