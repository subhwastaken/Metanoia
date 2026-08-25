import os
import subprocess
import json
import httpx
import logging
from typing import Dict, Any, List, Optional
from urllib.parse import urlparse

logger = logging.getLogger("scrapeguard.brightdata")

# Simulated selector store to demonstrate selector-based healing locally
# Format: { scraper_id_or_collector_id: { field_name: selector_definition } }
SIMULATED_SELECTORS = {}

class BrightDataService:
    @classmethod
    def is_mock_mode(cls) -> bool:
        # Default to mock/simulation mode if Bright Data credentials are not set
        api_key = os.getenv("BRIGHTDATA_API_KEY")
        # Or if explicitly requested in environment variables
        mock_env = os.getenv("MOCK_BRIGHTDATA", "true").lower() == "true"
        return not api_key or mock_env

    @classmethod
    def compute_page_hash(cls, url: str) -> Optional[str]:
        """
        Computes a SHA256 hash of the target webpage content to determine structural layout changes.
        """
        try:
            import hashlib
            if cls.is_mock_mode():
                # In simulation mode, fetch the local catalog mock raw endpoint
                local_url = "http://127.0.0.1:8000/api/demo/catalog-raw"
                try:
                    response = httpx.get(local_url, timeout=5.0)
                    if response.status_code == 200:
                        return hashlib.sha256(response.content).hexdigest()
                except Exception:
                    # Local server is offline (e.g. during test run), fallback to stable hash of the URL
                    return hashlib.sha256(url.encode('utf-8')).hexdigest()
            else:
                response = httpx.get(url, timeout=10.0, follow_redirects=True)
                if response.status_code == 200:
                    return hashlib.sha256(response.content).hexdigest()
        except Exception as e:
            logger.error(f"Error computing page hash: {str(e)}")
        return None

    @classmethod
    def update_scraper_cache(cls, db, scraper_id: str, records: List[Dict[str, Any]], html_hash: str):
        """
        Helper to save successfully validated extraction results and their HTML hash.
        """
        if not html_hash or not db:
            return
        from database.models import Scraper
        scraper = db.query(Scraper).filter(Scraper.id == scraper_id).first()
        if scraper:
            scraper.last_html_hash = html_hash
            scraper.cached_records = records
            db.commit()

    @classmethod
    def run_collector(
        cls,
        collector_id: str,
        target_url: str,
        schema: Dict[str, str],
        scraper_id: str = None,
        db = None,
        bypass_cache: bool = False
    ) -> Dict[str, Any]:
        """
        Executes a scraper collector against a target URL, performing a pre-flight cache hit check first.
        """
        current_hash = None
        
        # 1. Pre-flight Cache Check
        if db and scraper_id and not bypass_cache:
            from database.models import Scraper
            scraper = db.query(Scraper).filter(Scraper.id == scraper_id).first()
            if scraper and scraper.last_html_hash and scraper.cached_records:
                current_hash = cls.compute_page_hash(target_url)
                if current_hash and current_hash == scraper.last_html_hash:
                    logger.info(f"Pre-flight Cache HIT for scraper {scraper_id}. Serving cached records (0 compute cost).")
                    return {
                        "status": "SUCCESS",
                        "records": scraper.cached_records,
                        "error": None,
                        "cached": True,
                        "hash": current_hash
                    }

        # 2. Cache Miss: Execute run
        if cls.is_mock_mode():
            res = cls._run_simulated_collector(collector_id, target_url, schema, scraper_id, db=db)
        else:
            res = cls._run_real_collector(collector_id, target_url)

        # 3. Compute and attach hash details
        if not current_hash:
            current_hash = cls.compute_page_hash(target_url)
            
        res["hash"] = current_hash
        res["cached"] = False
        return res

    @classmethod
    def _run_real_collector(cls, collector_id: str, target_url: str) -> Dict[str, Any]:
        """
        Runs a real Bright Data collector using their CLI or Collection API.
        """
        logger.info(f"Triggering real Bright Data collector {collector_id} for URL {target_url}")
        
        # 1. Option A: Try running via the Collection API (Trigger Immediate)
        api_key = os.getenv("BRIGHTDATA_API_KEY")
        
        if api_key:
            try:
                # Bright Data DCA Endpoint: POST https://api.brightdata.com/dca/trigger_immediate
                url = "https://api.brightdata.com/dca/trigger_immediate"
                headers = {
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                }
                payload = {
                    "collector": collector_id,
                    "input": [{"url": target_url}]
                }
                
                response = httpx.post(url, headers=headers, json=payload, timeout=60.0)
                if response.status_code == 200:
                    records = response.json()
                    # Some responses are wrapped inside output containers
                    if isinstance(records, dict) and "output" in records:
                        records = records["output"]
                    if not isinstance(records, list):
                        records = [records]
                    
                    return {
                        "status": "SUCCESS",
                        "records": records,
                        "error": None
                    }
                else:
                    return {
                        "status": "FAILED",
                        "records": [],
                        "error": f"Bright Data API Error (Status {response.status_code}): {response.text}"
                    }
            except Exception as e:
                logger.error(f"Failed to run via API, falling back to CLI: {e}")

        # 2. Option B: Fallback/Alternative via CLI
        try:
            # Command: bdata scraper run <collector_id> -u <url>
            # We fetch raw stdout as JSON
            cmd = ["npx", "-p", "@brightdata/cli", "brightdata", "scraper", "run", collector_id, "-u", target_url, "--format", "json"]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
            
            if result.returncode == 0:
                try:
                    records = json.loads(result.stdout)
                    if not isinstance(records, list):
                        records = [records]
                    return {
                        "status": "SUCCESS",
                        "records": records,
                        "error": None
                    }
                except json.JSONDecodeError:
                    return {
                        "status": "FAILED",
                        "records": [],
                        "error": f"Failed to parse JSON from CLI stdout: {result.stdout[:200]}"
                    }
            else:
                return {
                    "status": "FAILED",
                    "records": [],
                    "error": f"CLI error: {result.stderr or result.stdout}"
                }
        except Exception as e:
            return {
                "status": "FAILED",
                "records": [],
                "error": f"System error calling CLI: {str(e)}"
            }

    @classmethod
    def heal_collector(
        cls,
        collector_id: str,
        failure_description: str,
        scraper_id: str = None
    ) -> Dict[str, Any]:
        """
        Triggers AI self-healing on a collector.
        """
        if cls.is_mock_mode():
            return cls._heal_simulated_collector(collector_id, failure_description, scraper_id)
        
        return cls._heal_real_collector(collector_id, failure_description)

    @classmethod
    def _heal_real_collector(cls, collector_id: str, failure_description: str) -> Dict[str, Any]:
        """
        Calls Bright Data CLI command to heal the collector.
        """
        try:
            logger.info(f"Triggering real Bright Data CLI heal for collector {collector_id}")
            cmd = ["npx", "-p", "@brightdata/cli", "brightdata", "scraper", "heal", collector_id, "--message", failure_description]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
            
            if result.returncode == 0:
                # Approve the heals automatically
                approve_cmd = ["npx", "-p", "@brightdata/cli", "brightdata", "scraper", "approve", collector_id]
                subprocess.run(approve_cmd, capture_output=True, text=True, timeout=30)
                
                return {
                    "status": "SUCCESS",
                    "error": None,
                    "logs": result.stdout
                }
            else:
                return {
                    "status": "FAILED",
                    "error": result.stderr or result.stdout,
                    "logs": result.stdout
                }
        except Exception as e:
            return {
                "status": "FAILED",
                "error": f"System error calling heal CLI: {str(e)}",
                "logs": ""
            }

    # --- SIMULATOR MODE LOGIC ---
    
    @classmethod
    def _run_simulated_collector(
        cls,
        collector_id: str,
        target_url: str,
        schema: Dict[str, str],
        scraper_id: str = None,
        db = None
    ) -> Dict[str, Any]:
        """
        Simulated scraper run. Fetches the page content (from our local mock catalog)
        and parses it using selectors stored in SIMULATED_SELECTORS.
        """
        key = scraper_id or collector_id or "default"
        
        # Initialize default selectors if not set
        if key not in SIMULATED_SELECTORS:
            # Try to load latest selectors from database
            if db and scraper_id:
                try:
                    from database.models import SelectorVersion
                    latest_sv = db.query(SelectorVersion).filter(
                        SelectorVersion.scraper_id == scraper_id
                    ).order_by(SelectorVersion.version.desc()).first()
                    if latest_sv:
                        SIMULATED_SELECTORS[key] = latest_sv.selectors
                except Exception as e:
                    logger.error(f"Failed to load selectors from DB: {e}")

            if key not in SIMULATED_SELECTORS:
                sels = {}
                for field in schema:
                    if field == "product_name": sels[field] = ".product-title"
                    elif field == "price": sels[field] = ".product-price"
                    elif field == "currency": sels[field] = ".product-currency"
                    elif field == "availability": sels[field] = ".product-stock"
                    elif field == "product_url": sels[field] = ".product-link"
                    else: sels[field] = f".{field}"
                SIMULATED_SELECTORS[key] = sels

        selectors = SIMULATED_SELECTORS[key]
        logger.info(f"Running simulated scraper run for {key} with selectors: {selectors}")

        try:
            # Check target url. If it is pointing to our mock catalog API, fetch it
            # Otherwise we mock a static response
            if "localhost" in target_url or "127.0.0.1" in target_url or "/demo-site" in target_url or "/api/demo" in target_url:
                try:
                    # Let's request the endpoint from our local server
                    # If target url points to html demo site, redirect to raw JSON catalog data
                    request_url = target_url
                    if "/demo-site" in request_url:
                        request_url = request_url.replace("/demo-site", "/api/demo/catalog-raw")
                    response = httpx.get(request_url, timeout=10.0)
                    if response.status_code == 200:
                        # The mock demo site returns structured mock HTML,
                        # but it also returns a JSON config of its *current* structure state so we can simulate CSS renaming!
                        data = response.json()
                        raw_items = data.get("items", [])
                        current_dom_classes = data.get("dom_classes", {})
                        
                        # Apply parsing logic based on selectors compared to the current DOM classes
                        parsed_records = []
                        for item in raw_items:
                            record = {}
                            for field in schema:
                                # Map schema field to CSS selector
                                selector = selectors.get(field, "")
                                expected_class = f".{current_dom_classes.get(field, 'invalid-class')}"
                                if selector == expected_class:
                                    # Success match
                                    val = item.get(field)
                                    # Simulate type casting based on schema
                                    if schema[field] == "number" and isinstance(val, str):
                                        try:
                                            # Clean currency symbol if any
                                            clean_val = val.replace("$", "").replace(",", "").strip()
                                            record[field] = float(clean_val)
                                        except Exception:
                                            record[field] = val
                                    else:
                                        record[field] = val
                                else:
                                    # Failure: Website class changed, selector broke!
                                    record[field] = None
                                    
                            parsed_records.append(record)
                            
                        return {
                            "status": "SUCCESS",
                            "records": parsed_records,
                            "error": None
                        }
                except Exception as e:
                    logger.error(f"Failed to query local mock catalog: {e}")
            
            # Static mock fallback if not running local demo site URL
            static_records = [
                {"product_name": "Premium Keyboard", "price": 129.99, "currency": "USD", "availability": "In Stock", "product_url": "https://example.com/item/1"},
                {"product_name": "Wireless Mouse", "price": 49.99, "currency": "USD", "availability": "In Stock", "product_url": "https://example.com/item/2"},
                {"product_name": "USB-C Hub", "price": 35.00, "currency": "USD", "availability": "Low Stock", "product_url": "https://example.com/item/3"},
            ]
            
            # Filter through simulated selectors
            filtered = []
            for idx, item in enumerate(static_records):
                record = {}
                for field in schema:
                    # If selector is present, assume it extracts it. Otherwise it is null
                    if field in selectors and not selectors[field].startswith(".broken"):
                        val = item.get(field)
                        if val is None:
                            expected_type = schema[field]
                            if expected_type == "number":
                                val = 9.99 + idx * 5.0
                            elif expected_type == "url":
                                val = f"https://example.com/mock-item/{idx + 1}"
                            elif expected_type == "boolean":
                                val = True
                            else:
                                val = f"Mock {field} {idx + 1}"
                        record[field] = val
                    else:
                        record[field] = None
                filtered.append(record)
                
            return {
                "status": "SUCCESS",
                "records": filtered,
                "error": None
            }
        except Exception as e:
            return {
                "status": "FAILED",
                "records": [],
                "error": f"Simulation failure: {str(e)}"
            }

    @classmethod
    def _heal_simulated_collector(
        cls,
        collector_id: str,
        failure_description: str,
        scraper_id: str = None
    ) -> Dict[str, Any]:
        """
        Simulated Healing:
        Analyzes the failure description and updates the SIMULATED_SELECTORS to match the website's updated CSS classes.
        In a real scenario, Bright Data AI self-heals it. In our simulation, we query the demo site's active DOM classes
        and "heal" our selectors to match them.
        """
        key = scraper_id or collector_id or "default"
        logger.info(f"Running simulated AI healing for {key}. Diagnostics:\n{failure_description}")

        try:
            from routes.demo import DEMO_WEBSITE_STATE
            current_state = DEMO_WEBSITE_STATE["status"]
            
            # If data is dropped/collapsed, simulate structural repair by restoring healthy catalog state
            if current_state in ["DATA_DROPS", "COUNT_COLLAPSE", "TYPE_MISMATCH", "EMPTY_EXTRACTION", "QUALITY_DEGRADE"]:
                DEMO_WEBSITE_STATE["status"] = "NORMAL"
                DEMO_WEBSITE_STATE["dom_classes"] = {
                    "product_name": "product-title",
                    "price": "product-price",
                    "currency": "product-currency",
                    "availability": "product-stock",
                    "product_url": "product-link"
                }
                SIMULATED_SELECTORS[key] = {
                    "product_name": ".product-title",
                    "price": ".product-price",
                    "currency": ".product-currency",
                    "availability": ".product-stock",
                    "product_url": ".product-link"
                }
                healed_log = f"AI Healing Agent resolved data structure collapse. Restored data extraction thresholds to baseline values."
            else:
                # Class renaming or element moved: dynamically map current classes to selectors
                current_classes = DEMO_WEBSITE_STATE["dom_classes"]
                SIMULATED_SELECTORS[key] = {
                    field: f".{cls_name}"
                    for field, cls_name in current_classes.items()
                }
                healed_log = "AI Healing Agent analysed HTML structure.\nSUCCESS: Outdated selectors updated.\n" + "\n".join([
                    f"- {field}: changed to '.{cls_name}'" for field, cls_name in current_classes.items()
                ])

            return {
                "status": "SUCCESS",
                "error": None,
                "logs": healed_log
            }
        except Exception as e:
            return {
                "status": "FAILED",
                "error": f"Simulated healing error: {str(e)}",
                "logs": ""
            }

    @classmethod
    def reset_selectors(cls, scraper_id: str = None, collector_id: str = None):
        """
        Helper to break the selectors back to default, useful for resetting the demo.
        """
        key = scraper_id or collector_id or "default"
        SIMULATED_SELECTORS[key] = {
            "product_name": ".product-title",
            "price": ".product-price",
            "currency": ".product-currency",
            "availability": ".product-stock",
            "product_url": ".product-link"
        }

    @classmethod
    def get_selectors(cls, scraper_id: str = None, collector_id: str = None) -> Dict[str, str]:
        key = scraper_id or collector_id or "default"
        if key not in SIMULATED_SELECTORS:
            cls.reset_selectors(scraper_id=scraper_id, collector_id=collector_id)
        return SIMULATED_SELECTORS[key]

    @classmethod
    def set_selectors(cls, selectors: Dict[str, str], scraper_id: str = None, collector_id: str = None):
        key = scraper_id or collector_id or "default"
        SIMULATED_SELECTORS[key] = selectors
