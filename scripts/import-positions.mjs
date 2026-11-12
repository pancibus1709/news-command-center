#!/usr/bin/env node
// Fidelity "Portfolio_Positions" CSV -> data/portfolio.json (gitignored).
// Usage: node scripts/import-positions.mjs <export.csv> [owner]
// Account numbers are dropped on purpose; only the account label is kept.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [, , csvPath, owner = "Portfolio"] = process.argv;
if (!csvPath) {
  console.error("usage: node scripts/import-positions.mjs <export.csv> [owner]");
  process.exit(1);
}

// Clean names for display and news search. Anything not listed falls back to
// the broker description in title case.
const NAMES = {
  AMD: "Advanced Micro Devices", GOOG: "Alphabet", GOOGL: "Alphabet", OSCR: "Oscar Health", PLTR: "Palantir",
  SPCX: "SpaceX", TSM: "Taiwan Semiconductor", TXN: "Texas Instruments", NFLX: "Netflix", IONQ: "IonQ",
  META: "Meta Platforms", AMZN: "Amazon", MU: "Micron Technology", AAPL: "Apple", MSFT: "Microsoft",
  QCOM: "Qualcomm", FCX: "Freeport-McMoRan", URNM: "Sprott Uranium Miners ETF", BABA: "Alibaba",
  HOOD: "Robinhood", AVGO: "Broadcom", SHOP: "Shopify", RDDT: "Reddit", INTC: "Intel",
  FXAIX: "Fidelity 500 Index", FDFIX: "Fidelity Flex 500 Index", FITFX: "Fidelity Flex International Index",
  FLAPX: "Fidelity Flex Mid Cap Index", FLXSX: "Fidelity Flex Small Cap Index",
  FXLCX: "Fidelity Flex Large Cap Focused Index", FXINX: "Fidelity Flex International Focused Index",
};
const ETFS = new Set(["URNM"]);

const ACCOUNTS = [
  { match: /roth/i, id: "roth", label: "Roth IRA" },
  { match: /fidelity go/i, id: "go", label: "Fidelity Go", note: "Robo-managed index funds" },
  { match: /individual/i, id: "individual", label: "Individual (TOD)" },
];

function parseLine(line) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (c === "," && !q) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}
const num = (s) => {
  if (!s) return null;
  const v = parseFloat(s.replace(/[$,%+]/g, ""));
  return Number.isFinite(v) ? v : null;
};
const title = (s) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

const text = readFileSync(csvPath, "utf8").replace(/^﻿/, "");
const lines = text.split(/\r?\n/);
const header = parseLine(lines[0]);
const col = (name) => header.indexOf(name);
const need = ["Account name", "Symbol", "Description", "Quantity", "Last price", "Current value", "Cost basis total"];
for (const n of need) if (col(n) < 0) throw new Error(`CSV is missing the "${n}" column`);

const accounts = new Map();
const positions = [];
for (const line of lines.slice(1)) {
  const r = parseLine(line);
  if (r.length < header.length - 1 || !r[col("Symbol")]) continue;
  const acctName = r[col("Account name")];
  const acct = ACCOUNTS.find((a) => a.match.test(acctName)) ?? { id: acctName.toLowerCase().replace(/[^a-z0-9]+/g, "-"), label: acctName };
  accounts.set(acct.id, { id: acct.id, label: acct.label, ...(acct.note ? { note: acct.note } : {}) });

  const rawSym = r[col("Symbol")];
  const isCash = rawSym.endsWith("**");
  const symbol = rawSym.replace(/\*+$/, "");
  const quantity = num(r[col("Quantity")]);
  positions.push({
    account: acct.id,
    symbol,
    name: isCash ? "Cash (money market)" : NAMES[symbol] ?? title(r[col("Description")]),
    // Fidelity mutual fund tickers are five letters ending in X.
    kind: isCash ? "cash" : ETFS.has(symbol) ? "etf" : /^[A-Z]{4}X$/.test(symbol) ? "fund" : "stock",
    quantity: isCash ? null : quantity,
    costBasis: isCash ? null : num(r[col("Cost basis total")]),
    snapPrice: isCash ? null : num(r[col("Last price")]),
    snapValue: num(r[col("Current value")]) ?? 0,
  });
}

const stamp = text.match(/Date downloaded (\w{3})-(\d{1,2})-(\d{4}) (\d{1,2}):(\d{2}) ([ap])\.m/i);
let asOf = new Date().toISOString();
if (stamp) {
  const [, mon, d, y, h, m, ap] = stamp;
  const hour = (parseInt(h, 10) % 12) + (ap.toLowerCase() === "p" ? 12 : 0);
  const month = "JanFebMarAprMayJunJulAugSepOctNovDec".indexOf(mon) / 3 + 1;
  // Fidelity stamps Eastern time; -05:00 is close enough for a snapshot label.
  asOf = new Date(`${y}-${String(month).padStart(2, "0")}-${d.padStart(2, "0")}T${String(hour).padStart(2, "0")}:${m}:00-05:00`).toISOString();
}

const out = { owner, asOf, source: "Fidelity positions export", accounts: [...accounts.values()], positions };
const dest = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "portfolio.json");
mkdirSync(path.dirname(dest), { recursive: true });
writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
const total = positions.reduce((s, p) => s + p.snapValue, 0);
console.log(`Wrote ${positions.length} positions across ${accounts.size} accounts ($${total.toFixed(2)}) to data/portfolio.json`);
