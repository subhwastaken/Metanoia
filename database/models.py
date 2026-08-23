import datetime
import uuid
from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, JSON, Boolean, Text
from sqlalchemy.orm import relationship
from .db import Base

class Scraper(Base):
    __tablename__ = "scrapers"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    target_url = Column(String, nullable=False)
    collector_id = Column(String, nullable=True)
    schedule = Column(String, default="0 */6 * * *")  # cron format, defaults to every 6 hours
    status = Column(String, default="HEALTHY")  # HEALTHY, FAILING, HEALING, ESCALATED
    schema_definition = Column(JSON, nullable=False)  # {"field_name": "type"}
    last_run = Column(DateTime, nullable=True)
    last_success = Column(DateTime, nullable=True)
    success_rate = Column(Float, default=100.0)
    current_version = Column(Integer, default=1)
    last_html_hash = Column(String, nullable=True)
    cached_records = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    # Relationships
    runs = relationship("Run", back_populates="scraper", cascade="all, delete-orphan")
    healing_attempts = relationship("HealingAttempt", back_populates="scraper", cascade="all, delete-orphan")
    selector_versions = relationship("SelectorVersion", back_populates="scraper", cascade="all, delete-orphan")

class Run(Base):
    __tablename__ = "runs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    scraper_id = Column(String, ForeignKey("scrapers.id"), nullable=False)
    collector_id = Column(String, nullable=True)
    started_at = Column(DateTime, default=datetime.datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    duration = Column(Float, nullable=True)  # in seconds
    status = Column(String, default="RUNNING")  # RUNNING, SUCCESS, FAILED, HEALING, HEALED, VALIDATION_FAILED
    records_count = Column(Integer, default=0)
    raw_result_reference = Column(Text, nullable=True)  # Path/filename where raw JSON is stored
    validation_status = Column(JSON, nullable=True)  # Detailed validation check results
    error = Column(Text, nullable=True)
    cached = Column(Boolean, default=False)
    recovery_source = Column(String, default="NONE")  # NONE, LOCAL_VERSION_RECOVERY, AI_HEAL

    # Relationships
    scraper = relationship("Scraper", back_populates="runs")
    healing_attempts = relationship("HealingAttempt", back_populates="run", cascade="all, delete-orphan")

class HealingAttempt(Base):
    __tablename__ = "healing_attempts"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    scraper_id = Column(String, ForeignKey("scrapers.id"), nullable=False)
    run_id = Column(String, ForeignKey("runs.id"), nullable=False)
    started_at = Column(DateTime, default=datetime.datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    status = Column(String, default="REQUESTED")  # REQUESTED, HEALING, VALIDATING, SUCCESS, FAILED, ESCALATED
    failure_description = Column(Text, nullable=True)
    collector_id = Column(String, nullable=True)
    records_before = Column(Integer, default=0)
    records_after = Column(Integer, default=0)
    validation_result = Column(JSON, nullable=True)
    error = Column(Text, nullable=True)

    # Relationships
    scraper = relationship("Scraper", back_populates="healing_attempts")
    run = relationship("Run", back_populates="healing_attempts")

class SelectorVersion(Base):
    __tablename__ = "selector_versions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    scraper_id = Column(String, ForeignKey("scrapers.id"), nullable=False)
    version = Column(Integer, default=1)
    selectors = Column(JSON, nullable=False)
    success_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    scraper = relationship("Scraper", back_populates="selector_versions")

class BenchmarkResult(Base):
    __tablename__ = "benchmark_results"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    scenario_name = Column(String, nullable=False)
    status = Column(String, nullable=False)  # SUCCESS, FAILED
    duration = Column(Float, nullable=False)  # in seconds
    healed = Column(Boolean, default=False)
    error = Column(Text, nullable=True)
    run_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
