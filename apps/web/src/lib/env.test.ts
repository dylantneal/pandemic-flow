import { describe, expect, it } from "vitest";

import { hasSupabaseConfig } from "./env";

describe("hasSupabaseConfig", () => {
  it("returns false when env vars are missing", () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    expect(hasSupabaseConfig()).toBe(false);

    if (url) process.env.NEXT_PUBLIC_SUPABASE_URL = url;
    if (key) process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = key;
  });

  it("returns true when both env vars are set", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-key";
    expect(hasSupabaseConfig()).toBe(true);
  });
});
