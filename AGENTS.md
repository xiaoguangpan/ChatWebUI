# Repository Guidelines

## Architecture

ChatWebUI is a React/Vite frontend plus a Go API backed by PostgreSQL and Redis.

- `apps/web/`: React 18 + Vite + TypeScript application.
- `apps/api/`: Go monolith API. Entrypoint: `cmd/server/main.go`.
- `apps/api/migrations/`: PostgreSQL schema migrations.
- `docs/TECH_SELECTION.md`: fixed technical architecture and acceptance baseline.
- `docs/`: architecture, technical decisions, and product notes.

Production code must not use SQLite, in-memory stores, or frontend mock data as business data sources.

## Commands

Run from the repository root:

```bash
npm --prefix apps/web install
npm run dev:api
npm run dev:web
npm run test:api
npm run test:web
npm run build:web
```

## Frontend Style

Use React function components, TypeScript, existing CSS tokens, and lucide-react icons. Preserve the current UI direction unless a detail is clearly inconsistent with the product behavior.

## Backend Style

Use Go, PostgreSQL migrations, typed store methods, and explicit transactions for points and billing mutations. Provider API keys are encrypted in PostgreSQL and never exposed to frontend code, Vite env values, built assets, or Docker image layers.

## Testing

Backend tests use real PostgreSQL test databases. Frontend tests use Vitest. Any feature that changes an API contract, billing, authentication, model calls, or persistence requires tests.
