import { NextRequest, NextResponse } from "next/server";
import { searchSymbols } from "@/lib/company";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 1) return NextResponse.json({ results: [] });
  try {
    return NextResponse.json({ results: await searchSymbols(q) });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
