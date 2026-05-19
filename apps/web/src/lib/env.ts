function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getSupabaseUrl(): string {
  return requireEnv("NEXT_PUBLIC_SUPABASE_URL");
}

export function getSupabasePublishableKey(): string {
  return requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
}

export function hasSupabaseConfig(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
