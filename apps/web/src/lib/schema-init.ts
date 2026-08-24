import { neon } from '@neondatabase/serverless';

export const INIT_SQL = `
CREATE TABLE IF NOT EXISTS scrapers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  target_url TEXT NOT NULL,
  collector_id TEXT,
  schedule TEXT,
  status TEXT NOT NULL DEFAULT 'HEALTHY',
  schema_definition JSONB NOT NULL,
  last_run TIMESTAMP,
  last_success TIMESTAMP,
  success_rate REAL DEFAULT 100.0,
  current_version INTEGER NOT NULL DEFAULT 1,
  last_html_hash TEXT,
  cached_records JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  scraper_id TEXT NOT NULL REFERENCES scrapers(id) ON DELETE CASCADE,
  collector_id TEXT,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  duration REAL,
  status TEXT NOT NULL,
  records_count INTEGER NOT NULL DEFAULT 0,
  raw_result_reference TEXT,
  validation_status JSONB,
  error TEXT,
  cached BOOLEAN NOT NULL DEFAULT FALSE,
  recovery_source TEXT
);

CREATE TABLE IF NOT EXISTS healing_attempts (
  id TEXT PRIMARY KEY,
  scraper_id TEXT NOT NULL REFERENCES scrapers(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  status TEXT NOT NULL,
  failure_description TEXT NOT NULL,
  collector_id TEXT,
  records_before INTEGER DEFAULT 0,
  records_after INTEGER DEFAULT 0,
  validation_result JSONB,
  error TEXT
);

CREATE TABLE IF NOT EXISTS selector_versions (
  id TEXT PRIMARY KEY,
  scraper_id TEXT NOT NULL REFERENCES scrapers(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  selectors JSONB NOT NULL,
  success_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS benchmark_results (
  id TEXT PRIMARY KEY,
  scenario_name TEXT NOT NULL,
  status TEXT NOT NULL,
  duration REAL NOT NULL,
  healed BOOLEAN NOT NULL DEFAULT FALSE,
  error TEXT,
  run_id TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
`;

let schemaReady = false;

export async function ensureSchema(): Promise<void> {
  if (schemaReady) return;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return;

  const sql = neon(connectionString);
  const statements = INIT_SQL.split(';')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await sql.query(statement);
  }

  schemaReady = true;
}
