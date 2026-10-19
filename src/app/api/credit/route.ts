import { NextResponse } from "next/server";
import { getCreditBoard } from "@/lib/credit";

export async function GET() {
  return NextResponse.json(await getCreditBoard());
}
