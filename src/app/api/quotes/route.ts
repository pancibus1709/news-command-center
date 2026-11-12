import { NextResponse, type NextRequest } from "next/server";
import { getWatchQuotes } from "@/lib/portfolio";

export async function GET(request: NextRequest) {
  const symbols = (request.nextUrl.searchParams.get("symbols") ?? "").split(",").filter(Boolean);
  try {
    return NextResponse.json(await getWatchQuotes(symbols));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
