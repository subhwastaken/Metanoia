import os
import sys
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from dotenv import load_dotenv

# Load env variables from apps/web/.env
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "web", ".env"))

# Append current directory to path to resolve imports correctly
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from database.db import init_db
from routes import scrapers, runs, healing, dashboard, demo, benchmark, agent

app = FastAPI(
    title="ScrapeGuard API Engine",
    description="Autonomous web scraper reliability, monitoring, and self-healing orchestration layer.",
    version="1.0.0"
)

# Enable CORS for Next.js frontend app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Set to specific origins like ["http://localhost:3000"] in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database on startup
@app.on_event("startup")
def startup_event():
    init_db()
    print("ScrapeGuard database initialized successfully.")

# Register routers
app.include_router(scrapers.router)
app.include_router(runs.router)
app.include_router(healing.router)
app.include_router(dashboard.router)
app.include_router(demo.router)
app.include_router(benchmark.router)
app.include_router(agent.router)

import datetime

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "mode": "simulation" if os.getenv("MOCK_BRIGHTDATA", "true").lower() == "true" else "production"
    }

if __name__ == "__main__":
    # Create required storage directories
    os.makedirs("storage/runs", exist_ok=True)
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
