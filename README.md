# Pandemic Flow

A web-based COVID wastewater dynamics platform. Phase 1 provides the application shell, Supabase foundation, CI, and deployment wiring.

## Monorepo layout

```text
apps/web/                 Next.js dashboard
packages/database/        Supabase config and migrations
docs/                     Research and architecture notes
```

## Links

- **Live app:** https://web-five-sandy-7ewgvhnvpx.vercel.app
- **GitHub:** https://github.com/dylantneal/pandemic-flow

## Prerequisites

- Node.js 20+
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- Docker with sufficient disk space (for local Supabase)

## Quick start

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local
# Fill in Supabase URL and publishable key

# Start local Supabase (from repo root)
npm run db:start

# Run the web app
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

If `npm run db:start` fails with **no space left on device**, free Docker disk space (`docker system prune`) and retry.

For production, create a [Supabase cloud](https://supabase.com) project, run `supabase db push --workdir packages/database`, and set env vars in Vercel (see [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)).

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check |
| `npm run test` | Unit tests |
| `npm run db:start` | Start local Supabase |
| `npm run db:stop` | Stop local Supabase |
| `npm run db:reset` | Reset local DB and apply migrations |

## Documentation

Research and architecture documents live in [`docs/`](docs/).

## License

Private / portfolio project.
