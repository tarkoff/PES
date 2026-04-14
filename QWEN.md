# QWEN.md — PES2 Data.gov.ua Dataset Manager

## Project Overview

**PES2** is a full-stack web application for importing, managing, and viewing open government datasets from [data.gov.ua](https://data.gov.ua), Ukraine's open data portal. It provides a complete pipeline for dataset discovery (via CKAN API), asynchronous import (CSV/JSON/XML/XLSX with streaming parsers), role-based access control, and a modern React-based UI for data viewing and administration.

### Architecture

- **Monorepo** structure with `client/` (React 19 + Vite + TailwindCSS) and `server/` (NestJS 11 + Prisma ORM)
- **Database**: PostgreSQL 18 with JSONB for flexible schema-less dataset records
- **Queue System**: Redis + BullMQ for async background import jobs (handles large files >1GB via streaming)
- **Authentication**: JWT tokens + Passport.js strategies (Local, Google OAuth 2.0, Facebook OAuth 2.0)
- **API**: REST API with `/api` prefix, Swagger docs at `/api/docs`

### Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19, TypeScript, Vite, TailwindCSS, Framer Motion, React Router 6, Lucide React |
| **Backend** | NestJS 11, TypeScript, Prisma ORM, Passport.js, BullMQ |
| **Database** | PostgreSQL 18 (JSONB storage) |
| **Queue** | Redis 8 + BullMQ |
| **Testing** | Jest (backend), Vitest + Testing Library (frontend), Playwright (E2E) |
| **Containerization** | Docker + Docker Compose, Nginx (prod frontend) |

## Building and Running

### Prerequisites

- Node.js (LTS recommended)
- Docker + Docker Compose

### Development Setup

```bash
# 1. Start infrastructure (PostgreSQL + Redis)
docker-compose up -d

# 2. Setup server
cd server
cp .env.example .env
npm install
npx prisma generate
npx prisma db push
npm run seed    # Creates default admin user (admin/admin)
npm run start:dev   # Runs on port 3000

# 3. Setup client (in a new terminal)
cd client
npm install
npm run dev     # Runs on port 5173
```

### Production Deployment

```bash
docker-compose -f docker-compose.prod.yml up -d
```

This builds and runs the full stack: PostgreSQL, Redis, NestJS server, and Nginx-served React frontend.

### Key Commands

| Task | Command |
|------|---------|
| Server dev | `cd server && npm run start:dev` |
| Server build | `cd server && npm run build` |
| Server prod | `cd server && npm run start:prod` |
| Server tests | `cd server && npm test` |
| Server E2E tests | `cd server && npm run test:e2e` |
| Server lint | `cd server && npm run lint` |
| Server format | `cd server && npm run format` |
| Server seed | `cd server && npm run seed` |
| Client dev | `cd client && npm run dev` |
| Client build | `cd client && npm run build` |
| Client tests | `cd client && npm run test` |
| Client E2E tests | `cd client && npm run test:e2e` |
| Client E2E UI | `cd client && npm run test:e2e:ui` |
| Client lint | `cd client && npm run lint` |
| DB migration | `cd server && npx prisma migrate dev` |
| DB push (dev) | `cd server && npx prisma db push` |
| DB generate client | `cd server && npx prisma generate` |

## Project Structure

### Server (`server/src/`)

```
src/
├── main.ts                    # Bootstrap, Swagger setup, health check
├── app.module.ts              # Root module (ConfigModule, BullModule, etc.)
├── app.controller.ts          # GET /api/health
│
├── auth/                      # Authentication module
│   ├── auth.controller.ts     # POST /api/auth/{register,login}, GET /api/auth/profile
│   ├── auth.service.ts        # User registration, login, OAuth handling
│   ├── oauth.controller.ts    # OAuth redirect & callback handlers
│   ├── dto/auth.dto.ts        # RegisterDto, LoginDto (class-validator)
│   └── strategies/
│       ├── local.strategy.ts
│       ├── jwt.strategy.ts
│       ├── google.strategy.ts
│       └── facebook.strategy.ts
│
├── dataset/                   # Dataset CRUD and management
│   ├── dataset.controller.ts  # CRUD endpoints, stats, records, search
│   ├── dataset.service.ts     # Business logic
│   └── dataset.module.ts
│
├── import/                    # Async data import pipeline
│   ├── import.service.ts      # Triggers import (creates ImportJob + adds to BullMQ)
│   ├── import.processor.ts    # BullMQ worker (download → extract → parse)
│   ├── import.module.ts
│   └── parsers/               # Stream parsers (batch size: 250 rows)
│       ├── csv.parser.ts      # csv-parser
│       ├── json.parser.ts     # stream-json / JSONStream
│       ├── xml.parser.ts      # sax (SAX streaming)
│       └── xlsx.parser.ts     # exceljs
│
├── data-gov/                  # CKAN API integration (data.gov.ua)
│   ├── data-gov.service.ts    # HTTP proxy to https://data.gov.ua/api/3/action/
│   └── data-gov.module.ts
│
└── prisma/
    ├── prisma.service.ts      # PrismaService wrapper
    ├── prisma.module.ts
    ├── schema.prisma          # Database schema
    └── seed.ts                # Seed script (creates admin user)
```

### Client (`client/src/`)

```
src/
├── main.tsx                   # React 19 entry point
├── App.tsx                    # Router + Layout (Sidebar + Header)
│
├── context/
│   └── AuthContext.tsx        # Auth state management (login, register, logout)
│
├── api/
│   ├── client.ts              # Axios instance (baseURL: /api)
│   └── auth.ts                # Auth API functions
│
├── components/
│   ├── Sidebar.tsx            # Navigation sidebar
│   ├── ProtectedRoute.tsx     # Auth guard with role checking
│   └── UserMenu.tsx           # User dropdown + logout
│
└── pages/
    ├── Dashboard.tsx          # Stats dashboard (5s polling)
    ├── Datasets.tsx           # Dataset list, CKAN search, add/edit, import trigger
    ├── DataViewer.tsx         # Paginated table with field config (drag-drop reorder)
    └── auth/
        ├── Login.tsx          # Email/password + Google/Facebook OAuth
        ├── Register.tsx       # Registration form
        └── AuthCallback.tsx   # OAuth callback handler
```

## Database Schema

```
User
├── id (UUID, PK)
├── email (unique)
├── password (hashed, nullable for OAuth)
├── first_name, last_name
├── avatar_url
├── provider (local/google/facebook)
├── provider_id (unique)
├── role (admin/user)
├── is_active
└── created_at, updated_at

Dataset
├── id (UUID, PK)
├── name
├── resource_url
├── format (CSV/JSON/XML/XLSX)
├── struct_config (JSONB)     # XPath roots, sheet names, etc.
├── field_config (JSONB)      # { fieldCode: { displayName, visible, order } }
├── auto_sync
├── cron_schedule
└── created_at

ImportJob
├── id (UUID, PK)
├── dataset_id (FK → Dataset)
├── status (PENDING/DOWNLOADING/PROCESSING/COMPLETED/FAILED)
├── total_rows, success_rows, error_rows
├── started_at, completed_at

DatasetRecord
├── id (UUID, PK)
├── import_job_id (FK → ImportJob)
├── dataset_id (FK → Dataset)
├── data (JSONB)              # Actual row data
└── created_at

ImportError
├── id (UUID, PK)
├── import_job_id (FK → ImportJob)
├── row_index
├── raw_data (JSONB)
└── error_message
```

## Import Flow

1. User adds dataset (via CKAN search or direct URL)
2. `POST /api/datasets/:id/import` triggers import
3. Backend creates `ImportJob` (status: PENDING) and enqueues to BullMQ
4. BullMQ worker picks up job:
   - Validates URL → DOWNLOADING
   - Deletes previous dataset records (full replace strategy)
   - Downloads file via HTTP stream
   - Detects format (CSV/JSON/XML/XLSX) or extracts ZIP
   - Parses stream in batches of 250 rows
   - Bulk inserts into `DatasetRecord` (JSONB)
   - Logs errors to `ImportError` table
5. Job status → COMPLETED / FAILED
6. Frontend polls `GET /api/datasets` every 5s for live status updates

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/auth/register` | ❌ | Register new user |
| `POST` | `/api/auth/login` | ❌ | Login with email/password |
| `GET` | `/api/auth/profile` | ✅ | Get current user profile |
| `GET` | `/api/auth/google` | ❌ | Google OAuth redirect |
| `GET` | `/api/auth/facebook` | ❌ | Facebook OAuth redirect |
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

## Default Credentials

After running `npm run seed` in the server directory:

- **Email**: `admin`
- **Password**: `admin`
- **Role**: `admin`

## User Roles

| Role | Access |
|------|--------|
| **admin** | Full access: dataset management, user management, admin dashboard |
| **user** | Basic authenticated access, public dataset viewing |

## Key URLs

- **Frontend (dev)**: http://localhost:5173
- **Backend API**: http://localhost:3000
- **Swagger Docs**: http://localhost:3000/api/docs
- **Admin Dashboard**: http://localhost:5173/admin/dashboard
- **Public Home**: http://localhost:5173

## Testing

### Backend (Jest)

Test files: `server/src/**/*.spec.ts`

```bash
cd server && npm test           # Run all tests
cd server && npm run test:watch # Watch mode
cd server && npm run test:cov   # Coverage report
cd server && npm run test:e2e   # E2E tests
```

### Frontend (Vitest)

Test files: `client/src/**/*.test.tsx`

```bash
cd client && npm run test        # Run all tests
cd client && npm run test:run    # Run once (CI mode)
cd client && npm run test:coverage  # Coverage report
```

### E2E (Playwright)

Test files: `client/e2e/**/*.spec.ts`

```bash
cd client && npm run test:e2e      # Run all E2E tests
cd client && npm run test:e2e:ui   # Playwright UI
cd client && npm run test:e2e:report # Show report
```

## Development Conventions

- **Backend**: TypeScript with strict mode, class-validator for DTOs, NestJS module pattern
- **Frontend**: TypeScript, functional components with hooks, React Router for navigation, TailwindCSS for styling
- **Testing**: Backend uses Jest with `*.spec.ts` convention; Frontend uses Vitest with `*.test.tsx` convention
- **Database**: Prisma ORM — always run `npx prisma generate && npx prisma db push` after schema changes
- **Code Style**: Prettier (both client and server), ESLint for linting
- **Import Parsers**: Stream-based processing with batch size of 250 rows to handle large files efficiently

## Active Skills

This project has the following Qwen Code skills activated:

| Category | Skills |
|----------|--------|
| **Frontend** | react-expert, typescript-pro, javascript-pro, playwright-expert |
| **Backend** | nestjs-expert, api-designer, fullstack-guardian, node.js |
| **Database** | postgres-pro, sql-pro, database-optimizer |
| **Architecture** | architecture-designer, microservices-architect |
| **Quality** | code-reviewer, security-reviewer, secure-code-guardian, test-master |
| **Ops** | debugging-wizard, devops-engineer, monitoring-expert |
| **Process** | feature-forge, code-documenter, spec-miner, prompt-engineer, the-fool |
