import { pgTable, text, integer, real, timestamp, boolean, jsonb } from 'drizzle-orm/pg-core';

export const scrapers = pgTable('scrapers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  targetUrl: text('target_url').notNull(),
  collectorId: text('collector_id'),
  schedule: text('schedule'),
  status: text('status').default('HEALTHY').notNull(),
  schemaDefinition: jsonb('schema_definition').notNull(),
  lastRun: timestamp('last_run'),
  lastSuccess: timestamp('last_success'),
  successRate: real('success_rate').default(100.0),
  currentVersion: integer('current_version').default(1).notNull(),
  lastHtmlHash: text('last_html_hash'),
  cachedRecords: jsonb('cached_records'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const runs = pgTable('runs', {
  id: text('id').primaryKey(),
  scraperId: text('scraper_id').references(() => scrapers.id, { onDelete: 'cascade' }).notNull(),
  collectorId: text('collector_id'),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
  duration: real('duration'),
  status: text('status').notNull(), // 'RUNNING', 'SUCCESS', 'FAILED', 'VALIDATION_FAILED', 'HEALING'
  recordsCount: integer('records_count').default(0).notNull(),
  rawResultReference: text('raw_result_reference'),
  validationStatus: jsonb('validation_status'),
  error: text('error'),
  cached: boolean('cached').default(false).notNull(),
  recoverySource: text('recovery_source'), // 'AI_HEALING', 'LOCAL_VERSION_RECOVERY', etc.
});

export const healingAttempts = pgTable('healing_attempts', {
  id: text('id').primaryKey(),
  scraperId: text('scraper_id').references(() => scrapers.id, { onDelete: 'cascade' }).notNull(),
  runId: text('run_id').references(() => runs.id, { onDelete: 'cascade' }).notNull(),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
  status: text('status').notNull(), // 'RUNNING', 'SUCCESS', 'FAILED'
  failureDescription: text('failure_description').notNull(),
  collectorId: text('collector_id'),
  recordsBefore: integer('records_before').default(0),
  recordsAfter: integer('records_after').default(0),
  validationResult: jsonb('validation_result'),
  error: text('error'),
});

export const selectorVersions = pgTable('selector_versions', {
  id: text('id').primaryKey(),
  scraperId: text('scraper_id').references(() => scrapers.id, { onDelete: 'cascade' }).notNull(),
  version: integer('version').notNull(),
  selectors: jsonb('selectors').notNull(),
  successCount: integer('success_count').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const benchmarkResults = pgTable('benchmark_results', {
  id: text('id').primaryKey(),
  scenarioName: text('scenario_name').notNull(),
  status: text('status').notNull(), // 'PASSED', 'FAILED', 'NOT_RUN'
  duration: real('duration').notNull(),
  healed: boolean('healed').default(false).notNull(),
  error: text('error'),
  runId: text('run_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
