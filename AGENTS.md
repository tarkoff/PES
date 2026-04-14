# AGENTS.md — PES2 Data.gov.ua Dataset Manager

## Setup

```bash
# Infrastructure (PostgreSQL + Redis)
docker-compose up -d

# Server setup
cd server
cp .env.example .env
npm install
npx prisma generate
npx prisma db push
npm run seed    # Creates default admin: admin/admin

# Client setup
cd ../client
npm install
```

## Development Commands

| Service | Command | Port |
|---------|---------|------|
| Server (dev) | `cd server && npm run start:dev` | 3000 |
| Client (dev) | `cd client && npm run dev` | 5173 |
| Server tests | `cd server && npm test` | — |
| Client tests | `cd client && npm test` | — |
| E2E tests | `cd client && npm run test:e2e` | — |

## Architecture

- **Monorepo**: `client/` (React 19 + Vite + TailwindCSS) + `server/` (NestJS 11 + Prisma)
- **API prefix**: All backend endpoints use `/api` prefix
- **Async imports**: BullMQ queue + Redis (stream parsing for CSV/JSON/XML/XLSX)
- **Auth**: JWT + Passport (Local, Google OAuth, Facebook OAuth)

## Key Entrypoints

- Server: `server/src/main.ts` (bootstrap, Swagger at `/api/docs`)
- Client: `client/src/main.tsx` + `client/src/App.tsx`
- Parsers: `server/src/import/parsers/` (batch size: 250 rows)
- Auth strategies: `server/src/auth/strategies/`

## Database

- PostgreSQL 18 with JSONB for dataset records
- Schema: `server/prisma/schema.prisma`
- After schema changes: `npx prisma generate && npx prisma db push`

## Important Quirks

- Default admin credentials: `admin` / `admin` (run `npm run seed`)
- Frontend API baseURL proxied to `http://localhost:3000/api`
- OAuth callbacks: `/auth/google/callback`, `/auth/facebook/callback`
- Import jobs are async (BullMQ) — frontend polls for status every 5s

## Testing

- Backend: Jest (`.spec.ts` files in `server/src/`)
- Frontend: Vitest (`.test.tsx` files)
- E2E: Playwright (`client/e2e/`)
