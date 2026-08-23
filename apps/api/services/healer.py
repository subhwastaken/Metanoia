import datetime
import json
import logging
import os
from typing import Dict, List
from sqlalchemy.orm import Session
from database.models import Scraper, Run, HealingAttempt
from .brightdata import BrightDataService
from .detector import FailureDetector
from .validator import OutputValidator

logger = logging.getLogger("scrapeguard.healer")

MAX_HEAL_ATTEMPTS = 2

class HealerService:
    @classmethod
    def calculate_confidence_score(cls, validation_result: Dict = None, historical_avg: float = None) -> int:
        """
        Calculates a repair confidence score (0-100%) based primarily on post-repair validation.
        - 90-100%: Automatic recovery accepted.
        - 70-89%: Recovery accepted but flagged for review.
        - <70%: Escalate to human review.
        """
        if not validation_result or not validation_result.get("success", False):
            return 30  # Default failure score

        score = 70  # Base score for passing validation
        
        summary = validation_result.get("summary", {})
        fields_presence = summary.get("fields_presence", {})
        fields_type_valid = summary.get("fields_type_valid", {})
        total_records = summary.get("total_records", 0)

        # 1. Field completeness bonus (up to 10%)
        # If all fields have 100% presence, add 10%
        if fields_presence:
            avg_presence = sum(fields_presence.values()) / len(fields_presence)
            score += int(avg_presence * 10)

        # 2. Schema validity bonus (up to 10%)
        # If all types are 100% valid, add 10%
        if fields_type_valid:
            avg_type_valid = sum(fields_type_valid.values()) / len(fields_type_valid)
            score += int(avg_type_valid * 10)

        # 3. Historical count recovery bonus (up to 10%)
        if historical_avg is not None and historical_avg > 0:
            count_ratio = min(total_records, historical_avg) / max(total_records, historical_avg)
            score += int(count_ratio * 10)
        else:
            # If no history, give a static 5% bonus for having records
            if total_records > 0:
                score += 5

        return min(max(score, 0), 100)

    @classmethod
    def trigger_healing_process(
        cls,
        db: Session,
        scraper_id: str,
        failed_run_id: str
    ) -> HealingAttempt:
        """
        Orchestrates the healing lifecycle.
        - Generates failure diagnostics
        - Triggers Bright Data healing
        - Reruns scraper collector
        - Validates new output
        - Updates DB states
        """
        scraper = db.query(Scraper).filter(Scraper.id == scraper_id).first()
        failed_run = db.query(Run).filter(Run.id == failed_run_id).first()

        if not scraper or not failed_run:
            logger.error(f"Cannot heal: Scraper {scraper_id} or Run {failed_run_id} not found.")
            raise ValueError("Scraper or Run not found")

        # 1. Fetch previous successful runs to establish average record count baseline
        success_runs = db.query(Run).filter(
            Run.scraper_id == scraper_id,
            Run.status == "SUCCESS"
        ).order_by(Run.completed_at.desc()).limit(5).all()
        
        hist_avg = None
        if success_runs:
            hist_avg = sum(r.records_count for r in success_runs) / len(success_runs)

        # 2. Perform failure detection on the failed run's results
        # We need the raw results from the failed run. Since it failed, validation_status is populated
        val_status = failed_run.validation_status or {}
        
        failure_description = FailureDetector.generate_diagnostic_summary(
            scraper.name,
            scraper.collector_id or "c_mock",
            scraper.schema_definition,
            val_status
        )

        # 3. Record Healing Attempt
        attempt = HealingAttempt(
            scraper_id=scraper.id,
            run_id=failed_run.id,
            status="HEALING",
            failure_description=failure_description,
            collector_id=scraper.collector_id,
            records_before=failed_run.records_count,
            started_at=datetime.datetime.utcnow()
        )
        db.add(attempt)
        failed_run.status = "HEALING"
        scraper.status = "HEALING"
        db.commit()

        # 3.5. Try Local Selector Version Recovery first
        from database.models import SelectorVersion
        # Fetch previous versions, ordering by success_count desc (most successful first)
        historical_versions = db.query(SelectorVersion).filter(
            SelectorVersion.scraper_id == scraper_id
        ).order_by(SelectorVersion.success_count.desc(), SelectorVersion.version.desc()).all()
        
        local_healed = False
        healed_selectors = None
        healed_version_obj = None
        test_run_res = None
        test_val_res = None
        
        # Keep track of active selectors so we can restore if all else fails
        original_selectors = dict(BrightDataService.get_selectors(scraper_id=scraper.id))

        for hv in historical_versions:
            # Skip if they match current active selectors
            if hv.selectors == original_selectors:
                continue
                
            logger.info(f"Attempting local selector recovery using version {hv.version} for scraper {scraper_id}...")
            # Temporarily apply historical selectors
            BrightDataService.set_selectors(hv.selectors, scraper_id=scraper.id)
            
            # Execute test run using this selector set (bypassing pre-flight cache)
            test_run_res = BrightDataService.run_collector(
                collector_id=scraper.collector_id,
                target_url=scraper.target_url,
                schema=scraper.schema_definition,
                scraper_id=scraper.id,
                db=db,
                bypass_cache=True
            )
            
            if test_run_res["status"] == "SUCCESS":
                # Validate the results of this trial
                test_val_res = OutputValidator.validate_records(
                    records=test_run_res["records"],
                    schema=scraper.schema_definition,
                    expected_min_count=1,
                    historical_avg_count=int(hist_avg) if hist_avg else None
                )
                if test_val_res["success"]:
                    logger.info(f"Local selector recovery SUCCESS using version {hv.version}!")
                    local_healed = True
                    healed_selectors = hv.selectors
                    healed_version_obj = hv
                    hv.success_count += 1
                    break
                    
        if local_healed and test_run_res and test_val_res and healed_version_obj:
            # Found working historical selectors! Update db states
            attempt.status = "SUCCESS"
            attempt.completed_at = datetime.datetime.utcnow()
            attempt.error = None
            attempt.records_after = len(test_run_res["records"])
            attempt.validation_result = test_val_res
            
            failed_run.status = "HEALED"
            failed_run.completed_at = datetime.datetime.utcnow()
            failed_run.records_count = len(test_run_res["records"])
            failed_run.validation_status = test_val_res
            failed_run.recovery_source = "LOCAL_VERSION_RECOVERY"
            failed_run.duration = (failed_run.completed_at - failed_run.started_at).total_seconds()
            
            result_filename = f"run_{failed_run.id}_healed.json"
            cls._save_raw_result(result_filename, test_run_res["records"])
            failed_run.raw_result_reference = result_filename
            
            scraper.status = "HEALTHY"
            scraper.current_version = healed_version_obj.version
            scraper.last_success = datetime.datetime.utcnow()
            scraper.last_run = datetime.datetime.utcnow()
            
            # Cache the successful run
            BrightDataService.update_scraper_cache(db, scraper.id, test_run_res["records"], test_run_res.get("hash"))
            
            # Perform cross-scraper correlation
            cls.correlate_scrapers_selector_update(db, scraper_id, healed_selectors)
            
            cls._update_scraper_success_rate(db, scraper_id)
            db.commit()
            return attempt

        # Restore original selectors if local healing failed
        BrightDataService.set_selectors(original_selectors, scraper_id=scraper.id)

        # 4. Invoke Bright Data CLI / API to heal (Fallback with retry)
        last_error = None
        new_val_res = None

        for heal_attempt in range(1, MAX_HEAL_ATTEMPTS + 1):
            if heal_attempt > 1:
                logger.info(f"Retrying AI heal (attempt {heal_attempt}/{MAX_HEAL_ATTEMPTS})...")

            heal_res = BrightDataService.heal_collector(
                collector_id=scraper.collector_id,
                failure_description=failure_description,
                scraper_id=scraper.id
            )

            if heal_res["status"] != "SUCCESS":
                last_error = f"Bright Data CLI Healing failed: {heal_res['error']}"
                continue

            attempt.status = "VALIDATING"
            db.commit()

            run_res = BrightDataService.run_collector(
                collector_id=scraper.collector_id,
                target_url=scraper.target_url,
                schema=scraper.schema_definition,
                scraper_id=scraper.id,
                db=db,
                bypass_cache=True
            )

            if run_res["status"] != "SUCCESS":
                last_error = f"Healed collector failed to run: {run_res['error']}"
                continue

            new_records = run_res["records"]
            attempt.records_after = len(new_records)

            new_val_res = OutputValidator.validate_records(
                records=new_records,
                schema=scraper.schema_definition,
                expected_min_count=1,
                historical_avg_count=int(hist_avg) if hist_avg else None
            )

            attempt.validation_result = new_val_res
            attempt.completed_at = datetime.datetime.utcnow()

            if new_val_res["success"]:
                attempt.status = "SUCCESS"

                scraper.status = "HEALTHY"
                scraper.last_success = datetime.datetime.utcnow()
                scraper.last_run = datetime.datetime.utcnow()
                scraper.current_version += 1

                failed_run.status = "HEALED"
                failed_run.recovery_source = "AI_HEAL"
                failed_run.records_count = len(new_records)
                failed_run.validation_status = new_val_res
                failed_run.completed_at = datetime.datetime.utcnow()
                failed_run.duration = (failed_run.completed_at - failed_run.started_at).total_seconds()

                result_filename = f"run_{failed_run.id}_healed.json"
                cls._save_raw_result(result_filename, new_records)
                failed_run.raw_result_reference = result_filename

                new_selectors = BrightDataService.get_selectors(scraper_id=scraper.id)
                new_sv = SelectorVersion(
                    scraper_id=scraper.id,
                    version=scraper.current_version,
                    selectors=new_selectors,
                    success_count=1
                )
                db.add(new_sv)

                BrightDataService.update_scraper_cache(db, scraper.id, new_records, run_res.get("hash"))
                cls.correlate_scrapers_selector_update(db, scraper.id, new_selectors)

                confidence = cls.calculate_confidence_score(new_val_res, hist_avg)
                logger.info(f"Scraper {scraper.name} healed successfully with confidence {confidence}%")

                cls._update_scraper_success_rate(db, scraper_id)
                db.commit()
                return attempt

            last_error = "Post-healing validation failed. Structure is still incorrect."

        # All heal attempts exhausted
        attempt.status = "FAILED"
        attempt.error = last_error or "All healing attempts failed."
        attempt.completed_at = datetime.datetime.utcnow()
        if new_val_res:
            attempt.validation_result = new_val_res

        failed_run.status = "VALIDATION_FAILED"
        failed_run.error = attempt.error
        if new_val_res:
            failed_run.validation_status = new_val_res
        failed_run.completed_at = datetime.datetime.utcnow()
        failed_run.duration = (failed_run.completed_at - failed_run.started_at).total_seconds()

        scraper.status = "ESCALATED"

        cls._update_scraper_success_rate(db, scraper_id)
        db.commit()
        return attempt

    @classmethod
    def correlate_scrapers_selector_update(cls, db: Session, healed_scraper_id: str, new_selectors: Dict[str, str]):
        """
        Cross-scraper correlation:
        Finds other scrapers targeting similar domains or patterns that are currently FAILING or ESCALATED,
        and pre-emptively updates their selectors to the newly healed selectors to restore their health.
        """
        from database.models import Scraper, SelectorVersion
        from urllib.parse import urlparse
        
        healed_scraper = db.query(Scraper).filter(Scraper.id == healed_scraper_id).first()
        if not healed_scraper:
            return
            
        try:
            healed_domain = urlparse(healed_scraper.target_url).netloc
            if not healed_domain:
                return
                
            # Find scrapers with similar domains that are NOT healthy
            correlated_scrapers = db.query(Scraper).filter(
                Scraper.id != healed_scraper_id,
                Scraper.status.in_(["FAILING", "ESCALATED", "VALIDATION_FAILED"])
            ).all()
            
            for cs in correlated_scrapers:
                cs_domain = urlparse(cs.target_url).netloc
                if cs_domain == healed_domain:
                    logger.info(f"Cross-scraper correlation: Pre-emptively healing scraper {cs.id} ('{cs.name}') using selectors from {healed_scraper_id}")
                    
                    # Update selectors locally
                    BrightDataService.set_selectors(new_selectors, scraper_id=cs.id)
                    
                    # Save version
                    cs.current_version += 1
                    new_sv = SelectorVersion(
                        scraper_id=cs.id,
                        version=cs.current_version,
                        selectors=new_selectors,
                        success_count=1
                    )
                    db.add(new_sv)
                    
                    # Update status
                    cs.status = "HEALTHY"
                    db.commit()
        except Exception as e:
            logger.error(f"Error in cross-scraper correlation: {str(e)}")

    @classmethod
    def _save_raw_result(cls, filename: str, data: List[Dict]):
        # Save to local storage folder for runs
        os.makedirs("storage/runs", exist_ok=True)
        filepath = os.path.join("storage/runs", filename)
        with open(filepath, "w") as f:
            json.dump(data, f, indent=2)

    @classmethod
    def _update_scraper_success_rate(cls, db: Session, scraper_id: str):
        scraper = db.query(Scraper).filter(Scraper.id == scraper_id).first()
        if not scraper:
            return

        total_runs = db.query(Run).filter(Run.scraper_id == scraper_id).count()
        if total_runs == 0:
            scraper.success_rate = 100.0
            return

        # SUCCESS and HEALED count as successful outputs in the end-to-end reliability pipeline
        successful_runs = db.query(Run).filter(
            Run.scraper_id == scraper_id,
            Run.status.in_(["SUCCESS", "HEALED"])
        ).count()

        scraper.success_rate = round((successful_runs / total_runs) * 100.0, 1)
