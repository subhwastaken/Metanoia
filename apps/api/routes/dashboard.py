from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database.db import get_db
from database.models import Scraper, Run, HealingAttempt
import datetime
from sqlalchemy import func

router = APIRouter()

@router.get("/api/dashboard/stats")
def get_dashboard_stats(db: Session = Depends(get_db)):
    # 1. Scraper counts
    total_scrapers = db.query(Scraper).count()
    healthy_scrapers = db.query(Scraper).filter(Scraper.status == "HEALTHY").count()
    failing_scrapers = db.query(Scraper).filter(Scraper.status == "FAILING").count()
    healing_scrapers = db.query(Scraper).filter(Scraper.status == "HEALING").count()
    escalated_scrapers = db.query(Scraper).filter(Scraper.status == "ESCALATED").count()

    # 2. Total runs & healing counts
    total_runs = db.query(Run).count()
    total_healed = db.query(Run).filter(Run.status == "HEALED").count()
    total_failed = db.query(Run).filter(Run.status.in_(["FAILED", "VALIDATION_FAILED"])).count()
    
    # 3. Platform success rate (Average scraper success rate)
    avg_success_rate = 100.0
    if total_scrapers > 0:
        rates = db.query(func.avg(Scraper.success_rate)).scalar()
        if rates is not None:
            avg_success_rate = round(float(rates), 1)

    # 4. Average recovery time (MTTR)
    avg_recovery_time = 0.0
    successful_heals = db.query(HealingAttempt).filter(
        HealingAttempt.status == "SUCCESS",
        HealingAttempt.completed_at.isnot(None),
        HealingAttempt.started_at.isnot(None)
    ).all()
    
    if successful_heals:
        durations = []
        for h in successful_heals:
            dur = (h.completed_at - h.started_at).total_seconds()
            durations.append(dur)
        avg_recovery_time = round(sum(durations) / len(durations), 1)

    # 5. Recent Activity Feed
    # Merge recent runs and recent healing attempts into a unified activity feed
    recent_runs = db.query(Run).order_by(Run.started_at.desc()).limit(10).all()
    recent_heals = db.query(HealingAttempt).order_by(HealingAttempt.started_at.desc()).limit(5).all()

    activity = []
    
    # Map runs to feed objects
    for r in recent_runs:
        scraper = db.query(Scraper).filter(Scraper.id == r.scraper_id).first()
        scraper_name = scraper.name if scraper else "Unknown Scraper"
        
        status_colors = {
            "RUNNING": "blue",
            "SUCCESS": "green",
            "FAILED": "red",
            "HEALING": "yellow",
            "HEALED": "purple",
            "VALIDATION_FAILED": "orange"
        }
        
        activity.append({
            "id": f"run_{r.id}",
            "type": "run",
            "scraper_name": scraper_name,
            "scraper_id": r.scraper_id,
            "status": r.status,
            "color": status_colors.get(r.status, "gray"),
            "timestamp": r.started_at.isoformat(),
            "details": f"Extraction completed. {r.records_count} records extracted." if r.status in ["SUCCESS", "HEALED"] else f"Run status: {r.status}."
        })

    # Map healing attempts to feed objects
    for h in recent_heals:
        scraper = db.query(Scraper).filter(Scraper.id == h.scraper_id).first()
        scraper_name = scraper.name if scraper else "Unknown Scraper"
        
        activity.append({
            "id": f"heal_{h.id}",
            "type": "healing",
            "scraper_name": scraper_name,
            "scraper_id": h.scraper_id,
            "status": h.status,
            "color": "yellow" if h.status in ["REQUESTED", "HEALING", "VALIDATING"] else ("green" if h.status == "SUCCESS" else "red"),
            "timestamp": h.started_at.isoformat(),
            "details": f"AI Self-Healing triggered. Restored {h.records_after} records." if h.status == "SUCCESS" else f"Healing attempt: {h.status}."
        })

    # Sort activity by timestamp desc
    activity.sort(key=lambda x: x["timestamp"], reverse=True)
    activity = activity[:10]

    # 6. Charting Data (Success rate trend & records count trend over last 7 days)
    # We can group by day for the last 7 days
    chart_data = []
    today = datetime.datetime.utcnow().date()
    for i in range(6, -1, -1):
        day = today - datetime.timedelta(days=i)
        day_start = datetime.datetime.combine(day, datetime.time.min)
        day_end = datetime.datetime.combine(day, datetime.time.max)

        day_runs = db.query(Run).filter(Run.started_at.between(day_start, day_end)).all()
        
        total_d = len(day_runs)
        success_d = sum(1 for r in day_runs if r.status in ["SUCCESS", "HEALED"])
        records_d = sum(r.records_count for r in day_runs)

        rate_d = round((success_d / total_d) * 100.0, 1) if total_d > 0 else 100.0

        chart_data.append({
            "date": day.strftime("%b %d"),
            "total_runs": total_d,
            "success_rate": rate_d,
            "records_count": records_d
        })

    # 7. Caching and recoveries stats
    total_cached_runs = db.query(Run).filter(Run.cached == True).count()
    local_version_recoveries = db.query(Run).filter(Run.recovery_source == "LOCAL_VERSION_RECOVERY").count()
    ai_healed_runs = db.query(Run).filter(Run.recovery_source == "AI_HEAL").count()
    manual_overrides = db.query(Run).filter(Run.recovery_source == "MANUAL_OVERRIDE").count()

    return {
        "stats": {
            "total_scrapers": total_scrapers,
            "healthy_scrapers": healthy_scrapers,
            "failing_scrapers": failing_scrapers,
            "healing_scrapers": healing_scrapers,
            "escalated_scrapers": escalated_scrapers,
            "total_runs": total_runs,
            "total_healed": total_healed,
            "total_failed": total_failed,
            "success_rate": avg_success_rate,
            "avg_recovery_time": avg_recovery_time,
            "total_cached_runs": total_cached_runs,
            "local_version_recoveries": local_version_recoveries,
            "ai_healed_runs": ai_healed_runs,
            "manual_overrides": manual_overrides
        },
        "activity": activity,
        "chart_data": chart_data
    }
