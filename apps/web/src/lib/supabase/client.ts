import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/env";

export function createClient() {
  return createSupabaseClient(getSupabaseUrl(), getSupabasePublishableKey());
}
