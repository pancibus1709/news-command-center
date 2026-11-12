import { NextRequest, NextResponse } from "next/server";
import { getPortfolioNews } from "@/lib/portfolio-news";

/**
 * GET /api/portfolio/news?symbol=AMD&limit=150
 * Headlines for held stocks and ETFs, newest first. `symbol` keeps items
 * tagged with it; `symbols` always lists every covered holding.
 */
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol")?.trim().toUpperCase() || null;
  const raw = parseInt(req.nextUrl.searchParams.get("limit") ?? "150", 10);
  const limit = Math.min(Number.isFinite(raw) && raw > 0 ? raw : 150, 250);
  try {
    const { items, symbols, fetchedAt } = await getPortfolioNews();
    const pool = symbol ? items.filter((i) => i.symbols.includes(symbol)) : items;
    return NextResponse.json({ items: pool.slice(0, limit), symbols, fetchedAt, total: pool.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
