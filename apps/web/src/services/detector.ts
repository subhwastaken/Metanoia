export interface Failure {
  type: string;
  message: string;
  severity: string;
}

export class FailureDetector {
  static classifyFailure(validationResult: any): Failure[] {
    const failures: Failure[] = [];
    const checks = validationResult.checks || {};
    const summary = validationResult.summary || {};
    const errors = validationResult.errors || [];

    const totalRecords = summary.total_records || 0;

    // 1. Type 1: Empty extraction
    if (totalRecords === 0) {
      failures.push({
        type: 'TYPE_1_EMPTY',
        message: 'The extraction run completed but returned zero records.',
        severity: 'HIGH',
      });
      return failures;
    }

    // 2. Type 2: Missing required fields
    if (!checks.required_fields_present) {
      const missingFields: string[] = [];
      for (const [field, presence] of Object.entries(summary.fields_presence || {})) {
        if (presence === 0.0) {
          missingFields.push(field);
        }
      }

      failures.push({
        type: 'TYPE_2_MISSING_FIELDS',
        message: `Required fields are entirely missing: ${missingFields.join(', ')}.`,
        severity: 'HIGH',
      });
    }

    // 3. Type 3: Type mismatch
    if (!checks.schema_valid) {
      const mismatchedFields: string[] = [];
      for (const [field, typePct] of Object.entries(summary.fields_type_valid || {})) {
        const pct = typePct as number;
        if (pct < 0.80) {
          mismatchedFields.push(`${field} (valid: ${(pct * 100).toFixed(1)}%)`);
        }
      }

      failures.push({
        type: 'TYPE_3_TYPE_MISMATCH',
        message: `Data type mismatch detected on fields: ${mismatchedFields.join(', ')}.`,
        severity: 'HIGH',
      });
    }

    // 4. Type 4: Record count anomaly
    if (!checks.historical_anomaly_check) {
      const dropMsg = errors.find((err: string) => err.includes('dropped by')) || 'Significant record count drop detected.';
      failures.push({
        type: 'TYPE_4_ANOMALY',
        message: dropMsg,
        severity: 'MEDIUM',
      });
    }

    // 5. Type 5: Extraction quality degradation
    const lowQualityFields: string[] = [];
    for (const [field, presenceVal] of Object.entries(summary.fields_presence || {})) {
      const presence = presenceVal as number;
      if (presence > 0.0 && presence < 0.30) {
        lowQualityFields.push(`${field} (completeness: ${(presence * 100).toFixed(1)}%)`);
      }
    }

    if (lowQualityFields.length > 0) {
      failures.push({
        type: 'TYPE_5_QUALITY_DEGRADATION',
        message: `Extraction quality degradation on fields: ${lowQualityFields.join(', ')}.`,
        severity: 'MEDIUM',
      });
    }

    return failures;
  }

  static generateDiagnosticSummary(
    scraperName: string,
    collectorId: string,
    schema: Record<string, string>,
    validationResult: any
  ): string {
    const failures = this.classifyFailure(validationResult);
    const summary = validationResult.summary || {};

    const diag: string[] = [];
    diag.push(`Collector ID: ${collectorId}`);
    diag.push(`Scraper: ${scraperName}`);
    diag.push('\n=== EXTRAS EXTRACTION CONTRACT ===');
    for (const [f, t] of Object.entries(schema)) {
      diag.push(`- ${f}: expected type ${t}`);
    }

    diag.push('\n=== OBSERVED FAILURE DIAGNOSTICS ===');
    if (failures.length === 0) {
      diag.push('No active failures detected. The validation checks passed.');
      return diag.join('\n');
    }

    for (const fail of failures) {
      diag.push(`[${fail.type}] (${fail.severity}) ${fail.message}`);
    }

    diag.push('\n=== EXTRACTION QUALITY METRICS ===');
    for (const field of Object.keys(schema)) {
      const presence = (summary.fields_presence || {})[field] || 0.0;
      const typeValid = (summary.fields_type_valid || {})[field] || 0.0;
      diag.push(`- ${field}: presence ${(presence * 100).toFixed(1)}%, type validity ${(typeValid * 100).toFixed(1)}%`);
    }

    diag.push(`\nTotal Records: ${summary.total_records || 0}`);
    diag.push(`Valid Records: ${summary.valid_records || 0}`);
    diag.push(`Invalid Records: ${summary.invalid_records || 0}`);

    diag.push('\n=== ACTION RECOMMENDATION ===');
    diag.push('Analyze target website changes. Refactor selectors to recover missing or invalid fields while strictly preserving the schema format.');

    return diag.join('\n');
  }
}
