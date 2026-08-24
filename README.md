# Metanoia

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Bright Data](https://img.shields.io/badge/Bright%20Data-Scraper%20Studio-00d4aa?style=flat-square)](https://brightdata.com/)
[![Neon](https://img.shields.io/badge/Neon-Postgres-00e599?style=flat-square)](https://neon.tech/)
[![Gemini](https://img.shields.io/badge/Google-Gemini-4285f4?style=flat-square)](https://ai.google.dev/)

**When websites change, your scrapers shouldn't break.**

Metanoia is an autonomous web-scraper reliability platform built on **Bright Data Scraper Studio**. It monitors extraction output, detects failures, self-heals broken selectors, validates data against schema contracts, and ships a developer console with an AI job search agent.

---

## Features

| Module | What it does |
|--------|-------------|
| **Scraper Registry** | Register Bright Data collectors with cron schedules and extraction schemas |
| **Failure Detector** | Catches DOM drift, missing fields, type mismatches, and count collapses |
| **Self-Healing Engine** | Triggers `brightdata scraper heal`, re-runs, and validates repaired output |
| **Reliability Dashboard** | Success rates, recovery times, charts, and live activity feed |
| **AI Job Agent** | Plain-English job search via Google Jobs SERP + company career pages |
| **Demo Site** | Inject DOM failures and watch the healer recover in real time |
| **GitHub Actions** | Scheduled scraper monitor with auto-heal pipeline |

---

## Tech Stack

- **Frontend** — Next.js 16, React, Tailwind CSS v4, Recharts
- **Database** — Neon Serverless Postgres, Drizzle ORM
- **Scraping** — Bright Data Collector API + SERP API (`serp_api1`)
- **AI** — Google Gemini (intent parsing for job search)
- **CI** — GitHub Actions (`scraper-monitor.yml`)

---

## Quick Start

### Prerequisites

- Node.js 18+
- A [Neon](https://neon.tech) Postgres database
- [Bright Data](https://brightdata.com) API key
- [Google Gemini](https://ai.google.dev) API key (for AI Agent)

### 1. Clone & install

```bash
git clone https://github.com/subhwastaken/Metanoia.git
cd Metanoia/apps/web
npm install
```

### 2. Configure environment

Create `apps/web/.env`:

```env
DATABASE_URL=postgresql://user:pass@host/neondb?sslmode=require
BRIGHTDATA_API_KEY=your_brightdata_key
BRIGHTDATA_SERP_ZONE=serp_api1
GEMINI_API_KEY=your_gemini_key
MOCK_BRIGHTDATA=false
```

### 3. Initialize database

```bash
curl -X POST http://localhost:3000/api/setup
```

Tables are also auto-created on first dashboard or scraper request.

### 4. Run dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Usage

### Register a scraper

1. Go to **Scrapers** → **Register scraper**
2. Set target URL to `/demo-site` for testing
3. Define your extraction schema (`product_name`, `price`, etc.)
4. Open the scraper detail page → **Run Now**

### Break & heal (demo)

1. Use the header dropdown to inject a DOM failure (e.g. "CSS class renamed")
2. Trigger a run — validation fails
3. Metanoia detects the drift, heals selectors, and re-validates

### AI job search

1. Go to **AI Agent**
2. Type: `find me devops job in blr startups which are currently hiring`
3. Get company career pages + job board listings with apply links

---

## Project Structure

```
Metanoia/
├── apps/web/                  # Next.js app (UI + API routes)
│   ├── src/app/
│   │   ├── (dashboard)/       # Console pages
│   │   ├── (marketing)/       # Landing page
│   │   └── api/               # REST endpoints
│   ├── src/services/          # Agent, healer, brightdata, validator
│   └── src/db/                # Drizzle schema
├── apps/api/                  # Legacy FastAPI backend (optional)
├── scripts/                   # CI monitor & verification
└── .github/workflows/         # GitHub Actions
```

---

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/setup` | POST | Initialize Neon database schema |
| `/api/dashboard/stats` | GET | Dashboard metrics & activity |
| `/api/scrapers` | GET/POST | List or register scrapers |
| `/api/scrapers/[id]/run` | POST | Trigger a scraper run |
| `/api/scrapers/[id]/heal` | POST | Trigger self-healing |
| `/api/agent/search` | POST | AI job search |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Neon Postgres connection string |
| `BRIGHTDATA_API_KEY` | Yes | Bright Data API token |
| `BRIGHTDATA_SERP_ZONE` | No | SERP zone name (default: `serp_api1`) |
| `GEMINI_API_KEY` | For AI Agent | Google Gemini API key |
| `MOCK_BRIGHTDATA` | No | Set `true` to simulate without API calls |

---

## License

MIT © 2026 [subhwastaken](https://github.com/subhwastaken)
