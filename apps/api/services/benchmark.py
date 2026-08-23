import time
import datetime
from typing import List
from sqlalchemy.orm import Session
from database.models import Scraper, Run, HealingAttempt, BenchmarkResult
from .brightdata import BrightDataService
from .healer import HealerService
from .validator import OutputValidator
from routes.demo import update_state, StateUpdateRequest, reset_demo
from routes.scrapers import run_scraper_execution
import logging

logger = logging.getLogger("scrapeguard.benchmark")

BENCHMARK_SCENARIOS = [
    {"name": "CSS class renamed", "state": "CLASS_RENAMED"},
    {"name": "Element moved in DOM", "state": "ELEMENT_MOVED"},
    {"name": "data attributes dropped", "state": "DATA_DROPS"},
    {"name": "Nested structure changed", "state": "ELEMENT_MOVED"}, # Shared class shift
    {"name": "Required field disappears", "state": "DATA_DROPS"},
    {"name": "Record count collapses", "state": "COUNT_COLLAPSE"},
    {"name": "Data format changes", "state": "TYPE_MISMATCH"}
]

class BenchmarkService:
    @classmethod
    def run_full_benchmark(cls, db: Session) -> List[BenchmarkResult]:
        """
        Runs all 7 failure scenarios in sequence and records results.
        """
        # Clear old benchmark runs
        db.query(BenchmarkResult).delete()
        db.commit()

        # Check if benchmark scraper exists, if not create it
        scraper = db.query(Scraper).filter(Scraper.name == "B2B Benchmark Scraper").first()
        if not scraper:
            scraper = Scraper(
                name="B2B Benchmark Scraper",
                description="Auto-generated scraper for running validation benchmarks.",
                target_url="http://127.0.0.1:8000/demo-site",
                collector_id="c_benchmark_101",
                schema_definition={
                    "product_name": "string",
                    "price": "number",
                    "currency": "string",
                    "availability": "string",
                    "product_url": "url"
                },
                schedule="0 0 * * *",
                status="HEALTHY"
            )
            db.add(scraper)
            db.commit()
            db.refresh(scraper)

        results = []

        for scenario in BENCHMARK_SCENARIOS:
            logger.info(f"Starting benchmark scenario: {scenario['name']}")
            start_time = time.time()
            
            status = "FAILED"
            healed = False
            error_msg = None
            run_id = None

            try:
                # 1. Reset site layout and selectors to baseline
                reset_demo()
                BrightDataService.reset_selectors(scraper_id=scraper.id)
                
                # Verify baseline run works
                res = BrightDataService.run_collector(
                    collector_id=scraper.collector_id,
                    target_url=scraper.target_url,
                    schema=scraper.schema_definition,
                    scraper_id=scraper.id
                )
                
                # Check baseline output is valid
                val_res = OutputValidator.validate_records(
                    records=res["records"],
                    schema=scraper.schema_definition,
                    expected_min_count=5
                )
                if not val_res["success"]:
                    raise Exception("Baseline validation failed before failure injection.")

                # 2. Inject layout failure
                state_req = StateUpdateRequest(status=scenario["state"])
                update_state(state_req)

                # 3. Execute run (must fail validation)
                run = Run(
                    scraper_id=scraper.id,
                    collector_id=scraper.collector_id,
                    started_at=datetime.datetime.utcnow(),
                    status="RUNNING"
                )
                db.add(run)
                db.commit()
                run_id = run.id

                # Trigger run under failure
                fail_run_res = BrightDataService.run_collector(
                    collector_id=scraper.collector_id,
                    target_url=scraper.target_url,
                    schema=scraper.schema_definition,
                    scraper_id=scraper.id
                )
                
                run.completed_at = datetime.datetime.utcnow()
                run.records_count = len(fail_run_res["records"])
                
                # Check failure validation
                fail_val = OutputValidator.validate_records(
                    records=fail_run_res["records"],
                    schema=scraper.schema_definition,
                    expected_min_count=5
                )
                run.validation_status = fail_val
                
                if fail_val["success"]:
                    # If it succeeded under injected failure, there is a bug
                    raise Exception("Scraper succeeded when it should have failed validation.")
                
                run.status = "VALIDATION_FAILED"
                run.error = "Benchmark failure injection validation failed."
                db.commit()

                # 4. Trigger Healing
                attempt = HealerService.trigger_healing_process(db, scraper.id, run.id)

                if attempt.status == "SUCCESS":
                    status = "SUCCESS"
                    healed = True
                else:
                    error_msg = attempt.error or "Healing failed validation."

            except Exception as e:
                logger.error(f"Error in benchmark scenario '{scenario['name']}': {e}")
                error_msg = str(e)
            finally:
                duration = round(time.time() - start_time, 2)
                
                # Store benchmark run details
                bench_res = BenchmarkResult(
                    scenario_name=scenario["name"],
                    status=status,
                    duration=duration,
                    healed=healed,
                    error=error_msg,
                    run_id=run_id
                )
                db.add(bench_res)
                db.commit()
                results.append(bench_res)

        # Reset demo to normal at the end
        reset_demo()
        return results
