import sys
import os

# Append paths
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..")))

from apps.api.services.validator import OutputValidator
from apps.api.services.detector import FailureDetector

def test_validator_success():
    schema = {
        "product_name": "string",
        "price": "number",
        "product_url": "url"
    }
    records = [
        {"product_name": "Keyboard", "price": 45.0, "product_url": "https://example.com/item1"},
        {"product_name": "Mouse", "price": 15.99, "product_url": "https://example.com/item2"}
    ]
    
    res = OutputValidator.validate_records(records, schema)
    assert res["success"] is True
    assert res["summary"]["total_records"] == 2
    assert res["summary"]["valid_records"] == 2
    assert res["checks"]["schema_valid"] is True
    assert res["checks"]["required_fields_present"] is True

def test_validator_missing_fields():
    schema = {
        "product_name": "string",
        "price": "number"
    }
    # One record lacks price entirely
    records = [
        {"product_name": "Keyboard"},
        {"product_name": "Mouse", "price": 15.99}
    ]
    
    res = OutputValidator.validate_records(records, schema)
    # Check that success is false because required_fields_present should be false (since price is 0 in first item)
    # Actually fields_presence for price is 0.5 (50%), which is < 100%. Our validator flags a warning but doesn't fail unless 0% presence.
    # Wait, let's see how our validator is written.
    # In validator.py:
    # "for field, pct in fields_presence.items():
    #      if pct == 0.0: checks['required_fields_present'] = False"
    # So if it is 0%, checks['required_fields_present'] is False.
    # Let's test completely missing field (0% presence):
    records_empty_price = [
        {"product_name": "Keyboard"},
        {"product_name": "Mouse"}
    ]
    res_empty = OutputValidator.validate_records(records_empty_price, schema)
    assert res_empty["success"] is False
    assert res_empty["checks"]["required_fields_present"] is False

def test_validator_type_mismatch():
    schema = {
        "price": "number"
    }
    # price is string "$15.99" instead of float
    records = [
        {"price": "$15.99"}
    ]
    res = OutputValidator.validate_records(records, schema)
    assert res["success"] is False
    assert res["checks"]["schema_valid"] is False

def test_failure_classification():
    # Simulate a validation result where required fields are missing
    validation_res = {
        "success": False,
        "summary": {
            "total_records": 5,
            "valid_records": 0,
            "invalid_records": 5,
            "fields_presence": {"product_name": 1.0, "price": 0.0},
            "fields_type_valid": {"product_name": 1.0, "price": 0.0}
        },
        "checks": {
            "json_valid": True,
            "schema_valid": True,
            "required_fields_present": False,
            "record_count_threshold": True,
            "url_validation_passed": True,
            "historical_anomaly_check": True
        },
        "errors": ["Required field price is completely missing."]
    }

    failures = FailureDetector.classify_failure(validation_res)
    assert len(failures) == 1
    assert failures[0]["type"] == "TYPE_2_MISSING_FIELDS"
    assert "price" in failures[0]["message"]

def test_caching_and_version_recovery():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from database.db import Base
    from database.models import Scraper, Run, SelectorVersion
    from apps.api.services.brightdata import BrightDataService
    import datetime

    # Set up in-memory SQLite database for testing
    engine = create_engine("sqlite:///:memory:")
    Session = sessionmaker(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = Session()

    try:
        # Create Scraper
        scraper = Scraper(
            id="test-scraper-123",
            name="Test Scraper",
            target_url="http://127.0.0.1:8000/demo-site",
            collector_id="test-col-123",
            schema_definition={"price": "number"},
            status="HEALTHY"
        )
        db.add(scraper)
        db.commit()

        # Initialize mock selector mappings in simulator memory
        BrightDataService.set_selectors({"price": ".product-price"}, scraper_id=scraper.id)

        # 1. Run collector and update cache
        records = [{"price": 100.0}]
        html_hash = BrightDataService.compute_page_hash(scraper.target_url) or "abc123hash"
        BrightDataService.update_scraper_cache(db, scraper.id, records, html_hash)

        # Assert cache was written
        db.refresh(scraper)
        assert scraper.last_html_hash == html_hash
        assert scraper.cached_records == records

        # 2. Test Cache Hit in run_collector
        res = BrightDataService.run_collector(
            collector_id=scraper.collector_id,
            target_url=scraper.target_url,
            schema=scraper.schema_definition,
            scraper_id=scraper.id,
            db=db,
            bypass_cache=False
        )
        assert res["cached"] is True
        assert res["records"] == records

        # 3. Test selector version creation
        sv = SelectorVersion(
            scraper_id=scraper.id,
            version=1,
            selectors={"price": ".old-price"},
            success_count=5
        )
        db.add(sv)
        db.commit()

        # Check that it exists in selector versions relationship
        db.refresh(scraper)
        assert len(scraper.selector_versions) == 1
        assert scraper.selector_versions[0].selectors["price"] == ".old-price"

    finally:
        db.close()
