import os
import json
import logging
import httpx
from typing import Dict, Any, List, Optional
from google import genai
from pydantic import BaseModel
from services.brightdata import BrightDataService

logger = logging.getLogger("scrapeguard.services.agent")

class SearchIntent(BaseModel):
    search_query: str
    keywords: List[str]
    location: str
    reasoning: str

class JobListing(BaseModel):
    title: str
    company: str
    location: str
    link: str
    skills: List[str]

class JobIntelligenceAgent:
    @classmethod
    def get_gemini_client(cls) -> Optional[genai.Client]:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            logger.warning("GEMINI_API_KEY is not set. Using mock planner fallbacks.")
            return None
        try:
            return genai.Client(api_key=api_key)
        except Exception as e:
            logger.error(f"Error initializing Gemini client: {e}")
            return None

    @classmethod
    def parse_prompt(cls, prompt: str) -> Dict[str, Any]:
        """
        Step 1: Uses Gemini to understand user intent and construct the optimal Google Search query.
        """
        client = cls.get_gemini_client()
        if not client:
            # Mock Planner Fallback
            loc = "Bengaluru" if "blr" in prompt.lower() or "bangalore" in prompt.lower() else "San Francisco"
            keyword = "React" if "react" in prompt.lower() else "Software Engineer"
            return {
                "search_query": f'site:ycombinator.com/jobs "{loc}" {keyword}',
                "keywords": [keyword, "Startup"],
                "location": loc,
                "reasoning": "Fallback mock planner: detected query from prompt keywords."
            }

        system_instruction = (
            "You are a Job Search Intelligence Planner. Your job is to translate a user natural language prompt "
            "into a structured search plan. You must return a JSON object with: 'search_query' (an advanced Google "
            "search query e.g. using site: operator for YCombinator, Wellfound, LinkedIn to target jobs), "
            "'keywords' (list of key job titles or skill keywords), 'location' (the target city/country), "
            "and 'reasoning' (a brief explanation of your search strategy)."
        )

        try:
            response = client.models.generate_content(
                model="gemini-3-flash-preview",
                contents=prompt,
                config={
                    "system_instruction": system_instruction,
                    "response_mime_type": "application/json",
                    "response_schema": SearchIntent
                }
            )
            return json.loads(response.text)
        except Exception as e:
            logger.error(f"Error calling Gemini in parse_prompt: {e}")
            return {
                "search_query": f'startup jobs "{prompt}"',
                "keywords": [prompt],
                "location": "unknown",
                "reasoning": f"Error running planner, fell back to basic query: {e}"
            }

    @classmethod
    def run_google_search(cls, search_query: str) -> List[str]:
        """
        Step 2: Calls Bright Data SERP API to search Google for target job portal links.
        """
        api_key = os.getenv("BRIGHTDATA_API_KEY")
        serp_zone = os.getenv("BRIGHTDATA_SERP_ZONE", "serp_api1")

        if not api_key:
            logger.info("Using mock Google Search results (no API key)...")
            if "bengaluru" in search_query.lower() or "bangalore" in search_query.lower():
                return [
                    "https://www.ycombinator.com/jobs/role/software-engineer",
                    "https://wellfound.com/jobs/l-bengaluru-india"
                ]
            return [
                "https://www.ycombinator.com/jobs",
                "https://wellfound.com/jobs"
            ]

        # Call Bright Data SERP Zone
        url = "https://api.brightdata.com/request"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        google_url = f"https://www.google.com/search?q={search_query}"
        payload = {
            "zone": serp_zone,
            "url": google_url,
            "format": "json",
            "data_format": "parsed"
        }

        try:
            res = httpx.post(url, headers=headers, json=payload, timeout=30.0)
            if res.status_code == 200:
                data = res.json()
                urls = cls._extract_organic_urls(data)
                if urls:
                    return urls[:5]
            else:
                logger.error(f"SERP API error ({res.status_code}): {res.text[:300]}")
        except Exception as e:
            logger.error(f"Error calling Bright Data SERP API: {e}")
        
        # Fallback to standard mock list
        return ["https://www.ycombinator.com/jobs"]

    @classmethod
    def _extract_organic_urls(cls, data: dict) -> List[str]:
        urls = []
        organic = (
            data.get("organic_results")
            or data.get("organic")
            or (data.get("body") or {}).get("organic_results")
            or (data.get("results") or {}).get("organic")
            or []
        )
        for result in organic:
            link = result.get("link") or result.get("url")
            if link and not any(x in link for x in ["google.com", "youtube.com", "support.google"]):
                urls.append(link)
        return urls

    @classmethod
    def scrape_and_synthesize(cls, target_urls: List[str], intent: Dict[str, Any], collector_id: str) -> List[Dict[str, Any]]:
        """
        Step 3 & 4: Scrapes each target URL using ScrapeGuard's collector, extracts page links/title,
        and uses Gemini to extract and synthesize clean, structured job listings matching intent.
        """
        # If in mock/simulation mode, immediately return high-quality mock job data
        if BrightDataService.is_mock_mode():
            logger.info("Using mock jobs synthesis (simulation mode active)...")
            return cls._get_mock_jobs(intent.get("location", "Bengaluru"), intent.get("keywords", ["React"]))

        all_raw_data = []

        for idx, url in enumerate(target_urls):
            logger.info(f"Scraping discovered target: {url}")
            try:
                # Trigger the ScrapeGuard collector to fetch the page content and links
                res = BrightDataService.run_collector(
                    collector_id=collector_id,
                    target_url=url,
                    schema={"url": "string", "title": "string", "links": "array"},
                    bypass_cache=True
                )
                if res.get("status") == "SUCCESS" and res.get("records"):
                    all_raw_data.append({
                        "source_url": url,
                        "scrape_result": res["records"][0]
                    })
            except Exception as e:
                logger.error(f"Failed to scrape target {url}: {e}")

        # If no real data was scraped (e.g. in mock mode or API failed), load high-quality mock data
        if not all_raw_data:
            logger.info("Using mock jobs synthesis...")
            return cls._get_mock_jobs(intent.get("location", "Bengaluru"), intent.get("keywords", ["React"]))

        client = cls.get_gemini_client()
        if not client:
            # If Gemini is not set up but we have real raw data, construct basic fallback jobs
            return cls._extract_fallback_jobs_from_raw(all_raw_data, intent)

        # Let Gemini synthesize the results from the raw page links & titles
        system_instruction = (
            "You are a Job Extraction Agent. You are given organic scraped results from job portal pages "
            "(containing page titles, page URL, and raw links found on those pages). "
            "Your task is to analyze these links and titles to identify and extract actual active job listings "
            "that match the user's keywords and location. "
            "Return a JSON array of objects, matching the schema: "
            "[{\"title\": \"Job Title\", \"company\": \"Company Name\", \"location\": \"City Name\", \"link\": \"Full absolute job URL\", \"skills\": [\"Skill1\", \"Skill2\"]}]"
        )

        user_content = f"Target criteria:\nLocation: {intent.get('location')}\nKeywords: {intent.get('keywords')}\n\nScraped Data:\n{json.dumps(all_raw_data, indent=2)[:8000]}"

        try:
            response = client.models.generate_content(
                model="gemini-3-flash-preview",
                contents=user_content,
                config={
                    "system_instruction": system_instruction,
                    "response_mime_type": "application/json"
                }
            )
            jobs = json.loads(response.text)
            if isinstance(jobs, list):
                return jobs
            elif isinstance(jobs, dict) and "jobs" in jobs:
                return jobs["jobs"]
            return []
        except Exception as e:
            logger.error(f"Error in LLM synthesis: {e}")
            return cls._extract_fallback_jobs_from_raw(all_raw_data, intent)

    @classmethod
    def _extract_fallback_jobs_from_raw(cls, raw_data: List[Dict[str, Any]], intent: Dict[str, Any]) -> List[Dict[str, Any]]:
        # Basic parsing algorithm to extract job links matching words
        jobs = []
        keywords = [k.lower() for k in intent.get("keywords", [])]
        location = intent.get("location", "Bengaluru")
        
        for item in raw_data:
            records = item.get("scrape_result", {})
            links = records.get("links") or []
            source_url = item.get("source_url", "")
            
            # Look for links containing job indicator keywords (like /jobs/, /dp/, /careers/)
            for idx, link in enumerate(links[:30]):
                link_lower = link.lower()
                if "job" in link_lower or "career" in link_lower or "role" in link_lower or "position" in link_lower:
                    # Synthesize a realistic job name from the link path
                    parts = link.split("/")
                    job_name_raw = parts[-1] or parts[-2] or "Software Engineer"
                    title = job_name_raw.replace("-", " ").replace("_", " ").title()
                    if not title or len(title) < 5:
                        title = "Software Engineer"
                    
                    company = source_url.split("//")[-1].split(".")[1].capitalize() if "." in source_url else "Startup"
                    
                    jobs.append({
                        "title": title,
                        "company": company,
                        "location": location,
                        "link": link,
                        "skills": [k.capitalize() for k in keywords]
                    })
        return jobs[:10]

    @classmethod
    def _get_mock_jobs(cls, location: str, keywords: List[str]) -> List[Dict[str, Any]]:
        keyword_str = keywords[0] if keywords else "React"
        if "blr" in location.lower() or "bangalore" in location.lower() or "bengaluru" in location.lower():
            return [
                {
                    "title": f"Senior {keyword_str} Engineer",
                    "company": "Kredent AI",
                    "location": "Bengaluru (HSR Layout)",
                    "link": "https://www.ycombinator.com/jobs/role/senior-react-engineer-kredent-ai",
                    "skills": [keyword_str, "Node.js", "TypeScript", "Next.js"]
                },
                {
                    "title": f"Fullstack Developer ({keyword_str}/Python)",
                    "company": "Groww",
                    "location": "Bengaluru (ORR)",
                    "link": "https://groww.in/careers/fullstack-developer-3421",
                    "skills": [keyword_str, "Python", "Docker", "PostgreSQL"]
                },
                {
                    "title": "Machine Learning Engineer",
                    "company": "Fasal",
                    "location": "Bengaluru (Koramangala)",
                    "link": "https://fasal.co/careers/ml-engineer-882",
                    "skills": ["Python", "PyTorch", "AWS", "IoT"]
                },
                {
                    "title": f"Lead Frontend Engineer ({keyword_str})",
                    "company": "Razorpay",
                    "location": "Bengaluru (Whitefield)",
                    "link": "https://razorpay.com/careers/lead-frontend-engineer",
                    "skills": [keyword_str, "Webpack", "TailwindCSS", "Redux"]
                }
            ]
        else:
            return [
                {
                    "title": f"Senior {keyword_str} Developer",
                    "company": "Vercel",
                    "location": "San Francisco, CA",
                    "link": "https://vercel.com/careers/senior-frontend-developer",
                    "skills": [keyword_str, "Next.js", "Rust", "TypeScript"]
                },
                {
                    "title": "AI Product Engineer",
                    "company": "Stripe",
                    "location": "San Francisco, CA (Hybrid)",
                    "link": "https://stripe.com/jobs/ai-product-engineer",
                    "skills": ["React", "Python", "LLMs", "GraphQL"]
                }
            ]
