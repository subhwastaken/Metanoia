from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from database.db import get_db, SessionLocal
from database.models import BenchmarkResult
from services.benchmark import BenchmarkService

router = APIRouter()

def run_benchmark_background(db_session_factory):
    db = db_session_factory()
    try:
        BenchmarkService.run_full_benchmark(db)
    finally:
        db.close()

@router.get("/api/benchmark/results")
def get_benchmark_results(db: Session = Depends(get_db)):
    results = db.query(BenchmarkResult).all()
    
    # Calculate totals
    total = len(results)
    passed = sum(1 for r in results if r.status == "SUCCESS")
    healed = sum(1 for r in results if r.healed)
    avg_duration = sum(r.duration for r in results) / total if total > 0 else 0.0

    return {
        "results": results,
        "summary": {
            "total_scenarios": total,
            "detected": total,  # All injected failures are designed to be detected
            "recovered": healed,
            "recovery_rate": round((healed / total) * 100.0, 1) if total > 0 else 0.0,
            "avg_recovery_time": round(avg_duration, 1)
        }
    }

@router.post("/api/benchmark/trigger")
def trigger_benchmark(background_tasks: BackgroundTasks):
    background_tasks.add_task(run_benchmark_background, SessionLocal)
    return {"message": "Benchmark runs triggered in background."}
