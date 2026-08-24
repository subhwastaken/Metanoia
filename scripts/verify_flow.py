import time
import httpx
import sys

API_BASE = "http://127.0.0.1:8000"

def print_header(title: str):
    print("\n" + "=" * 60)
    print(f" {title.upper()}")
    print("=" * 60)

def main():
    print_header("ScrapeGuard Reliability Validation Runner")
    
    # 1. Check API server health
    try:
        health = httpx.get(f"{API_BASE}/api/health").json()
        print(f"✓ API Server is online. Mode: {health['mode']}")
    except Exception as e:
        print(f"✗ Error connecting to API: {e}")
        print("Please ensure the FastAPI backend is running on port 8000.")
        sys.exit(1)

    # 2. Reset Demo site layout
    print("\n[1/6] Resetting target website structure to Healthy Baseline...")
    httpx.post(f"{API_BASE}/api/demo/reset")
    print("✓ Target website reset completed.")

    # 3. Create a Scraper Contract in Registry
    print("\n[2/6] Registering new scraper 'Electronics Catalog'...")
    scraper_payload = {
        "name": "Electronics Catalog",
        "description": "Scrapes warehouse electronics parts and stock levels.",
        "target_url": f"{API_BASE}/demo-site",
        "schema_definition": {
            "product_name": "string",
            "price": "number",
            "currency": "string",
            "availability": "string",
            "product_url": "url"
        },
        "schedule": "0 */12 * * *",
        "auto_heal": True
    }
    
    scraper = httpx.post(f"{API_BASE}/api/scrapers", json=scraper_payload).json()
    scraper_id = scraper["id"]
    print(f"✓ Scraper registered with ID: {scraper_id}")

    # 4. Trigger Baseline Run (should succeed)
    print("\n[3/6] Running baseline scraper execution (Normal website structure)...")
    httpx.post(f"{API_BASE}/api/scrapers/{scraper_id}/run")
    
    # Poll runs for the scraper
    print("Monitoring run execution status...")
    run_status = None
    last_run_id = None
    for _ in range(20):
        time.sleep(1.5)
        runs = httpx.get(f"{API_BASE}/api/scrapers/{scraper_id}/runs").json()
        if runs:
            run = runs[0]
            run_status = run["status"]
            last_run_id = run["id"]
            print(f"  - Run status: {run_status} (records: {run['records_count']})")
            if run_status in ["SUCCESS", "FAILED", "VALIDATION_FAILED"]:
                break
                
    if run_status != "SUCCESS":
        print(f"✗ Error: Baseline run failed. Expected SUCCESS, got {run_status}")
        sys.exit(1)
    print("✓ Baseline run completed successfully!")

    # 5. Inject DOM Change Failure and Execute (should fail and heal)
    print("\n[4/6] Injecting website change: Renaming DOM classes and selectors...")
    httpx.post(f"{API_BASE}/api/demo/state", json={"status": "CLASS_RENAMED"})
    print("✓ Layout changed on demo website target.")

    print("\n[5/6] Triggering run under broken structure to verify failure detection and healing...")
    httpx.post(f"{API_BASE}/api/scrapers/{scraper_id}/run")
    
    # Poll for healing process (RUNNING -> HEALING -> VALIDATING -> HEALED/SUCCESS)
    healed_run_status = None
    for i in range(25):
        time.sleep(2)
        runs = httpx.get(f"{API_BASE}/api/scrapers/{scraper_id}/runs").json()
        if runs:
            # We want to find the new run
            new_run = next(r for r in runs if r["id"] != last_run_id)
            healed_run_status = new_run["status"]
            print(f"  - Run status: {healed_run_status} (records count: {new_run['records_count']})")
            if healed_run_status in ["HEALED", "SUCCESS", "FAILED", "VALIDATION_FAILED"] and new_run["completed_at"] is not None:
                break
                
    if healed_run_status != "HEALED":
        print(f"✗ Error: Self-healing failed. Expected HEALED, got {healed_run_status}")
        # Fetch diagnostic logs
        heals = httpx.get(f"{API_BASE}/api/scrapers/{scraper_id}/healing").json()
        if heals:
            print(f"Healing logs:\n{heals[0]['error']}")
        sys.exit(1)
        
    print("✓ Success! Failure was detected, healing triggered, selectors updated, and pipeline healed!")

    # 6. Trigger Benchmark Suite
    print("\n[6/6] Triggering full 7-scenario Failure Stress Test Benchmark...")
    httpx.post(f"{API_BASE}/api/benchmark/trigger")
    
    # Poll benchmark results
    print("Running benchmark scenarios (Class renamed, element moved, counts collapsed, type mismatches)...")
    for _ in range(30):
        time.sleep(2.5)
        bench = httpx.get(f"{API_BASE}/api/benchmark/results").json()
        results = bench["results"]
        summary = bench["summary"]
        print(f"  - Complete: {len(results)}/7 scenarios (Recovered: {summary['recovered']}, Rate: {summary['recovery_rate']}%)")
        if len(results) == 7:
            break
            
    # Print results scorecard
    print_header("Benchmark scorecards summary")
    print(f"Total Scenarios Tested:  {summary['total_scenarios']}")
    print(f"Anomalies Detected:     {summary['detected']}")
    print(f"Autonomous Recoveries:  {summary['recovered']}")
    print(f"Platform Recovery Rate: {summary['recovery_rate']}%")
    print(f"Mean Recovery Time:     {summary['avg_recovery_time']}s")
    print("=" * 60)

    if summary["recovery_rate"] == 100.0:
        print("\n🏆 ALL CORE WORKFLOWS AND HEALING MODULES WORK FLAWLESSLY!")
        sys.exit(0)
    else:
        print("✗ Failures occurred in some benchmark scenarios.")
        sys.exit(1)

if __name__ == "__main__":
    main()
