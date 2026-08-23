import urllib.parse
from typing import List, Dict, Any, Tuple

class OutputValidator:
    @staticmethod
    def validate_url(url: str) -> bool:
        try:
            result = urllib.parse.urlparse(url)
            return all([result.scheme, result.netloc])
        except Exception:
            return False

    @classmethod
    def validate_records(
        cls,
        records: List[Dict[str, Any]],
        schema: Dict[str, str],
        expected_min_count: int = 1,
        historical_avg_count: int = None,
        max_drop_percentage: float = 0.50  # 50% acceptable drop default
    ) -> Dict[str, Any]:
        """
        Validates extracted records against a schema contract.
        Returns:
            {
                "success": bool,
                "summary": {
                    "total_records": int,
                    "valid_records": int,
                    "invalid_records": int,
                    "fields_presence": {field: pct},
                    "fields_type_valid": {field: pct}
                },
                "checks": {
                    "json_valid": bool,
                    "schema_valid": bool,
                    "required_fields_present": bool,
                    "record_count_threshold": bool,
                    "url_validation_passed": bool,
                    "historical_anomaly_check": bool
                },
                "errors": List[str]
            }
        """
        errors = []
        checks = {
            "json_valid": True,
            "schema_valid": True,
            "required_fields_present": True,
            "record_count_threshold": True,
            "url_validation_passed": True,
            "historical_anomaly_check": True
        }

        total_records = len(records)
        
        # 1. Quantity Validation (Record count threshold)
        if total_records < expected_min_count:
            checks["record_count_threshold"] = False
            errors.append(f"Record count {total_records} is less than minimum expected {expected_min_count}.")

        # 2. Historical Anomaly Check
        if historical_avg_count is not None and historical_avg_count > 0:
            drop_percentage = (historical_avg_count - total_records) / historical_avg_count
            if drop_percentage > max_drop_percentage and total_records < historical_avg_count:
                checks["historical_anomaly_check"] = False
                errors.append(
                    f"Record count dropped by {drop_percentage:.1%} (Previous average: {historical_avg_count}, Current: {total_records})."
                )

        if total_records == 0:
            checks["schema_valid"] = False
            checks["required_fields_present"] = False
            checks["url_validation_passed"] = False
            return {
                "success": False,
                "summary": {
                    "total_records": 0,
                    "valid_records": 0,
                    "invalid_records": 0,
                    "fields_presence": {f: 0.0 for f in schema},
                    "fields_type_valid": {f: 0.0 for f in schema}
                },
                "checks": checks,
                "errors": errors
            }

        # Initialize tracking metrics
        field_presence_counts = {f: 0 for f in schema}
        field_type_valid_counts = {f: 0 for f in schema}
        invalid_records_count = 0

        for record in records:
            record_is_valid = True
            for field, expected_type in schema.items():
                val = record.get(field)
                
                # Check presence
                if val is not None and val != "":
                    field_presence_counts[field] += 1
                    
                    # Check type
                    type_ok = False
                    if expected_type == "string":
                        type_ok = isinstance(val, str)
                    elif expected_type == "number":
                        # accept int or float
                        type_ok = isinstance(val, (int, float)) and not isinstance(val, bool)
                    elif expected_type == "boolean":
                        type_ok = isinstance(val, bool)
                    elif expected_type == "url":
                        type_ok = isinstance(val, str) and cls.validate_url(val)
                    else:
                        type_ok = True  # Generic fallback for unknown types

                    if type_ok:
                        field_type_valid_counts[field] += 1
                    else:
                        record_is_valid = False
                else:
                    record_is_valid = False

            if not record_is_valid:
                invalid_records_count += 1

        # Calculate presence and validation percentages
        fields_presence = {f: (count / total_records) for f, count in field_presence_counts.items()}
        fields_type_valid = {f: (count / total_records) for f, count in field_type_valid_counts.items()}

        # 3. Structural Validation / Presence checks
        # If any required field is completely missing (0% presence)
        for field, pct in fields_presence.items():
            if pct == 0.0:
                checks["required_fields_present"] = False
                errors.append(f"Required field '{field}' is completely missing from all records.")
            elif pct < 0.80:
                # Flag as partial warning, but don't fail immediately unless strict
                errors.append(f"Field '{field}' has low completeness ({pct:.1%}).")

        # Type checks
        for field, pct in fields_type_valid.items():
            if pct < 0.80 and field_presence_counts[field] > 0:
                checks["schema_valid"] = False
                errors.append(f"Field '{field}' has high type mismatch rate (Only {pct:.1%} match type '{schema[field]}').")

        # URL validation checks specifically
        for field, expected_type in schema.items():
            if expected_type == "url":
                pct = fields_type_valid[field]
                if pct < 0.50 and field_presence_counts[field] > 0:
                    checks["url_validation_passed"] = False
                    errors.append(f"Field '{field}' contains invalid URL structures (Only {pct:.1%} valid URLs).")

        # Determine overall success
        # A run is successful if basic schema checks, presence checks, count and historical constraints are met.
        # We can configure strictness, but let's make it fail if required fields are missing, schema type is invalid,
        # or there is an anomaly.
        success = all([
            checks["json_valid"],
            checks["schema_valid"],
            checks["required_fields_present"],
            checks["record_count_threshold"],
            checks["url_validation_passed"],
            checks["historical_anomaly_check"]
        ])

        return {
            "success": success,
            "summary": {
                "total_records": total_records,
                "valid_records": total_records - invalid_records_count,
                "invalid_records": invalid_records_count,
                "fields_presence": fields_presence,
                "fields_type_valid": fields_type_valid
            },
            "checks": checks,
            "errors": errors
        }
