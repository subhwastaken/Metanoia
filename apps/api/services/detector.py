from typing import Dict, Any, List

class FailureDetector:
    @staticmethod
    def classify_failure(validation_result: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Analyzes validation results and outputs a list of classified failures.
        Each failure has:
            - type: str (e.g., "TYPE_1_EMPTY")
            - message: str (human readable description)
            - severity: str (HIGH, MEDIUM, LOW)
        """
        failures = []
        checks = validation_result.get("checks", {})
        summary = validation_result.get("summary", {})
        errors = validation_result.get("errors", [])

        total_records = summary.get("total_records", 0)

        # 1. Type 1: Empty extraction
        if total_records == 0:
            failures.append({
                "type": "TYPE_1_EMPTY",
                "message": "The extraction run completed but returned zero records.",
                "severity": "HIGH"
            })
            return failures  # Return immediately as other checks are not meaningful for 0 records

        # 2. Type 2: Missing required fields
        if not checks.get("required_fields_present", True):
            missing_fields = []
            for field, presence in summary.get("fields_presence", {}).items():
                if presence == 0.0:
                    missing_fields.append(field)
            
            failures.append({
                "type": "TYPE_2_MISSING_FIELDS",
                "message": f"Required fields are entirely missing: {', '.join(missing_fields)}.",
                "severity": "HIGH"
            })

        # 3. Type 3: Type mismatch
        if not checks.get("schema_valid", True):
            mismatched_fields = []
            for field, type_pct in summary.get("fields_type_valid", {}).items():
                if type_pct < 0.80:
                    mismatched_fields.append(f"{field} (valid: {type_pct:.1%})")
            
            failures.append({
                "type": "TYPE_3_TYPE_MISMATCH",
                "message": f"Data type mismatch detected on fields: {', '.join(mismatched_fields)}.",
                "severity": "HIGH"
            })

        # 4. Type 4: Record count anomaly
        if not checks.get("historical_anomaly_check", True):
            # Find the specific drop error in the validator error messages
            drop_msg = next((err for err in errors if "dropped by" in err), "Significant record count drop detected.")
            failures.append({
                "type": "TYPE_4_ANOMALY",
                "message": drop_msg,
                "severity": "MEDIUM"
            })

        # 5. Type 5: Extraction quality degradation
        # e.g., fields are not 100% missing, but have very low completeness (e.g. <30%)
        low_quality_fields = []
        for field, presence in summary.get("fields_presence", {}).items():
            if 0.0 < presence < 0.30:
                low_quality_fields.append(f"{field} (completeness: {presence:.1%})")
        
        if low_quality_fields:
            failures.append({
                "type": "TYPE_5_QUALITY_DEGRADATION",
                "message": f"Extraction quality degradation on fields: {', '.join(low_quality_fields)}.",
                "severity": "MEDIUM"
            })

        return failures

    @classmethod
    def generate_diagnostic_summary(
        cls,
        scraper_name: str,
        collector_id: str,
        schema: Dict[str, str],
        validation_result: Dict[str, Any]
    ) -> str:
        """
        Creates a structured prompt-style diagnostic summary to feed into the self-healing engine.
        """
        failures = cls.classify_failure(validation_result)
        summary = validation_result.get("summary", {})
        
        diag = []
        diag.append(f"Collector ID: {collector_id}")
        diag.append(f"Scraper: {scraper_name}")
        diag.append("\n=== EXTRAS EXTRACTION CONTRACT ===")
        for f, t in schema.items():
            diag.append(f"- {f}: expected type {t}")

        diag.append("\n=== OBSERVED FAILURE DIAGNOSTICS ===")
        if not failures:
            diag.append("No active failures detected. The validation checks passed.")
            return "\n".join(diag)

        for fail in failures:
            diag.append(f"[{fail['type']}] ({fail['severity']}) {fail['message']}")

        diag.append("\n=== EXTRACTION QUALITY METRICS ===")
        for field in schema:
            presence = summary.get("fields_presence", {}).get(field, 0.0)
            type_valid = summary.get("fields_type_valid", {}).get(field, 0.0)
            diag.append(f"- {field}: presence {presence:.1%}, type validity {type_valid:.1%}")

        diag.append(f"\nTotal Records: {summary.get('total_records', 0)}")
        diag.append(f"Valid Records: {summary.get('valid_records', 0)}")
        diag.append(f"Invalid Records: {summary.get('invalid_records', 0)}")

        diag.append("\n=== ACTION RECOMMENDATION ===")
        diag.append("Analyze target website changes. Refactor selectors to recover missing or invalid fields while strictly preserving the schema format.")
        
        return "\n".join(diag)
