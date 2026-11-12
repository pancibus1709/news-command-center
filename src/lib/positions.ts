import { readFile } from "node:fs/promises";
import path from "node:path";
import { cached, MINUTE } from "./cache";
import type { PortfolioFile } from "./portfolio-types";

/**
 * Loads the private positions file. Order: PORTFOLIO_JSON env var (base64 or
 * raw JSON, for Vercel), then data/portfolio.json (local, gitignored).
 * Returns null when neither exists so callers can render a setup state.
 */
export async function loadPortfolioFile(): Promise<PortfolioFile | null> {
  return cached("portfolio:file", MINUTE, async () => {
    const env = process.env.PORTFOLIO_JSON?.trim();
    if (env) {
      const text = env.startsWith("{") ? env : Buffer.from(env, "base64").toString("utf8");
      return JSON.parse(text) as PortfolioFile;
    }
    // Hosted builds read the env var only. A stray data file in an upload
    // must never be served: the repo and the default URL are public.
    if (process.env.VERCEL) return null;
    try {
      const text = await readFile(path.join(process.cwd(), "data", "portfolio.json"), "utf8");
      return JSON.parse(text) as PortfolioFile;
    } catch {
      return null;
    }
  });
}
