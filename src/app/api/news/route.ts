import { NextRequest, NextResponse } from "next/server";
import { getAllNews } from "@/lib/news";
import type { Category } from "@/lib/feeds";

export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get("category") as Category | null;
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "200", 10), 500);
  const { items, status, fetchedAt } = await getAllNews();
  const filtered = category ? items.filter((i) => i.tags.includes(category)) : items;
  return NextResponse.json({ items: filtered.slice(0, limit), status, fetchedAt, total: filtered.length });
}
