export class OutputValidator {
  static validateUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return !!(parsed.protocol && parsed.hostname);
    } catch {
      return false;
    }
  }

  static validateRecords(
    records: Record<string, any>[],
    schema: Record<string, string>,
    expectedMinCount: number = 1,
    historicalAvgCount: number | null = null,
    maxDropPercentage: number = 0.50
  ): {
    success: boolean;
    summary: {
      total_records: number;
      valid_records: number;
      invalid_records: number;
      fields_presence: Record<string, number>;
      fields_type_valid: Record<string, number>;
    };
    checks: {
      json_valid: boolean;
      schema_valid: boolean;
      required_fields_present: boolean;
      record_count_threshold: boolean;
      url_validation_passed: boolean;
      historical_anomaly_check: boolean;
    };
    errors: string[];
  } {
    const errors: string[] = [];
    const checks = {
      json_valid: true,
      schema_valid: true,
      required_fields_present: true,
      record_count_threshold: true,
      url_validation_passed: true,
      historical_anomaly_check: true,
    };

    const totalRecords = records.length;

    // 1. Quantity Validation
    if (totalRecords < expectedMinCount) {
      checks.record_count_threshold = false;
      errors.push(`Record count ${totalRecords} is less than minimum expected ${expectedMinCount}.`);
    }

    // 2. Historical Anomaly Check
    if (historicalAvgCount !== null && historicalAvgCount > 0) {
      const dropPercentage = (historicalAvgCount - totalRecords) / historicalAvgCount;
      if (dropPercentage > maxDropPercentage && totalRecords < historicalAvgCount) {
        checks.historical_anomaly_check = false;
        errors.push(
          `Record count dropped by ${(dropPercentage * 100).toFixed(1)}% (Previous average: ${historicalAvgCount}, Current: ${totalRecords}).`
        );
      }
    }

    if (totalRecords === 0) {
      checks.schema_valid = false;
      checks.required_fields_present = false;
      checks.url_validation_passed = false;
      
      const fields_presence: Record<string, number> = {};
      const fields_type_valid: Record<string, number> = {};
      for (const field of Object.keys(schema)) {
        fields_presence[field] = 0.0;
        fields_type_valid[field] = 0.0;
      }

      return {
        success: false,
        summary: {
          total_records: 0,
          valid_records: 0,
          invalid_records: 0,
          fields_presence,
          fields_type_valid,
        },
        checks,
        errors,
      };
    }

    // Initialize metrics
    const fieldPresenceCounts: Record<string, number> = {};
    const fieldTypeValidCounts: Record<string, number> = {};
    for (const field of Object.keys(schema)) {
      fieldPresenceCounts[field] = 0;
      fieldTypeValidCounts[field] = 0;
    }
    
    let invalidRecordsCount = 0;

    for (const record of records) {
      let recordIsValid = true;
      for (const [field, expectedType] of Object.entries(schema)) {
        const val = record[field];

        if (val !== undefined && val !== null && val !== '') {
          fieldPresenceCounts[field]++;

          let typeOk = false;
          if (expectedType === 'string') {
            typeOk = typeof val === 'string';
          } else if (expectedType === 'number') {
            typeOk = typeof val === 'number' && !isNaN(val);
          } else if (expectedType === 'boolean') {
            typeOk = typeof val === 'boolean';
          } else if (expectedType === 'url') {
            typeOk = typeof val === 'string' && this.validateUrl(val);
          } else {
            typeOk = true;
          }

          if (typeOk) {
            fieldTypeValidCounts[field]++;
          } else {
            recordIsValid = false;
          }
        } else {
          recordIsValid = false;
        }
      }

      if (!recordIsValid) {
        invalidRecordsCount++;
      }
    }

    // Calculate percentages
    const fields_presence: Record<string, number> = {};
    const fields_type_valid: Record<string, number> = {};
    for (const field of Object.keys(schema)) {
      fields_presence[field] = fieldPresenceCounts[field] / totalRecords;
      fields_type_valid[field] = fieldTypeValidCounts[field] / totalRecords;
    }

    // 3. Presence Checks
    for (const [field, pct] of Object.entries(fields_presence)) {
      if (pct === 0.0) {
        checks.required_fields_present = false;
        errors.push(`Required field '${field}' is completely missing from all records.`);
      } else if (pct < 0.80) {
        errors.push(`Field '${field}' has low completeness (${(pct * 100).toFixed(1)}%).`);
      }
    }

    // Type checks
    for (const [field, pct] of Object.entries(fields_type_valid)) {
      if (pct < 0.80 && fieldPresenceCounts[field] > 0) {
        checks.schema_valid = false;
        errors.push(`Field '${field}' has high type mismatch rate (Only ${(pct * 100).toFixed(1)}% match type '${schema[field]}').`);
      }
    }

    // URL validation checks
    for (const [field, expectedType] of Object.entries(schema)) {
      if (expectedType === 'url') {
        const pct = fields_type_valid[field];
        if (pct < 0.50 && fieldPresenceCounts[field] > 0) {
          checks.url_validation_passed = false;
          errors.push(`Field '${field}' contains invalid URL structures (Only ${(pct * 100).toFixed(1)}% valid URLs).`);
        }
      }
    }

    const success = Object.values(checks).every((v) => v === true);

    return {
      success,
      summary: {
        total_records: totalRecords,
        valid_records: totalRecords - invalidRecordsCount,
        invalid_records: invalidRecordsCount,
        fields_presence,
        fields_type_valid,
      },
      checks,
      errors,
    };
  }
}
