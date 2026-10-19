import { NextResponse } from "next/server";
import { getMarketBoard } from "@/lib/markets";

export async function GET() {
  try {
    return NextResponse.json(await getMarketBoard());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
