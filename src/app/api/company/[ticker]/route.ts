import { NextResponse } from "next/server";
import { getCompany } from "@/lib/company";

export async function GET(_req: Request, ctx: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await ctx.params;
  try {
    const profile = await getCompany(ticker);
    if (!profile) return NextResponse.json({ error: `No data for ${ticker}` }, { status: 404 });
    return NextResponse.json(profile);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
