# Neon Postgres & Drizzle Configuration Guide

ScrapeGuard has been fully migrated to a unified **Next.js + Drizzle ORM + Neon Serverless Postgres** stack. All backend services, mock websites, and validation modules now run natively in TypeScript inside Next.js API routes, removing the FastAPI/SQLite Python dependencies.

To connect ScrapeGuard to your Neon Database, follow these steps:

---

## 1. Configure the `.env` file

Open the Next.js environment configuration file:
👉 **[apps/web/.env](file:///Users/subharupnandi/Desktop/WebScaper/apps/web/.env)**

Replace the placeholder value with your real Neon Serverless Postgres connection string:

```env
DATABASE_URL="postgres://neondb_owner:[PASSWORD]@[HOST].us-east-2.aws.neon.tech/neondb?sslmode=require"
MOCK_BRIGHTDATA=true
```

> [!NOTE]
> You can create a free database cluster in seconds at [https://neon.tech/](https://neon.tech/).

---

## 2. Sync Database Schema

Open a terminal or run the npm db push command inside the `apps/web` directory:

```bash
cd apps/web
npm run db:push
```

This runs Drizzle Kit under the hood to introspect your Neon cluster and create all the tables (`scrapers`, `runs`, `healing_attempts`, `selector_versions`, `benchmark_results`) in milliseconds.

---

## 3. Verify Operations

1. Start the Next.js server if not already running:
   ```bash
   cd apps/web
   npm run dev
   ```
2. Open the dashboard in your browser:
   👉 **[http://localhost:3000](http://localhost:3000)**
3. Navigate to **Scrapers** and click **Trigger Run** or **Trigger Failure Stress Test** on the **Benchmark** page.
