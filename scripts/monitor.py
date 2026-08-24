import os
import sys
import json
import argparse
import datetime
import subprocess

# Append root folder to path to enable importing services
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from apps.api.services.validator import OutputValidator
from apps.api.services.detector import FailureDetector
from apps.api.services.brightdata import BrightDataService

def run_ci_pipeline(scraper_config_path: str):
    print(f"[{datetime.datetime.utcnow().isoformat()}] ScrapeGuard CI/CD Pipeline Initialized")
    
    if not os.path.exists(scraper_config_path):
        print(f"Error: Scraper config file not found at {scraper_config_path}")
        sys.exit(1)
        
    with open(scraper_config_path, "r") as f:
        scraper = json.load(f)
        
    name = scraper.get("name", "Unknown Scraper")
    collector_id = scraper.get("collector_id")
    target_url = scraper.get("target_url")
    schema = scraper.get("schema_definition", {})
    auto_heal = scraper.get("auto_heal", True)

    print(f"Monitoring Scraper: {name}")
    print(f"Collector ID: {collector_id}")
    print(f"Target URL: {target_url}")
    print(f"Contract Schema: {json.dumps(schema)}")

    # 1. Execute run
    print("\n[Step 1/5] Running Bright Data Collector...")
    res = BrightDataService.run_collector(
        collector_id=collector_id,
        target_url=target_url,
        schema=schema
    )

    if res["status"] != "SUCCESS":
        print(f"ERROR: Bright Data collector failed to execute: {res['error']}")
        sys.exit(1)

    records = res["records"]
    print(f"Collector returned {len(records)} records.")

    # 2. Validate output
    print("\n[Step 2/5] Running output contract validation...")
    val_res = OutputValidator.validate_records(
        records=records,
        schema=schema,
        expected_min_count=1
    )

    if val_res["success"]:
        print("✓ SUCCESS: Scraper output matches validation contract. Pipeline is healthy!")
        sys.exit(0)

    print("✗ FAILURE DETECTED: Scraper output failed contract validation.")
    for err in val_res["errors"]:
        print(f"  - {err}")

    # 3. Analyze failure
    print("\n[Step 3/5] Classification failure diagnostics...")
    diag_summary = FailureDetector.generate_diagnostic_summary(name, collector_id, schema, val_res)
    print(diag_summary)

    if not auto_heal:
        print("Auto-healing is disabled for this scraper. Exiting with failure.")
        sys.exit(1)

    # 4. Trigger self-healing
    print("\n[Step 4/5] Triggering Bright Data self-healing agent...")
    heal_res = BrightDataService.heal_collector(
        collector_id=collector_id,
        failure_description=diag_summary
    )

    if heal_res["status"] != "SUCCESS":
        print(f"✗ CRITICAL: Self-healing request failed: {heal_res['error']}")
        sys.exit(1)

    print("✓ Bright Data self-healing script refactoring completed. CLI approved fix.")

    # 5. Rerun repaired collector and validate
    print("\n[Step 5/5] Executing post-healing validation run...")
    rerun_res = BrightDataService.run_collector(
        collector_id=collector_id,
        target_url=target_url,
        schema=schema
    )

    if rerun_res["status"] != "SUCCESS":
        print(f"✗ CRITICAL: Repaired collector failed execution: {rerun_res['error']}")
        sys.exit(1)

    repaired_records = rerun_res["records"]
    repaired_val = OutputValidator.validate_records(
        records=repaired_records,
        schema=schema,
        expected_min_count=1
    )

    if repaired_val["success"]:
        print(f"✓ RECOVERY SUCCESSFUL: Extracted {len(repaired_records)} valid records.")
        print("Pipeline is healed and resumed. GitHub Action completing with green check.")
        sys.exit(0)
    else:
        print("✗ CRITICAL: Self-healing completed, but post-healing validation failed again.")
        for err in repaired_val["errors"]:
            print(f"  - {err}")
        print("Escalating to engineering team for manual code review. Exiting with failure.")
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ScrapeGuard CI pipeline execution.")
    parser.add_argument("--config", default="scrapers.json", help="Path to scraper configuration json file.")
    args = parser.parse_args()
    
    run_ci_pipeline(args.config)
