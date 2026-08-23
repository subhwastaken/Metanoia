from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from database.db import get_db
from database.models import Scraper, Run, HealingAttempt
from services.brightdata import BrightDataService
from services.validator import OutputValidator
from services.healer import HealerService
from pydantic import BaseModel, HttpUrl
from typing import Dict, Any, List, Optional
import datetime
import uuid
import json
import logging

router = APIRouter()
logger = logging.getLogger("scrapeguard.routes.scrapers")

class ScraperCreate(BaseModel):
    name: str
    description: Optional[str] = None
    target_url: str
    collector_id: Optional[str] = None
    schema_definition: Dict[str, str]  # e.g., {"product_name": "string", "price": "number"}
    schedule: Optional[str] = "0 */6 * * *"
    auto_heal: Optional[bool] = True

class ScraperUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    target_url: Optional[str] = None
    collector_id: Optional[str] = None
    schema_definition: Optional[Dict[str, str]] = None
    schedule: Optional[str] = None
    status: Optional[str] = None

def run_scraper_execution(db_session_factory, scraper_id: str, auto_heal: bool = True):
    """
    Background worker that runs a scraper, validates it, and triggers healing if it fails.
    """
    db: Session = db_session_factory()
    try:
        scraper = db.query(Scraper).filter(Scraper.id == scraper_id).first()
        if not scraper:
            return

        # 1. Create Run entry
        run = Run(
            scraper_id=scraper.id,
            collector_id=scraper.collector_id,
            started_at=datetime.datetime.utcnow(),
            status="RUNNING"
        )
        db.add(run)
        db.commit()

        # Update scraper last run
        scraper.last_run = run.started_at
        db.commit()

        # 2. Get baseline average for validator
        success_runs = db.query(Run).filter(
            Run.scraper_id == scraper_id,
            Run.status == "SUCCESS"
        ).order_by(Run.completed_at.desc()).limit(5).all()
        
        hist_avg = None
        if success_runs:
            hist_avg = sum(r.records_count for r in success_runs) / len(success_runs)

        # 3. Call Bright Data
        res = BrightDataService.run_collector(
            collector_id=scraper.collector_id,
            target_url=scraper.target_url,
            schema=scraper.schema_definition,
            scraper_id=scraper.id,
            db=db
        )

        run.completed_at = datetime.datetime.utcnow()
        run.duration = (run.completed_at - run.started_at).total_seconds()

        # Handle cached response
        if res.get("cached"):
            run.status = "SUCCESS"
            run.cached = True
            run.records_count = len(res["records"])
            result_filename = f"run_{run.id}.json"
            HealerService._save_raw_result(result_filename, res["records"])
            run.raw_result_reference = result_filename
            run.validation_status = {"success": True, "cached": True}
            scraper.status = "HEALTHY"
            scraper.last_success = run.completed_at
            db.commit()
            _update_scraper_success_rate(db, scraper_id)
            db.commit()
            return

        if res["status"] != "SUCCESS":
            run.status = "FAILED"
            run.error = res["error"]
            scraper.status = "FAILING"
            db.commit()
            
            # Recalculate success rate
            _update_scraper_success_rate(db, scraper_id)
            db.commit()
            
            # If run failed completely and auto-heal is enabled, trigger healing
            if auto_heal:
                HealerService.trigger_healing_process(db, scraper_id, run.id)
            return

        records = res["records"]
        run.records_count = len(records)

        # Save raw result to local storage
        result_filename = f"run_{run.id}.json"
        HealerService._save_raw_result(result_filename, records)
        run.raw_result_reference = result_filename

        # 4. Validate
        val_res = OutputValidator.validate_records(
            records=records,
            schema=scraper.schema_definition,
            expected_min_count=1,
            historical_avg_count=int(hist_avg) if hist_avg else None
        )
        
        run.validation_status = val_res

        if val_res["success"]:
            run.status = "SUCCESS"
            scraper.status = "HEALTHY"
            scraper.last_success = datetime.datetime.utcnow()
            # Update cache with successful run
            BrightDataService.update_scraper_cache(db, scraper.id, records, res.get("hash"))
        else:
            run.status = "VALIDATION_FAILED"
            run.error = "Validation checks failed against contract."
            scraper.status = "FAILING"
            
        db.commit()

        # Recalculate success rate
        _update_scraper_success_rate(db, scraper_id)
        db.commit()

        # 5. Auto-Heal Trigger if validation failed
        if not val_res["success"] and auto_heal:
            HealerService.trigger_healing_process(db, scraper_id, run.id)

    except Exception as e:
        logger.error(f"Error in background scraper run: {e}")
    finally:
        db.close()

def _update_scraper_success_rate(db: Session, scraper_id: str):
    total = db.query(Run).filter(Run.scraper_id == scraper_id).count()
    if total == 0:
        return
    successes = db.query(Run).filter(
        Run.scraper_id == scraper_id,
        Run.status.in_(["SUCCESS", "HEALED"])
    ).count()
    scraper = db.query(Scraper).filter(Scraper.id == scraper_id).first()
    if scraper:
        scraper.success_rate = round((successes / total) * 100.0, 1)

@router.get("/api/scrapers")
def list_scrapers(db: Session = Depends(get_db)):
    scrapers = db.query(Scraper).all()
    return scrapers

@router.post("/api/scrapers")
def create_scraper(scraper_in: ScraperCreate, db: Session = Depends(get_db)):
    # Generate collector_id if missing to simulate real registry
    collector_id = scraper_in.collector_id or f"c_{uuid.uuid4().hex[:10]}"
    
    scraper = Scraper(
        name=scraper_in.name,
        description=scraper_in.description,
        target_url=scraper_in.target_url,
        collector_id=collector_id,
        schema_definition=scraper_in.schema_definition,
        schedule=scraper_in.schedule,
        status="HEALTHY"
    )
    db.add(scraper)
    db.commit()
    db.refresh(scraper)
    
    # Initialize mock selector mapping
    from services.brightdata import BrightDataService
    BrightDataService.reset_selectors(scraper_id=scraper.id)
    
    # Save initial version 1 to database selector history
    from database.models import SelectorVersion
    default_selectors = BrightDataService.get_selectors(scraper_id=scraper.id)
    new_sv = SelectorVersion(
        scraper_id=scraper.id,
        version=1,
        selectors=default_selectors,
        success_count=0
    )
    db.add(new_sv)
    db.commit()
    db.refresh(scraper)
    
    return scraper

@router.get("/api/scrapers/{scraper_id}")
def get_scraper(scraper_id: str, db: Session = Depends(get_db)):
    scraper = db.query(Scraper).filter(Scraper.id == scraper_id).first()
    if not scraper:
        raise HTTPException(status_code=404, detail="Scraper not found")
    return scraper

@router.put("/api/scrapers/{scraper_id}")
def update_scraper(scraper_id: str, scraper_in: ScraperUpdate, db: Session = Depends(get_db)):
    scraper = db.query(Scraper).filter(Scraper.id == scraper_id).first()
    if not scraper:
        raise HTTPException(status_code=404, detail="Scraper not found")
    
    update_data = scraper_in.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(scraper, field, value)
        
    db.commit()
    db.refresh(scraper)
    return scraper

@router.delete("/api/scrapers/{scraper_id}")
def delete_scraper(scraper_id: str, db: Session = Depends(get_db)):
    scraper = db.query(Scraper).filter(Scraper.id == scraper_id).first()
    if not scraper:
        raise HTTPException(status_code=404, detail="Scraper not found")
    
    db.delete(scraper)
    db.commit()
    return {"message": "Scraper deleted successfully"}

@router.post("/api/scrapers/{scraper_id}/run")
def trigger_scraper_run(scraper_id: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    scraper = db.query(Scraper).filter(Scraper.id == scraper_id).first()
    if not scraper:
        raise HTTPException(status_code=404, detail="Scraper not found")
        
    # Import session maker for background execution safely
    from database.db import SessionLocal
    background_tasks.add_task(run_scraper_execution, SessionLocal, scraper.id, True)
    
    return {"message": "Scraper run triggered in background", "status": scraper.status}

@router.post("/api/scrapers/{scraper_id}/heal")
def manual_heal_scraper(scraper_id: str, db: Session = Depends(get_db)):
    scraper = db.query(Scraper).filter(Scraper.id == scraper_id).first()
    if not scraper:
        raise HTTPException(status_code=404, detail="Scraper not found")
        
    # Get last failed run to recover
    last_failed_run = db.query(Run).filter(
        Run.scraper_id == scraper.id,
        Run.status.in_(["FAILED", "VALIDATION_FAILED"])
    ).order_by(Run.started_at.desc()).first()
    
    if not last_failed_run:
        raise HTTPException(status_code=400, detail="No failed runs available to trigger healing.")
        
    attempt = HealerService.trigger_healing_process(db, scraper.id, last_failed_run.id)
    return {
        "message": "Manual healing process finished",
        "attempt_status": attempt.status,
        "records_before": attempt.records_before,
        "records_after": attempt.records_after,
        "error": attempt.error
    }

class SelectorOverrideRequest(BaseModel):
    selectors: Dict[str, str]

@router.post("/api/scrapers/{scraper_id}/override")
def override_scraper_selectors(scraper_id: str, payload: SelectorOverrideRequest, db: Session = Depends(get_db)):
    scraper = db.query(Scraper).filter(Scraper.id == scraper_id).first()
    if not scraper:
        raise HTTPException(status_code=404, detail="Scraper not found")
        
    # Apply selectors to memory
    BrightDataService.set_selectors(payload.selectors, scraper_id=scraper.id)
    
    # Run collector to verify
    res = BrightDataService.run_collector(
        collector_id=scraper.collector_id,
        target_url=scraper.target_url,
        schema=scraper.schema_definition,
        scraper_id=scraper.id,
        db=db,
        bypass_cache=True
    )
    
    if res["status"] != "SUCCESS":
        raise HTTPException(status_code=400, detail=f"Scraper failed to run with these selectors: {res['error']}")
        
    # Validate output
    val_res = OutputValidator.validate_records(
        records=res["records"],
        schema=scraper.schema_definition
    )
    
    if not val_res["success"]:
        return {
            "status": "VALIDATION_FAILED",
            "validation": val_res,
            "error": "The test run did not pass validation contract checks."
        }
        
    # Validation succeeded! Save to version history
    scraper.status = "HEALTHY"
    scraper.current_version += 1
    scraper.last_success = datetime.datetime.utcnow()
    
    from database.models import SelectorVersion
    new_sv = SelectorVersion(
        scraper_id=scraper.id,
        version=scraper.current_version,
        selectors=payload.selectors,
        success_count=1
    )
    db.add(new_sv)
    db.commit()
    
    # Update cache
    BrightDataService.update_scraper_cache(db, scraper.id, res["records"], res.get("hash"))
    
    # Log manual recovery run
    run = Run(
        scraper_id=scraper.id,
        collector_id=scraper.collector_id,
        status="SUCCESS",
        records_count=len(res["records"]),
        raw_result_reference=f"run_override_{uuid.uuid4().hex[:6]}.json",
        validation_status=val_res,
        recovery_source="MANUAL_OVERRIDE"
    )
    db.add(run)
    db.commit()
    
    # Update success rate
    _update_scraper_success_rate(db, scraper.id)
    db.commit()
    
    return {
        "status": "HEALTHY",
        "message": "Manual override successful! Selectors updated and validated.",
        "version": scraper.current_version,
        "records": res["records"]
    }

@router.get("/api/scrapers/{scraper_id}/versions")
def get_scraper_versions(scraper_id: str, db: Session = Depends(get_db)):
    from database.models import SelectorVersion
    versions = db.query(SelectorVersion).filter(
        SelectorVersion.scraper_id == scraper_id
    ).order_by(SelectorVersion.version.desc()).all()
    return versions
