import { hasSupabaseConfig } from "@/lib/env";
import { createServerClient } from "@/lib/supabase/server";

import type { SupabaseHealth } from "@/components/dashboard/status-card";

export async function checkSupabaseHealth(): Promise<SupabaseHealth> {
  if (!hasSupabaseConfig()) {
    return {
      configured: false,
      connected: false,
      error: "Supabase environment variables are not set.",
    };
  }

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("app_status")
      .select("environment, message")
      .eq("id", "default")
      .maybeSingle();

    if (error) {
      return {
        configured: true,
        connected: false,
        error: error.message,
      };
    }

    return {
      configured: true,
      connected: true,
      message: data?.message ?? "Connected to Supabase",
      environment: data?.environment ?? "unknown",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return {
      configured: true,
      connected: false,
      error: message,
    };
  }
}
