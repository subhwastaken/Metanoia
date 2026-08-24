import { callGemini } from './gemini';

interface SearchIntent {
  search_query: string;
  keywords: string[];
  location: string;
  reasoning: string;
}

export type JobSourceType = 'company' | 'board';

export interface JobListing {
  title: string;
  company: string;
  location: string;
  link: string;
  skills: string[];
  description?: string;
  salary?: string;
  source?: string;
  posted?: string;
  posted_days_ago?: number | null;
  source_type: JobSourceType;
}

interface SerpJobItem {
  title?: string;
  company?: string;
  location?: string;
  link?: string;
  apply_link?: string;
  description?: string;
  source?: string;
  date?: string;
  employment_type?: string;
  tags?: Array<{ name?: string; value?: string }>;
  postings?: Array<{ link?: string; source?: string }>;
}

interface SerpBody {
  organic?: Array<{ title?: string; link?: string; description?: string }>;
  jobs?: { items?: SerpJobItem[] };
}

const JOB_BOARDS = [
  'linkedin.com', 'indeed.com', 'naukri.com', 'glassdoor.com', 'monster.com',
  'foundit.in', 'shine.com', 'instahyre.com', 'cutshort.io', 'wellfound.com',
  'hirist.com', 'ambitionbox.com', 'timesjobs.com', 'simplyhired.com',
  'ziprecruiter.com', 'dice.com', 'builtin.com', 'adzuna.',
];

const ATS_PLATFORMS = [
  'greenhouse.io', 'lever.co', 'ashbyhq.com', 'workable.com', 'myworkdayjobs.com',
  'jobvite.com', 'smartrecruiters.com', 'breezy.hr', 'icims.com', 'teamtailor.com',
  'recruitee.com', 'bamboohr.com', 'paylocity.com', 'ultipro.com',
];

export class JobIntelligenceAgent {
  static async searchJobs(prompt: string): Promise<{
    intent: SearchIntent;
    jobs: JobListing[];
    company_jobs: JobListing[];
    board_jobs: JobListing[];
    logs: string[];
    serpUrl: string;
  }> {
    const logs: string[] = [];

    logs.push('🧠 Step 1: Calling Gemini API to parse your search intent...');
    const intent = await this.parsePrompt(prompt);
    logs.push(`✅ Gemini parsed: Location=${intent.location} | Keywords=${intent.keywords.join(', ')}`);
    logs.push(`👉 Search query: "${intent.search_query}"`);
    if (intent.reasoning) logs.push(`💡 ${intent.reasoning}`);

    const recency = this.getRecencyFilter(prompt);
    let serpUrl = `https://www.google.com/search?q=${encodeURIComponent(intent.search_query)}&tbs=${recency.tbs}`;
    let companySerpUrl = `https://www.google.com/search?q=${encodeURIComponent(this.buildCompanyCareersQuery(intent))}&tbs=${recency.tbs}`;

    logs.push(`📅 Recency filter: ${recency.label}`);

    logs.push('🌐 Step 2: Searching Google Jobs + company career pages via Bright Data...');

    const [mainSerp, companySerp] = await Promise.all([
      this.fetchSerp(serpUrl),
      this.fetchSerp(companySerpUrl),
    ]);

    const allJobs: JobListing[] = [];

    if (mainSerp) {
      const mainJobs = this.extractJobsFromSerp(mainSerp, intent);
      allJobs.push(...mainJobs);
      logs.push(`🕷️ Step 3: Found ${mainJobs.length} listings from Google Jobs`);
    }

    // Retry without date filter if first pass returned nothing
    if (allJobs.length === 0) {
      logs.push('⚠️ No results with date filter — broadening search...');
      const broadUrl = `https://www.google.com/search?q=${encodeURIComponent(intent.search_query)}`;
      const broadSerp = await this.fetchSerp(broadUrl);
      if (broadSerp) {
        const broadJobs = this.extractJobsFromSerp(broadSerp, intent);
        allJobs.push(...broadJobs);
        logs.push(`🕷️ Broad search found ${broadJobs.length} listings`);
        serpUrl = broadUrl;
      }
    }

    if (allJobs.length === 0) {
      logs.push('⚠️ Retrying with simplified query...');
      const fallbackUrl = `https://www.google.com/search?q=${encodeURIComponent(intent.keywords[0] + ' jobs ' + intent.location + ' hiring')}`;
      const retryBody = await this.fetchSerp(fallbackUrl);
      if (retryBody) {
        allJobs.push(...this.extractJobsFromSerp(retryBody, intent));
      } else {
        logs.push('❌ Could not fetch job board results from Bright Data.');
      }
    }

    if (companySerp) {
      const companyOrganic = this.extractCompanyCareersFromSerp(companySerp, intent);
      allJobs.push(...companyOrganic);
      logs.push(`🏢 Step 4: Found ${companyOrganic.length} direct company career page listings`);
    }

    // Broaden company search if targeted query found nothing
    if (!allJobs.some((j) => j.source_type === 'company')) {
      const broadCompanyUrl = `https://www.google.com/search?q=${encodeURIComponent(
        `${intent.keywords[0]} ${intent.location} open role site:greenhouse.io OR site:lever.co OR site:ashbyhq.com`
      )}&tbs=${recency.tbs}`;
      const broadCompanySerp = await this.fetchSerp(broadCompanyUrl);
      if (broadCompanySerp) {
        const extra = this.extractCompanyCareersFromSerp(broadCompanySerp, intent);
        allJobs.push(...extra);
        if (extra.length > 0) logs.push(`🏢 Broad company search found ${extra.length} more openings`);
      }
    }

    const deduped = this.dedupeJobs(allJobs);
    const freshOnly = this.filterStaleAndGeneric(deduped, recency.maxDays);
    const dropped = deduped.length - freshOnly.length;
    if (dropped > 0) {
      logs.push(`🗑️ Filtered out ${dropped} stale or generic career-page listings`);
    }
    const filtered = this.filterAndRankJobs(freshOnly, intent);
    const company_jobs = filtered.filter((j) => j.source_type === 'company');
    const board_jobs = filtered.filter((j) => j.source_type === 'board');

    logs.push(`📝 Step 5: ${company_jobs.length} company openings · ${board_jobs.length} job board listings`);
    logs.push(`🎉 Done — ${filtered.length} total jobs ready.`);

    return { intent, jobs: filtered, company_jobs, board_jobs, logs, serpUrl };
  }

  private static buildCompanyCareersQuery(intent: SearchIntent): string {
    const role = intent.keywords.slice(0, 2).join(' ');
    const loc = intent.location;
    return `${role} ${loc} open role hiring site:greenhouse.io OR site:jobs.lever.co OR site:jobs.ashbyhq.com -linkedin -indeed -naukri`;
  }

  private static getRecencyFilter(prompt: string): { tbs: string; maxDays: number; label: string } {
    const wantsNow = /\b(currently|right now|now|today|this week|actively|open now|fresh|recent)\b/i.test(prompt);
    if (wantsNow) {
      return { tbs: 'qdr:m', maxDays: 30, label: 'Past month (actively hiring)' };
    }
    return { tbs: 'qdr:m', maxDays: 60, label: 'Past 2 months' };
  }

  /** Parse relative date strings from Google Jobs into approximate days ago */
  private static parsePostedDaysAgo(posted?: string): number | null {
    if (!posted) return null;
    const s = posted.toLowerCase().trim();

    if (s === 'today' || s === 'just posted') return 0;
    if (s === 'yesterday') return 1;

    const rel = s.match(/(\d+)\s*(minute|hour|day|week|month|year)s?\s*ago/);
    if (rel) {
      const n = parseInt(rel[1], 10);
      const unit = rel[2];
      if (unit === 'minute' || unit === 'hour') return 0;
      if (unit === 'day') return n;
      if (unit === 'week') return n * 7;
      if (unit === 'month') return n * 30;
      if (unit === 'year') return n * 365;
    }

    // "Mar 15" or "15 Mar 2026"
    const currentYear = new Date().getFullYear();
    const withYear = s.match(/\b(20\d{2})\b/);
    if (withYear) {
      const year = parseInt(withYear[1], 10);
      const parsed = Date.parse(s);
      if (!isNaN(parsed)) {
        return Math.floor((Date.now() - parsed) / (1000 * 60 * 60 * 24));
      }
      if (year < currentYear) return 400; // clearly stale
    }

    return null;
  }

  /** Drop generic career homepages and listings older than maxDays */
  private static filterStaleAndGeneric(jobs: JobListing[], maxDays: number): JobListing[] {
    const currentYear = new Date().getFullYear();

    return jobs.filter((job) => {
      if (this.isGenericCareerPage(job.link, job.title)) return false;

      const daysAgo = job.posted_days_ago ?? this.parsePostedDaysAgo(job.posted);
      if (daysAgo !== null && daysAgo > maxDays) return false;

      // Reject titles/descriptions that reference old hiring years
      const text = `${job.title} ${job.description || ''}`;
      const oldYearMatch = text.match(/\b(20\d{2})\b/g);
      if (oldYearMatch) {
        const years = oldYearMatch.map(Number).filter((y) => y >= 2020 && y <= currentYear);
        const hasCurrentYear = years.includes(currentYear);
        const hasOnlyOldYears = years.length > 0 && !hasCurrentYear && years.every((y) => y < currentYear);
        if (hasOnlyOldYears && job.source_type === 'board') return false;
      }

      // Board aggregate search pages and social posts — not individual openings
      if (job.source_type === 'board') {
        const t = job.title.toLowerCase();
        if (/\d{4,}\s+\w+.*(jobs?|vacancies)/i.test(t)) return false;
        if (/job vacancies in (january|february|march|april|may|june|july|august|september|october|november|december)/i.test(t)) return false;
        if (/\d{3,}\+?\s*(open\s*)?(roles?|jobs?|vacancies)/i.test(t)) return false;
        if (job.link.includes('linkedin.com/posts') || /\/posts\//.test(job.link)) return false;
        if (/\/q-[^/]+-jobs/i.test(job.link)) return false; // indeed/naukri search result pages
        if (/\/jobs\/search/i.test(job.link)) return false;
        // Keep individual job postings on boards (cutshort.io/job/, wellfound.com/jobs/, etc.)
      }

      return true;
    });
  }

  private static isGenericCareerPage(url: string, title: string): boolean {
    try {
      const parsed = new URL(url);
      const path = parsed.pathname.toLowerCase().replace(/\/$/, '');
      const host = parsed.hostname.toLowerCase();
      const t = title.toLowerCase().trim();

      // Generic landing-page titles
      if (/^(careers|jobs|open roles?|job opportunities|hiring & career|work with us)(\s|$)/i.test(t)) return true;
      if (/^careers at\b/i.test(t) && !/\/jobs\//.test(path)) return true;
      if (/^jobs,? hiring & career opportunities at\b/i.test(t)) return true;
      if (/open positions? & job opportunities/i.test(t)) return true;

      // Bare career index URLs
      if (/\/careers$/.test(path) || path === '/career' || path === '/career/jobs') return true;
      if (host.includes('greenhouse.io') && !/\/jobs\/\d+/.test(path)) {
        const segments = path.split('/').filter(Boolean);
        if (segments.length <= 1) return true;
      }
      if (host.includes('lever.co') && path.split('/').filter(Boolean).length <= 1) return true;
      if (host.includes('ashbyhq.com') && path.split('/').filter(Boolean).length <= 1) return true;

      return false;
    } catch {
      return false;
    }
  }

  private static isSpecificJobUrl(url: string): boolean {
    try {
      const path = new URL(url).pathname.toLowerCase();
      const host = new URL(url).hostname.toLowerCase();

      if (/\/jobs\/\d+/.test(path)) return true; // greenhouse
      if (host.includes('lever.co') && path.split('/').filter(Boolean).length >= 2) return true;
      if (host.includes('ashbyhq.com') && path.split('/').filter(Boolean).length >= 2) return true;
      if (host.includes('workable.com') && /\/j\//.test(path)) return true;
      if (/\/job[s]?\//i.test(path) && path.split('/').filter(Boolean).length >= 2) return true;
      if (/\/(role|position|opening|vacancy)\//i.test(path)) return true;

      return false;
    } catch {
      return false;
    }
  }

  static async parsePrompt(prompt: string): Promise<SearchIntent> {
    const systemInstruction = `You are a job search intelligence planner. Parse the user's natural language job search prompt.

Return ONLY valid JSON with this exact schema:
{
  "search_query": "<optimized Google Jobs search string>",
  "keywords": ["<primary role>", "<skill1>", "<skill2>"],
  "location": "<city or Remote>",
  "reasoning": "<one sentence explaining what you extracted>"
}

Rules:
- search_query must be optimized for Google Jobs (include role, location, company type if mentioned)
- Include "hiring" when user wants active/current openings — do NOT add a year number to search_query
- If user says "currently hiring", "right now", "active" — emphasize recently posted roles
- Use the EXACT role/skills the user mentioned — never default to "Software Engineer"
- Expand abbreviations: blr→bangalore, sf→san francisco, wfh→remote
- If user mentions startups, include "startup" in search_query
- keywords should list the role and relevant skills only (not location)`;

    const llmResponse = await callGemini(systemInstruction, prompt, { json: true, temperature: 0.1 });

    if (llmResponse) {
      try {
        const parsed = JSON.parse(llmResponse) as SearchIntent;
        if (parsed.search_query && Array.isArray(parsed.keywords) && parsed.keywords.length > 0) {
          return {
            search_query: parsed.search_query.trim(),
            keywords: parsed.keywords,
            location: parsed.location || 'India',
            reasoning: parsed.reasoning || 'Parsed by Gemini AI.',
          };
        }
      } catch (e) {
        console.error('Failed to parse Gemini JSON:', e, llmResponse);
      }
    }

    console.warn('Gemini unavailable, using fallback parser');
    return this.fallbackParse(prompt);
  }

  private static fallbackParse(prompt: string): SearchIntent {
    const cleaned = prompt
      .replace(/\b(find me|find|search for|looking for|get me|show me|i want|i need)\b/gi, '')
      .replace(/\b(which are|that are|currently|right now|please)\b/gi, '')
      .replace(/\b(in blr|in bangalore|in bengaluru)\b/gi, 'bangalore')
      .replace(/\s+/g, ' ')
      .trim();

    let search_query = cleaned;
    if (!/\bjobs?\b/i.test(search_query)) search_query += ' jobs';
    if (!/\bhiring\b/i.test(search_query)) search_query += ' hiring';

    let location = 'India';
    if (/blr|bangalore|bengaluru/i.test(prompt)) location = 'Bengaluru';
    else if (/mumbai/i.test(prompt)) location = 'Mumbai';
    else if (/hyderabad/i.test(prompt)) location = 'Hyderabad';
    else if (/remote|wfh/i.test(prompt)) location = 'Remote';

    const words = cleaned.replace(/\b(jobs?|hiring|startups?)\b/gi, '').trim().split(/\s+/).filter(Boolean);
    const role = words.slice(0, 3).join(' ') || 'jobs';

    return {
      search_query: search_query.trim(),
      keywords: [role.charAt(0).toUpperCase() + role.slice(1)],
      location,
      reasoning: 'Fallback parser (Gemini API unavailable).',
    };
  }

  private static async fetchSerp(googleUrl: string): Promise<SerpBody | null> {
    const apiKey = process.env.BRIGHTDATA_API_KEY;
    const serpZone = process.env.BRIGHTDATA_SERP_ZONE || 'serp_api1';

    if (!apiKey) {
      console.error('BRIGHTDATA_API_KEY not set');
      return null;
    }

    try {
      const res = await fetch('https://api.brightdata.com/request', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          zone: serpZone,
          url: googleUrl,
          format: 'json',
          data_format: 'parsed',
        }),
        signal: AbortSignal.timeout(90000),
      });

      const data = await res.json();

      if (data?.status_code && data.status_code !== 200) {
        const err = data?.headers?.['x-brd-error'] || `HTTP ${data.status_code}`;
        console.error(`SERP Bright Data error: ${err}`);
        return null;
      }

      if (!res.ok) {
        console.error(`SERP error ${res.status}`);
        return null;
      }

      const rawBody = data?.body;
      if (!rawBody) return null;

      return typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    } catch (e) {
      console.error('SERP fetch error:', e);
      return null;
    }
  }

  private static classifyLink(url: string): JobSourceType {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace('www.', '').toLowerCase();
      const path = parsed.pathname.toLowerCase();

      if (JOB_BOARDS.some((b) => host.includes(b))) return 'board';
      if (ATS_PLATFORMS.some((a) => host.includes(a))) return 'company';
      if (host.startsWith('jobs.') || host.startsWith('careers.')) return 'company';
      if (/\/(careers|jobs|join-us|work-with-us|openings|vacancies)/.test(path)) return 'company';
      if (host.includes('workday') || host.includes('taleo')) return 'company';

      // Google Jobs apply links on unknown domains are usually company ATS
      if (!JOB_BOARDS.some((b) => host.includes(b))) return 'company';
      return 'board';
    } catch {
      return 'board';
    }
  }

  private static extractJobsFromSerp(serpBody: SerpBody, intent: SearchIntent): JobListing[] {
    const jobs: JobListing[] = [];

    for (const item of serpBody.jobs?.items || []) {
      const candidates = [
        item.apply_link,
        ...(item.postings?.map((p) => p.link) || []),
        item.link,
      ].filter(Boolean) as string[];

      // Prefer direct company/ATS links over board links
      const sorted = candidates.sort((a, b) => {
        const aCompany = this.classifyLink(a) === 'company' ? 1 : 0;
        const bCompany = this.classifyLink(b) === 'company' ? 1 : 0;
        return bCompany - aCompany;
      });

      const link = sorted.find((l) => !l.includes('google.com/search'));
      if (!link) continue;

      const salary = item.tags?.find((t) => t.name === 'Salary')?.value;
      const sourceType = this.classifyLink(link);

      jobs.push({
        title: item.title || 'Job Opening',
        company: item.company || this.companyFromUrl(link),
        location: item.location || intent.location,
        link,
        skills: this.inferSkills(item.description || '', intent.keywords),
        description: item.description?.slice(0, 300),
        salary,
        source: item.source?.replace(/^via\s+/i, '') || item.postings?.[0]?.source || this.companyFromUrl(link),
        posted: item.date,
        posted_days_ago: this.parsePostedDaysAgo(item.date),
        source_type: sourceType,
      });
    }

    // Organic job board results as fallback
    for (const result of serpBody.organic || []) {
      const link = result.link || '';
      if (!link || link.includes('google.com')) continue;

      const isBoard = JOB_BOARDS.some((d) => link.includes(d));
      if (!isBoard) continue;
      if (!/\/jobs?\//i.test(link) && !/devops|engineer|hiring|career/i.test(link)) continue;

      jobs.push({
        title: result.title || 'View job listings',
        company: this.companyFromUrl(link),
        location: intent.location,
        link,
        skills: intent.keywords,
        description: result.description?.slice(0, 200),
        source: this.companyFromUrl(link),
        source_type: 'board',
      });
    }

    return jobs;
  }

  private static extractCompanyCareersFromSerp(serpBody: SerpBody, intent: SearchIntent): JobListing[] {
    const jobs: JobListing[] = [];

    // Google Jobs block first — has dates and specific apply links
    for (const item of serpBody.jobs?.items || []) {
      const link = item.apply_link || item.postings?.[0]?.link;
      if (!link || this.classifyLink(link) !== 'company') continue;

      jobs.push({
        title: item.title || 'Job Opening',
        company: item.company || this.extractCompanyName(item.title || '', link),
        location: item.location || intent.location,
        link,
        skills: this.inferSkills(item.description || '', intent.keywords),
        description: item.description?.slice(0, 300),
        source: this.companyFromUrl(link),
        posted: item.date,
        posted_days_ago: this.parsePostedDaysAgo(item.date),
        source_type: 'company',
      });
    }

    // Organic: only specific job posting URLs, not career homepages
    for (const result of serpBody.organic || []) {
      const link = result.link || '';
      if (!link || link.includes('google.com')) continue;
      if (this.classifyLink(link) !== 'company') continue;
      if (!this.isSpecificJobUrl(link)) continue;
      if (this.isGenericCareerPage(link, result.title || '')) continue;

      const title = result.title || 'Open Role';
      const text = `${title} ${result.description || ''}`.toLowerCase();
      const roleMatch = intent.keywords.some((k) => text.includes(k.toLowerCase()));
      if (!roleMatch && intent.keywords.length > 0) {
        const broadMatch = /engineer|developer|devops|manager|designer|analyst/i.test(text);
        if (!broadMatch) continue;
      }

      jobs.push({
        title: title.replace(/\s*[-|].*$/, '').trim(),
        company: this.extractCompanyName(title, link),
        location: intent.location,
        link,
        skills: intent.keywords,
        description: result.description?.slice(0, 250),
        source: this.companyFromUrl(link),
        source_type: 'company',
      });
    }

    return jobs;
  }

  private static extractCompanyName(title: string, url: string): string {
    // "DevOps Engineer - Razorpay" or "Razorpay Careers"
    const dashMatch = title.match(/\s[-–|]\s*(.+?)(?:\s[-–|]|$)/);
    if (dashMatch && dashMatch[1].length < 40) return dashMatch[1].trim();

    const careersMatch = title.match(/^(.+?)\s+(?:careers|jobs|hiring)/i);
    if (careersMatch) return careersMatch[1].trim();

    return this.companyFromUrl(url);
  }

  private static dedupeJobs(jobs: JobListing[]): JobListing[] {
    const seen = new Set<string>();
    const result: JobListing[] = [];

    for (const job of jobs) {
      const key = `${job.title}|${job.company}|${job.link}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(job);
    }

    // Prefer company entries with dates/specific URLs when same title+company exists
    const byTitleCompany = new Map<string, JobListing>();
    for (const job of result) {
      const key = `${job.title}|${job.company}`.toLowerCase();
      const existing = byTitleCompany.get(key);
      if (!existing) {
        byTitleCompany.set(key, job);
        continue;
      }
      const jobScore =
        (job.source_type === 'company' ? 2 : 0) +
        (this.isSpecificJobUrl(job.link) ? 2 : 0) +
        (job.posted_days_ago != null ? 1 : 0);
      const existingScore =
        (existing.source_type === 'company' ? 2 : 0) +
        (this.isSpecificJobUrl(existing.link) ? 2 : 0) +
        (existing.posted_days_ago != null ? 1 : 0);
      if (jobScore > existingScore) byTitleCompany.set(key, job);
    }

    return Array.from(byTitleCompany.values());
  }

  private static filterAndRankJobs(jobs: JobListing[], intent: SearchIntent): JobListing[] {
    const roleTerms = intent.keywords.map((k) => k.toLowerCase());
    const locTerms = [intent.location.toLowerCase(), 'bangalore', 'bengaluru', 'blr', 'karnataka', 'remote'];

    const scored = jobs.map((job) => {
      const text = `${job.title} ${job.description || ''} ${job.company}`.toLowerCase();
      let score = 0;

      for (const term of roleTerms) {
        if (text.includes(term.toLowerCase())) score += 3;
      }
      for (const loc of locTerms) {
        if (`${job.location} ${text}`.toLowerCase().includes(loc)) score += 2;
      }
      if (job.source_type === 'company') score += 4;
      if (this.isSpecificJobUrl(job.link)) score += 3;
      if (job.link && !job.link.includes('google.com')) score += 1;
      if (job.salary) score += 1;

      // Boost fresh listings
      const days = job.posted_days_ago ?? this.parsePostedDaysAgo(job.posted);
      if (days !== null) {
        if (days <= 3) score += 6;
        else if (days <= 7) score += 4;
        else if (days <= 14) score += 2;
        else if (days > 45) score -= 5;
      }

      return { job, score };
    });

    const company = scored
      .filter(({ job }) => job.source_type === 'company')
      .filter(({ score }) => score >= 1)
      .sort((a, b) => b.score - a.score)
      .map(({ job }) => job)
      .slice(0, 12);

    const board = scored
      .filter(({ job }) => job.source_type === 'board')
      .filter(({ score }) => score >= 1)
      .sort((a, b) => b.score - a.score)
      .map(({ job }) => job)
      .slice(0, 10);

    return [...company, ...board];
  }

  private static inferSkills(description: string, keywords: string[]): string[] {
    const skills = new Set(keywords);
    const techTerms = [
      'Kubernetes', 'Docker', 'AWS', 'Azure', 'GCP', 'Terraform', 'Ansible',
      'Jenkins', 'CI/CD', 'Linux', 'Python', 'Go', 'Git', 'Prometheus', 'Grafana',
    ];
    const lower = description.toLowerCase();
    for (const term of techTerms) {
      if (lower.includes(term.toLowerCase())) skills.add(term);
    }
    return Array.from(skills).slice(0, 6);
  }

  private static companyFromUrl(url: string): string {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace('www.', '').toLowerCase();
      const pathParts = parsed.pathname.split('/').filter(Boolean);

      // jobs.ashbyhq.com/company-name/...
      if (host.includes('ashbyhq.com') && pathParts[0]) {
        return this.formatCompanyName(pathParts[0]);
      }
      // boards.greenhouse.io/company-name/...
      if (host.includes('greenhouse.io') && pathParts[0] && pathParts[0] !== 'jobs') {
        return this.formatCompanyName(pathParts[0]);
      }
      // jobs.lever.co/company-name/...
      if (host.includes('lever.co') && pathParts[0]) {
        return this.formatCompanyName(pathParts[0]);
      }
      // company.greenhouse.io
      if (ATS_PLATFORMS.some((a) => host.includes(a))) {
        const sub = host.split('.')[0];
        if (sub !== 'jobs' && sub !== 'job-boards' && sub !== 'boards') {
          return this.formatCompanyName(sub);
        }
      }
      if (host.startsWith('jobs.') || host.startsWith('careers.')) {
        const sub = host.split('.')[1];
        if (sub) return this.formatCompanyName(sub);
      }
      const part = host.split('.')[0];
      return this.formatCompanyName(part);
    } catch {
      return 'Company';
    }
  }

  private static formatCompanyName(slug: string): string {
    return slug
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  }
}
