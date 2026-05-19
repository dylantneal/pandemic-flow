import { createClient } from "@supabase/supabase-js";

import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/env";

export function createServerClient() {
  return createClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
