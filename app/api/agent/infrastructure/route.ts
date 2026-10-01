import { NextResponse } from "next/server";
import { readPublicInfrastructureStatus } from "@/app/queries/discovery";

export async function GET() {
  return NextResponse.json(await readPublicInfrastructureStatus(), { headers: { "Cache-Control": "no-store" } });
}
