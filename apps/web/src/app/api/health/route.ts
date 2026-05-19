import { NextResponse } from "next/server";

import { checkSupabaseHealth } from "@/lib/supabase/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const health = await checkSupabaseHealth();

  return NextResponse.json(
    {
      status: health.connected ? "ok" : health.configured ? "degraded" : "unconfigured",
      supabase: health,
      timestamp: new Date().toISOString(),
    },
    { status: health.connected ? 200 : health.configured ? 503 : 200 },
  );
}
