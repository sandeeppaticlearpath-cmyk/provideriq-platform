# ProviderIQ — Healthcare Staffing Intelligence Platform

A production-grade SaaS platform combining an ATS, provider sourcing engine, recruiter communication hub, AI recruiting assistant, and physician data intelligence database.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     FRONTEND (Next.js)                  │
│   Dashboard · Providers · Candidates · Jobs · Analytics │
│                  AI Assistant · Admin                   │
└──────────────────────────┬──────────────────────────────┘
                           │ REST + WebSocket
┌──────────────────────────▼──────────────────────────────┐
│                  BACKEND API (Node/Express)              │
│  Auth · Providers · Candidates · Jobs · AI · Analytics  │
└──────┬────────────────────────────────────┬─────────────┘
       │                                    │
┌──────▼──────┐                   ┌─────────▼──────────┐
│ PostgreSQL  │                   │   Redis + Bull     │
│  (Primary)  │                   │  (Worker Queue)    │
└─────────────┘                   └────────────────────┘
                                           │
                              ┌────────────▼───────────┐
                              │   Background Workers   │
                              │  NPI Sync · Enrichment │
                              │  License Check         │
                              └────────────────────────┘
```

---

## Project Structure

```
provideriq/
├── frontend/                    # Next.js 14 App Router
│   ├── src/
│   │   ├── app/
│   │   │   ├── dashboard/       # Analytics dashboard
│   │   │   ├── providers/       # NPI provider search
│   │   │   ├── candidates/      # Kanban pipeline
│   │   │   ├── jobs/            # Job management
│   │   │   ├── submissions/     # Submission tracking
│   │   │   ├── analytics/       # Reports
│   │   │   ├── ai-assistant/    # AI chat interface
│   │   │   └── auth/            # Login
│   │   ├── components/
│   │   │   ├── layout/          # Sidebar, AppLayout
│   │   │   ├── ui/              # Shared components
│   │   │   └── ats/             # ATS-specific components
│   │   ├── lib/
│   │   │   ├── api.js           # Axios client + interceptors
│   │   │   └── utils.js         # Utilities
│   │   └── store/
│   │       └── auth.js          # Zustand auth store
│   ├── tailwind.config.js
│   └── package.json
│
├── backend/                     # Node.js + Express API
│   ├── src/
│   │   ├── index.js             # App entry point
│   │   ├── db/
│   │   │   ├── schema.sql       # Full PostgreSQL schema
│   │   │   └── connection.js    # pg Pool
│   │   ├── routes/
│   │   │   ├── auth.js          # JWT login/refresh/logout
│   │   │   ├── providers.js     # NPI search + pipeline add
│   │   │   ├── candidates.js    # Full ATS CRUD + Kanban
│   │   │   ├── jobs.js          # Job management
│   │   │   ├── submissions.js   # Submission tracking
│   │   │   ├── analytics.js     # Dashboard metrics
│   │   │   ├── ai.js            # OpenAI integration
│   │   │   └── communications.js
│   │   ├── middleware/
│   │   │   ├── auth.js          # JWT + RBAC
│   │   │   └── errorHandler.js
│   │   ├── utils/
│   │   │   ├── logger.js        # Winston
│   │   │   └── redis.js         # ioredis client
│   │   └── workers/
│   │       └── index.js         # Bull queue setup
│   └── package.json
│
├── workers/                     # Background job workers
│   └── src/
│       ├── scrapers/
│       │   └── npiScraper.js    # NPI Registry sync
│       └── enrichment/
│           └── enrichmentWorker.js
│
├── docker-compose.yml           # Full stack orchestration
├── .env.example                 # Environment template
└── README.md
```

---

## Quick Start

### Prerequisites
- Node.js 20+
- Docker + Docker Compose
- PostgreSQL 16
- Redis 7

### 1. Clone and configure
```bash
cp .env.example .env
# Edit .env with your values
```

### 2. Start with Docker
```bash
docker-compose up -d
```

### 3. Run locally (development)
```bash
# Terminal 1 — Backend
cd backend && npm install && npm run dev

# Terminal 2 — Frontend
cd frontend && npm install && npm run dev

# Terminal 3 — Workers
cd backend && npm run workers
```

### 4. Access
- Frontend: http://localhost:3000
- API: http://localhost:4000
- Health: http://localhost:4000/health

### Default Login
- Email: `admin@provideriq.com`
- Password: `Admin123!`

---

## Key Features

### Multi-Tenant ATS
- Complete pipeline: Sourced → Contacted → Interested → Submitted → Interview → Offer → Placed
- Drag-and-drop Kanban board
- Candidate notes, activity logs, email sequences
- Role-based access: SUPER_ADMIN → ORG_ADMIN → MANAGER → RECRUITER → SOURCER
- Full tenant data isolation via PostgreSQL RLS + org_id filtering

### Global Provider Database
- NPI Registry integration (CMS API)
- 5M+ physician records
- Search by specialty, state, city, credential, board certification
- One-click add to pipeline
- Automated data enrichment workers

### AI Recruiting Assistant
- GPT-4o powered
- Generate outreach emails (initial, follow-up, offer)
- Score candidate-job fit (0–100 with grade)
- Summarize physician profiles
- Generate multi-step email sequences
- Streaming chat interface

### Analytics Dashboard
- Pipeline conversion funnel
- Submissions/placements trend charts
- Recruiter performance leaderboard
- Time-to-fill metrics
- Job-level analytics

### Communications Hub
- Email (Gmail, Outlook)
- SMS
- Click-to-call (Twilio/8x8/Dialpad)
- Microsoft Teams scheduling
- Full activity logging

---

## Security

- JWT access tokens (15min) + refresh tokens (30 days)
- bcrypt password hashing (cost factor 12)
- Row-Level Security (PostgreSQL RLS)
- Org isolation on every query
- Rate limiting (global + per-endpoint)
- Helmet security headers
- Audit logging on all mutations
- CORS whitelist

---

## Deployment

### Frontend → Vercel
```bash
cd frontend && vercel --prod
```

### Backend → AWS (ECS/EC2)
```bash
docker build -t provideriq-api ./backend
docker push <ecr-repo>/provideriq-api
# Deploy via ECS task definition or EC2
```

### Database → AWS RDS
```bash
# Apply schema to RDS PostgreSQL instance
psql $DATABASE_URL < backend/src/db/schema.sql
```

---

## API Reference

### Auth
```
POST /api/auth/login       → { accessToken, refreshToken, user }
POST /api/auth/refresh     → { accessToken, refreshToken }
POST /api/auth/logout
GET  /api/auth/me
```

### Providers
```
GET  /api/providers/search?q=&specialty=&state=&city=
GET  /api/providers/npi/:npi
GET  /api/providers/:id
POST /api/providers/:id/add-to-pipeline
POST /api/providers/:id/enrich
```

### Candidates
```
GET    /api/candidates             → paginated list
GET    /api/candidates/pipeline    → Kanban data
GET    /api/candidates/:id
POST   /api/candidates
PATCH  /api/candidates/:id
PATCH  /api/candidates/:id/stage   → { stage }
POST   /api/candidates/:id/notes
DELETE /api/candidates/:id
```

### AI
```
POST /api/ai/generate-email     → outreach email
POST /api/ai/score-match        → candidate-job fit score
POST /api/ai/summarize-provider → profile summary
POST /api/ai/generate-sequence  → email sequence
POST /api/ai/chat               → streaming chat (SSE)
```

### Analytics
```
GET /api/analytics/dashboard?period=30d
GET /api/analytics/submissions-trend
GET /api/analytics/jobs
```
