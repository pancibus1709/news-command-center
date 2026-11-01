import { NextRequest, NextResponse } from "next/server";
import { getAllNews, rankItems } from "@/lib/news";
import type { Category } from "@/lib/feeds";

/**
 * GET /api/news?category=credit&sort=ranked|latest&limit=200
 * Default is the ranked view: weight x topic boost x time decay, with no
 * publisher above ten percent of the list. `sort=latest` is pure time order.
 * Feeds marked hideFromAll are excluded unless their own category is asked for.
 */
export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get("category") as Category | null;
  const sort = req.nextUrl.searchParams.get("sort") === "latest" ? "latest" : "ranked";
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "200", 10), 500);
  const { items, status, fetchedAt } = await getAllNews();

  let pool = items;
  if (category) pool = pool.filter((i) => i.category === category || i.tags.includes(category));
  else pool = pool.filter((i) => !i.hideFromAll);

  const out = sort === "ranked" ? rankItems(pool, limit) : pool.slice(0, limit);
  return NextResponse.json({ items: out, status, fetchedAt, total: pool.length, sort });
}
