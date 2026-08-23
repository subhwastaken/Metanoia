from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database.db import get_db
from database.models import Scraper
from services.agent import JobIntelligenceAgent
from pydantic import BaseModel
from typing import Dict, Any, List, Optional

router = APIRouter(prefix="/api/agent", tags=["agent"])

class AgentSearchRequest(BaseModel):
    prompt: str
    collector_id: Optional[str] = None # Optional fallback or custom collector

@router.post("/search")
def run_agent_search(req: AgentSearchRequest, db: Session = Depends(get_db)):
    """
    Triggers the AI prompt-to-scrape job pipeline.
    """
    if not req.prompt:
        raise HTTPException(status_code=400, detail="Prompt is required")

    logs = []
    
    # 1. Resolve collector_id
    # Default to the first registered scraper's collector_id if not provided
    collector_id = req.collector_id
    if not collector_id:
        scraper = db.query(Scraper).order_by(Scraper.created_at.desc()).first()
        if scraper and scraper.collector_id:
            collector_id = scraper.collector_id
        else:
            # Fallback to standard collector ID
            collector_id = "c_mt5i3fgp1lr8g2zt83"
    
    logs.append(f"🔍 Initializing search using collector ID: {collector_id}")

    # 2. Step 1: Parse Prompt using LLM
    logs.append("🧠 Step 1: LLM Planner analyzing search intent and parsing criteria...")
    intent = JobIntelligenceAgent.parse_prompt(req.prompt)
    logs.append(f"✅ Extracted criteria: Location={intent.get('location')}, Keywords={intent.get('keywords')}")
    logs.append(f"👉 Formulated search query: \"{intent.get('search_query')}\"")

    # 3. Step 2: Google Search target URLs
    logs.append("🌐 Step 2: Dispatched Google Search query via Bright Data SERP API...")
    target_urls = JobIntelligenceAgent.run_google_search(intent.get("search_query"))
    
    if target_urls:
        logs.append(f"✅ Discovered {len(target_urls)} target portals: {', '.join(target_urls)}")
    else:
        logs.append("⚠️ Google Search returned no results. Using fallback channels.")
        target_urls = ["https://www.ycombinator.com/jobs"]

    # 4. Step 3 & 4: Scrape the URLs and synthesize jobs
    logs.append(f"🕷️ Step 3: Triggering Bright Data browser clusters to scrape target URLs...")
    jobs = JobIntelligenceAgent.scrape_and_synthesize(target_urls, intent, collector_id)
    logs.append("📝 Step 4: LLM parsing completed. De-duplicating and formatting listings...")

    logs.append(f"🎉 Completed! Synthesized {len(jobs)} matching job listings.")

    return {
        "success": True,
        "logs": logs,
        "intent": intent,
        "jobs": jobs
    }
