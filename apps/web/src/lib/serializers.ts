/** Convert Drizzle camelCase records to snake_case API responses expected by the UI. */

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

export function serializeScraper(s: any) {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    target_url: s.targetUrl,
    collector_id: s.collectorId,
    schedule: s.schedule,
    status: s.status,
    schema_definition: s.schemaDefinition,
    last_run: toIso(s.lastRun),
    last_success: toIso(s.lastSuccess),
    success_rate: s.successRate,
    current_version: s.currentVersion,
    last_html_hash: s.lastHtmlHash ?? null,
    cached_records: s.cachedRecords ?? null,
    created_at: toIso(s.createdAt),
    updated_at: toIso(s.updatedAt),
  };
}

export function serializeRun(r: any) {
  return {
    id: r.id,
    scraper_id: r.scraperId,
    collector_id: r.collectorId,
    started_at: toIso(r.startedAt),
    completed_at: toIso(r.completedAt),
    duration: r.duration,
    status: r.status,
    records_count: r.recordsCount,
    raw_result_reference: r.rawResultReference,
    validation_status: r.validationStatus,
    error: r.error,
    cached: r.cached,
    recovery_source: r.recoverySource,
  };
}

export function serializeHealingAttempt(h: any) {
  return {
    id: h.id,
    scraper_id: h.scraperId,
    run_id: h.runId,
    started_at: toIso(h.startedAt),
    completed_at: toIso(h.completedAt),
    status: h.status,
    failure_description: h.failureDescription,
    collector_id: h.collectorId,
    records_before: h.recordsBefore,
    records_after: h.recordsAfter,
    validation_result: h.validationResult,
    error: h.error,
  };
}

export function serializeSelectorVersion(v: any) {
  return {
    id: v.id,
    scraper_id: v.scraperId,
    version: v.version,
    selectors: v.selectors,
    success_count: v.successCount,
    created_at: toIso(v.createdAt),
  };
}
