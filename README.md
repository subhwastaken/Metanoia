<div align="center">

# Metanoia

**Autonomous self-healing web scraper platform — built on Bright Data Scraper Studio**

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Bright Data](https://img.shields.io/badge/Bright%20Data-Scraper%20Studio-00d4aa?style=for-the-badge)](https://brightdata.com/)
[![Neon](https://img.shields.io/badge/Neon-Postgres-00e599?style=for-the-badge)](https://neon.tech/)
[![Drizzle](https://img.shields.io/badge/Drizzle-ORM-C5F74F?style=for-the-badge)](https://orm.drizzle.team/)
[![Gemini](https://img.shields.io/badge/Google-Gemini-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev/)
[![GitHub Actions](https://img.shields.io/badge/CI-GitHub%20Actions-2088FF?style=for-the-badge&logo=github-actions&logoColor=white)](https://github.com/features/actions)

*When websites change, your scrapers shouldn't break.*

[Quick Start](#quick-start) · [Architecture](#architecture) · [AI Agent](#ai-job-intelligence-agent) · [API](#api-reference)

</div>

---

## Overview

**Metanoia** is a production-grade reliability layer for web scrapers. It registers Bright Data collectors, validates every extraction against a schema contract, detects when target sites break your selectors, and autonomously heals them.

An **AI Job Intelligence Agent** turns plain-English prompts into live job listings with direct company career page links.

> Built for the **Bright Data Self-Healing Scraper** track.

---

## Features

| Module | Description |
|--------|-------------|
| **Scraper Registry** | Register collectors, cron schedules, extraction schemas |
| **Failure Detector** | DOM drift, missing fields, type mismatches, count collapse |
| **Self-Healing Engine** | `brightdata scraper heal` → re-run → validate |
| **Reliability Dashboard** | Success rates, MTTR, charts, live activity |
| **AI Job Agent** | Natural-language search via Google Jobs SERP + ATS pages |
| **Demo Sandbox** | Inject DOM failures on `/demo-site`, watch recovery |
| **CI Monitor** | GitHub Actions cron with auto-heal |

---

## Architecture

```mermaid
flowchart TB
    subgraph Client["Console - Next.js"]
        LP[Landing Page]
        DB[Dashboard]
        SR[Scrapers Registry]
        AG[AI Agent]
    end

    subgraph API["API Routes"]
        STATS["GET dashboard stats"]
        SCR["GET POST scrapers"]
        RUN["POST scrapers run"]
        HEAL["POST scrapers heal"]
        SEARCH["POST agent search"]
    end

    subgraph Core["Core Services"]
        BD[BrightDataService]
        VAL[OutputValidator]
        DET[FailureDetector]
        HLR[HealerService]
        AGT[JobIntelligenceAgent]
    end

    subgraph External["External"]
        NEON[(Neon Postgres)]
        BDC[Bright Data Collector]
        SERP[Bright Data SERP]
        GAI[Google Gemini]
    end

    LP --> DB & SR & AG
    DB --> STATS
    SR --> SCR & RUN & HEAL
    AG --> SEARCH
    STATS & SCR --> NEON
    RUN --> BD --> BDC
    RUN --> VAL & DET
    HEAL --> HLR --> BD
    SEARCH --> AGT --> GAI & SERP
```

---

## Self-Healing Flow

```mermaid
sequenceDiagram
    participant U as User / Cron
    participant R as RunnerService
    participant BD as Bright Data
    participant V as Validator
    participant H as HealerService
    participant DB as Neon

    U->>R: Trigger run
    R->>BD: runCollector()
    BD-->>R: JSON records
    R->>V: validate schema

    alt Pass
        V-->>R: SUCCESS
        R->>DB: Store HEALTHY run
    else Fail
        V-->>R: FAILED
        R->>H: heal + re-run
        H->>BD: scraper heal
        BD-->>H: new selectors
        H->>V: re-validate
        V-->>H: HEALED
        H->>DB: Store healing log
    end
```

---

## AI Job Intelligence Agent

```mermaid
flowchart LR
    A[Natural language prompt] --> B[Gemini Intent Parser]
    B --> C[Search query]
    C --> D[Google Jobs SERP]
    C --> E[Company ATS search]
    D --> F[Extract listings]
    E --> F
    F --> G[Filter stale results]
    G --> H[Company career pages]
    G --> I[Job board listings]
```

**Example:** `find me devops job in blr startups which are currently hiring`

Returns structured JSON — title, company, location, apply link, skills — split into direct company openings (Greenhouse, Lever, Ashby) and job boards.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16, React 19, TypeScript 5 |
| Styling | Tailwind CSS v4, Lucide, Recharts |
| Database | Neon Postgres, Drizzle ORM |
| Scraping | Bright Data Collector + SERP API |
| AI | Google Gemini (`gemini-3.6-flash`) |
| CI/CD | GitHub Actions |

---

## Quick Start

```bash
git clone https://github.com/subhwastaken/Metanoia.git
cd Metanoia/apps/web
npm install
```

Create `apps/web/.env`:

```env
DATABASE_URL=postgresql://user:pass@host/neondb?sslmode=require
BRIGHTDATA_API_KEY=your_key
BRIGHTDATA_SERP_ZONE=serp_api1
GEMINI_API_KEY=your_key
MOCK_BRIGHTDATA=false
```

```bash
curl -X POST http://localhost:3000/api/setup   # init DB
npm run dev
```

| Route | Page |
|-------|------|
| `/` | Landing |
| `/dashboard` | Reliability metrics |
| `/scrapers` | Registry |
| `/agent` | AI job search |
| `/demo-site` | Failure sandbox |

---

## Usage

**Register scraper** → Scrapers → target `/demo-site` → define schema → Run Now

**Break & heal** → inject DOM failure in header → run scraper → watch auto-heal

**AI search** → Agent → type plain English → get career pages + job boards

---

## Project Structure

```
Metanoia/
├── apps/web/src/
│   ├── app/(dashboard)/    # Console UI
│   ├── app/(marketing)/    # Landing
│   ├── app/api/            # REST routes
│   ├── services/           # agent, healer, brightdata, validator
│   └── db/                 # Drizzle schema
├── scripts/                # CI monitor
└── .github/workflows/      # GitHub Actions
```

---

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/setup` | POST | Init database |
| `/api/dashboard/stats` | GET | KPIs + activity |
| `/api/scrapers` | GET/POST | List / register |
| `/api/scrapers/[id]/run` | POST | Execute run |
| `/api/scrapers/[id]/heal` | POST | Trigger healing |
| `/api/agent/search` | POST | AI job search |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Neon connection string |
| `BRIGHTDATA_API_KEY` | Yes | Bright Data token |
| `BRIGHTDATA_SERP_ZONE` | No | Default `serp_api1` |
| `GEMINI_API_KEY` | Agent | Gemini API key |
| `MOCK_BRIGHTDATA` | No | Simulate without API |

---

## CI Pipeline

```mermaid
flowchart LR
    A[Cron 6h] --> B[Run scrapers]
    B --> C{Valid?}
    C -->|Yes| D[Green check]
    C -->|No| E[Auto-heal]
    E --> F[Re-run]
    F --> D
```

Secrets: `BRIGHTDATA_API_KEY`, `BRIGHTDATA_CUSTOMER_ID`, `MOCK_BRIGHTDATA`

---

## Deploy on Vercel

The Next.js app lives in `apps/web`. Vercel must build from that directory.

1. Import [github.com/subhwastaken/Metanoia](https://github.com/subhwastaken/Metanoia) on Vercel
2. Set **Root Directory** → `apps/web`
3. Add environment variables (`DATABASE_URL`, `BRIGHTDATA_API_KEY`, `GEMINI_API_KEY`, etc.)
4. Deploy

Root `vercel.json` also points the builder at `apps/web/package.json` for monorepo support.

Live URL: [metanoia-brown-xi.vercel.app](https://metanoia-brown-xi.vercel.app)

---

## License

MIT © 2026 [**subhwastaken**](https://github.com/subhwastaken)
