from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database.db import get_db
from database.models import Run
import os
import json

router = APIRouter()

@router.get("/api/scrapers/{scraper_id}/runs")
def list_scraper_runs(scraper_id: str, db: Session = Depends(get_db)):
    runs = db.query(Run).filter(Run.scraper_id == scraper_id).order_by(Run.started_at.desc()).all()
    return runs

@router.get("/api/runs/{run_id}")
def get_run_detail(run_id: str, db: Session = Depends(get_db)):
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run

@router.get("/api/runs/{run_id}/data")
def get_run_data(run_id: str, db: Session = Depends(get_db)):
    """
    Returns the raw extracted JSON records for a run from the storage file.
    """
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
        
    if not run.raw_result_reference:
        return []
        
    filepath = os.path.join("storage/runs", run.raw_result_reference)
    if not os.path.exists(filepath):
        return []
        
    try:
        with open(filepath, "r") as f:
            records = json.load(f)
        return records
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read raw data: {str(e)}")
