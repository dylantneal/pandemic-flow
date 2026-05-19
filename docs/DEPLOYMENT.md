# Deployment

## Vercel

**Production:** https://web-five-sandy-7ewgvhnvpx.vercel.app  
**GitHub:** https://github.com/dylantneal/pandemic-flow

The project is linked to Vercel with Git push deploys. Root deployment uses the repository root with [`vercel.json`](../vercel.json) (builds `apps/web` via npm workspaces).

1. Import or use the existing Vercel project `web` (or rename to `pandemic-flow`).
2. Ensure **Root Directory** is the repository root (`.`). Do not set `apps/web` unless you adjust install/build commands.
3. Framework preset: **Next.js** (auto-detected).
4. Add environment variables for **Production** and **Preview**:

| Variable | Notes |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Anon / publishable key (browser-safe) |
| `NEXT_PUBLIC_APP_URL` | e.g. `https://your-app.vercel.app` |

5. Enable **Deploy on push** for the `main` branch.

The included [`apps/web/vercel.json`](../apps/web/vercel.json) runs install/build from the monorepo root when needed.

## Supabase cloud

1. Create a project at [supabase.com](https://supabase.com).
2. Link the CLI: `supabase link --workdir packages/database`
3. Push migrations: `supabase db push --workdir packages/database`
4. Copy project URL and anon key into Vercel env vars.

## Local Supabase

Requires Docker with sufficient disk space.

```bash
npm run db:start
npm run db:reset   # apply migrations
```

Default local keys are documented in [`.env.example`](../.env.example).
