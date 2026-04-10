# PES2 — Data.gov.ua Dataset Manager

> Full-stack application for importing, managing, and viewing open government datasets from data.gov.ua

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT (React 19)                     │
│  Vite + TypeScript + TailwindCSS + Framer Motion + React Router │
│  Port: 5173 (dev) / 80 (prod)                               │
├─────────────────────────────────────────────────────────────┤
│  Pages: Dashboard | Datasets | DataViewer | Login | Register │
│  Context: AuthContext (JWT token management)                 │
│  API Client: Axios with baseURL → http://localhost:3000/api  │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP (Axios)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                      SERVER (NestJS 11)                      │
│  Port: 3000 · Global prefix: /api · Swagger: /api/docs      │
├──────────────┬──────────────┬───────────────┬───────────────┤
│  AuthModule  │ DatasetModule│ ImportModule  │ DataGovModule │
│              │              │               │               │
│  - Register  │ - CRUD       │ - BullMQ      │ - CKAN API    │
│  - Login     │ - Search     │   Queue       │   proxy       │
│  - OAuth     │ - Stats      │ - Worker      │               │
│  - JWT Guard │ - Records    │ - Parsers:    │               │
│              │              │   CSV/JSON/   │               │
│              │              │   XML/XLSX    │               │
└──────┬───────┴──────┬───────┴───────┬───────┴───────────────┘
       │              │               │
       ▼              ▼               ▼
  ┌─────────┐   ┌──────────┐   ┌──────────┐
  │PostgreSQL│   │  Redis   │   │data.gov.ua│
  │  :5432   │   │  :6379   │   │  (ext)    │
  └─────────┘   └──────────┘   └──────────┘
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19, TypeScript, Vite, TailwindCSS, Framer Motion, React Router 6 |
| **Backend** | NestJS 11, TypeScript, Prisma ORM |
| **Database** | PostgreSQL 18 (JSONB storage for dataset records) |
| **Queue** | Redis + BullMQ (async dataset imports) |
| **Auth** | JWT + Passport (Local, Google OAuth, Facebook OAuth) |
| **API Docs** | Swagger/OpenAPI (`/api/docs`) |
| **Testing** | Jest (backend), Vitest + Testing Library (frontend), Playwright (E2E) |
| **Containerization** | Docker + Docker Compose |

## Database Schema

```
User ─────────────────────┐
  id (PK)                 │
  email                   │
  password (hashed)       │
  provider                │
  first_name, last_name   │
                          │
Dataset ──────────────────┼──────────────────┐
  id (PK)                 │                  │
  name                    │                  │
  resource_url            │                  │
  format (CSV/JSON/XML)   │                  │
  struct_config (JSONB)   │                  │
  field_config (JSONB)    │                  │
                          │                  │
ImportJob ────────────────┼──────────────────┤
  id (PK)                 │                  │
  dataset_id (FK) ────────┘                  │
  status (enum)                              │
  total_rows, success_rows, error_rows       │
                                             │
DatasetRecord ───────────────────────────────┘
  id (PK)
  dataset_id (FK) → Dataset.id
  data (JSONB) — actual row data
  row_index

ImportError
  id (PK)
  job_id (FK) → ImportJob.id
  row_index
  error_message
```

## Module Structure

### Server (`server/src/`)

```
src/
├── main.ts                    # Bootstrap + Swagger + Health check
├── app.module.ts              # Root module (Config, BullMQ, Prisma, etc.)
├── app.controller.ts          # GET / health check
│
├── auth/                      # Authentication
│   ├── auth.controller.ts     # POST /api/auth/{register,login}, GET /api/auth/profile
│   ├── auth.service.ts        # User registration, login, OAuth handling
│   ├── oauth.controller.ts    # OAuth redirect & callback handlers
│   ├── dto/auth.dto.ts        # RegisterDto, LoginDto (class-validator + Swagger)
│   └── strategies/            # Passport strategies
│       ├── local.strategy.ts  # Email/password authentication
│       ├── jwt.strategy.ts    # JWT token validation
│       ├── google.strategy.ts # Google OAuth 2.0
│       └── facebook.strategy.ts # Facebook OAuth 2.0
│
├── dataset/                   # Dataset management
│   ├── dataset.controller.ts  # CRUD, stats, records, search
│   ├── dataset.service.ts     # Business logic for datasets
│   └── dataset.module.ts
│
├── import/                    # Async data import
│   ├── import.service.ts      # Trigger import (creates job + adds to queue)
│   ├── import.processor.ts    # BullMQ worker (download → extract → parse)
│   ├── import.module.ts
│   └── parsers/               # Stream parsers (batch size: 250 rows)
│       ├── csv.parser.ts
│       ├── json.parser.ts
│       ├── xml.parser.ts      # Uses SAX for streaming XML parsing
│       └── xlsx.parser.ts     # Uses ExcelJS
│
├── data-gov/                  # CKAN integration
│   ├── data-gov.service.ts    # HTTP calls to https://data.gov.ua/api/3/action/
│   └── data-gov.module.ts
│
└── prisma/                    # Database layer
    ├── prisma.service.ts      # PrismaClient wrapper
    └── prisma.module.ts
```

### Client (`client/src/`)

```
src/
├── main.tsx                   # React 19 entry point
├── App.tsx                    # Routing + Layout (Sidebar + Header)
│
├── context/
│   └── AuthContext.tsx        # Auth state (login, register, logout, token)
│
├── api/
│   ├── client.ts              # Axios instance (baseURL: /api)
│   └── auth.ts                # Auth API functions
│
├── components/
│   ├── Sidebar.tsx            # Navigation sidebar
│   ├── ProtectedRoute.tsx     # Auth guard (redirects to /login)
│   └── UserMenu.tsx           # User dropdown + logout
│
└── pages/
    ├── Dashboard.tsx          # Stats with 5s polling
    ├── Datasets.tsx           # Dataset list, CKAN search, add/edit, trigger import
    ├── DataViewer.tsx         # Paginated table with field config (drag-drop reorder)
    └── auth/
        ├── Login.tsx          # Email/password + Google/Facebook OAuth
        ├── Register.tsx       # Registration form
        └── AuthCallback.tsx   # OAuth callback handler
```

## Key Data Flows

### Dataset Import Flow

```
1. User adds dataset (CKAN search or direct URL)
         │
2. POST /api/datasets/:id/import
         │
3. DatasetService.triggerImport()
   ├── Creates ImportJob record (status: PENDING)
   └── Adds job to BullMQ "import-queue"
         │
4. ImportProcessor (BullMQ Worker) picks up job
   ├── Validates URL
   ├── Updates job status → DOWNLOADING
   ├── Deletes previous dataset records (full replace)
   ├── Downloads file via HTTP stream
   ├── Updates job status → PROCESSING
   ├── Detects format (CSV/JSON/XML/XLSX) or extracts ZIP
   └── Parses stream in batches of 250 rows
       ├── Bulk inserts into DatasetRecord table (JSONB)
       └── Logs errors to ImportError table
         │
5. Updates job status → COMPLETED / FAILED
6. Frontend polls GET /api/datasets every 5s → shows live status
```

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/auth/register` | ❌ | Register new user |
| `POST` | `/api/auth/login` | ❌ | Login with email/password |
| `GET` | `/api/auth/profile` | ✅ JWT | Get current user profile |
| `GET` | `/api/auth/google` | ❌ | Redirect to Google OAuth |
| `GET` | `/api/auth/facebook` | ❌ | Redirect to Facebook OAuth |
| `GET` | `/api/datasets` | ❌ | List all datasets |
| `GET` | `/api/datasets/stats` | ❌ | Dataset statistics |
| `GET` | `/api/datasets/:id` | ❌ | Get single dataset |
| `PATCH` | `/api/datasets/:id` | ❌ | Update dataset |
| `POST` | `/api/datasets` | ❌ | Create new dataset |
| `POST` | `/api/datasets/:id/import` | ❌ | Trigger import |
| `GET` | `/api/datasets/:id/records` | ❌ | Get paginated records |
| `GET` | `/api/datasets/search?q=` | ❌ | Search CKAN datasets |
| `GET` | `/api/health` | ❌ | Health check |
| `GET` | `/api/docs` | ❌ | Swagger UI |

## Testing Strategy

| Layer | Tool | Location | Commands |
|-------|------|----------|----------|
| **Backend Unit** | Jest | `server/src/**/*.spec.ts` | `npm test` (server) |
| **Frontend Unit** | Vitest + Testing Library | `client/src/**/*.test.tsx` | `npm run test` (client) |
| **E2E** | Playwright | `client/e2e/**/*.spec.ts` | `npm run test:e2e` (client) |

## Docker Deployment

### Development
```bash
docker-compose up -d   # PostgreSQL + Redis only
```

### Production
```bash
docker-compose -f docker-compose.prod.yml up -d   # Full stack (client + server + db + redis)
```

## Getting Started

```bash
# 1. Start infrastructure
docker-compose up -d

# 2. Setup server
cd server
cp .env.example .env   # Edit with your credentials
npm install
npx prisma generate
npx prisma db push
npm run start:dev

# 3. Setup client
cd ../client
npm install
npm run dev
```

## Active Skills

This project has the following Qwen Code skills activated:

| Category | Skills |
|----------|--------|
| **Frontend** | react-expert, typescript-pro, javascript-pro, nextjs-developer, playwright-expert |
| **Backend** | nestjs-expert, api-designer, fullstack-guardian |
| **Database** | postgres-pro, sql-pro, database-optimizer |
| **Architecture** | architecture-designer, microservices-architect |
| **Quality** | code-reviewer, security-reviewer, secure-code-guardian, test-master |
| **Ops** | debugging-wizard, devops-engineer, monitoring-expert |
| **Process** | feature-forge, code-documenter, spec-miner, prompt-engineer, the-fool |
