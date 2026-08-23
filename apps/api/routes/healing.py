from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database.db import get_db
from database.models import HealingAttempt

router = APIRouter()

@router.get("/api/scrapers/{scraper_id}/healing")
def list_scraper_healing_attempts(scraper_id: str, db: Session = Depends(get_db)):
    attempts = db.query(HealingAttempt).filter(
        HealingAttempt.scraper_id == scraper_id
    ).order_by(HealingAttempt.started_at.desc()).all()
    return attempts

@router.get("/api/healing/{attempt_id}")
def get_healing_attempt_detail(attempt_id: str, db: Session = Depends(get_db)):
    attempt = db.query(HealingAttempt).filter(HealingAttempt.id == attempt_id).first()
    if not attempt:
        raise HTTPException(status_code=404, detail="Healing attempt not found")
    return attempt

@router.get("/api/healing")
def list_all_healing_attempts(db: Session = Depends(get_db)):
    attempts = db.query(HealingAttempt).order_by(HealingAttempt.started_at.desc()).all()
    return attempts
