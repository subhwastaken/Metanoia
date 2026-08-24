'use client';

import React, { useState } from 'react';
import {
  Send, Bot, AlertCircle, Loader2, ExternalLink,
  Building2, LayoutList, Sparkles, MapPin, Briefcase,
} from 'lucide-react';

interface Job {
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
  source_type?: 'company' | 'board';
}

function formatPosted(job: Job): string | null {
  if (job.posted) return job.posted;
  if (job.posted_days_ago === 0) return 'Today';
  if (job.posted_days_ago === 1) return 'Yesterday';
  if (job.posted_days_ago != null && job.posted_days_ago <= 14) return `${job.posted_days_ago}d ago`;
  return null;
}

function isFresh(job: Job): boolean {
  const days = job.posted_days_ago;
  return days != null && days <= 14;
}

function JobCard({ job }: { job: Job }) {
  const isCompany = job.source_type === 'company';
  const posted = formatPosted(job);

  return (
    <div className="saas-card saas-card-hover p-4 group">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            {isCompany && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/15">
                Direct apply
              </span>
            )}
            {isFresh(job) && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/15">
                Active
              </span>
            )}
          </div>
          <h4 className="text-[14px] font-semibold text-white leading-snug group-hover:text-emerald-400/90 transition">
            {job.title}
          </h4>
          <div className="flex items-center gap-2 mt-1.5 text-[12px] text-zinc-500">
            <Briefcase className="h-3 w-3 shrink-0" />
            <span className="text-zinc-400">{job.company}</span>
            <span className="text-zinc-700">·</span>
            <MapPin className="h-3 w-3 shrink-0" />
            <span>{job.location}</span>
          </div>
          {(posted || job.salary) && (
            <p className="text-[11px] text-zinc-600 mt-1.5">
              {posted && <span className={isFresh(job) ? 'text-amber-400/70' : ''}>{posted}</span>}
              {posted && job.salary && ' · '}
              {job.salary && <span className="text-emerald-400/70">{job.salary}</span>}
            </p>
          )}
          {job.description && (
            <p className="text-[12px] text-zinc-600 mt-2 line-clamp-2 leading-relaxed">{job.description}</p>
          )}
          {job.skills && job.skills.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3">
              {job.skills.slice(0, 5).map((skill) => (
                <span
                  key={skill}
                  className="text-[10px] px-2 py-0.5 rounded bg-white/[0.03] text-zinc-500 border border-white/[0.05]"
                >
                  {skill}
                </span>
              ))}
            </div>
          )}
        </div>
        <a
          href={job.link}
          target="_blank"
          rel="noopener noreferrer"
          className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-medium transition ${
            isCompany
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
              : 'bg-white/[0.06] hover:bg-white/[0.1] text-zinc-300 border border-white/[0.08]'
          }`}
        >
          {isCompany ? 'Apply' : 'View'}
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

function JobSection({
  title,
  icon: Icon,
  jobs,
  accent,
}: {
  title: string;
  icon: React.ElementType;
  jobs: Job[];
  accent: 'emerald' | 'zinc';
}) {
  if (jobs.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 pb-2 border-b border-white/[0.06]">
        <Icon className={`h-4 w-4 ${accent === 'emerald' ? 'text-emerald-400' : 'text-zinc-500'}`} />
        <h3 className="text-[13px] font-medium text-zinc-300">{title}</h3>
        <span className="text-[11px] text-zinc-600 ml-auto">{jobs.length} results</span>
      </div>
      <div className="space-y-2">
        {jobs.map((job, idx) => (
          <JobCard key={`${job.link}-${idx}`} job={job} />
        ))}
      </div>
    </div>
  );
}

export default function AgentPage() {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [companyJobs, setCompanyJobs] = useState<Job[]>([]);
  const [boardJobs, setBoardJobs] = useState<Job[]>([]);
  const [intent, setIntent] = useState<{ location?: string; keywords?: string[]; search_query?: string } | null>(null);

  const suggestChips = [
    'find me devops job in blr startups which are currently hiring',
    'Find remote React developer roles',
    'Y Combinator software engineer jobs in SF',
  ];

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    setError(null);
    setCompanyJobs([]);
    setBoardJobs([]);
    setIntent(null);
    setLogs(['→ Parsing search intent with Gemini…']);

    try {
      const response = await fetch('/api/agent/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) throw new Error(`Search failed (${response.status})`);

      const data = await response.json();
      if (data.success) {
        setLogs(data.logs || []);
        setCompanyJobs(data.company_jobs || []);
        setBoardJobs(data.board_jobs || []);
        setIntent(data.intent || null);
      } else {
        throw new Error(data.message || 'Search failed.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Agent error';
      setError(msg);
      setLogs((prev) => [...prev, `✗ ${msg}`]);
    } finally {
      setLoading(false);
    }
  };

  const hasResults = companyJobs.length > 0 || boardJobs.length > 0;
  const totalCount = companyJobs.length + boardJobs.length;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <p className="text-[12px] font-medium text-emerald-400/80 uppercase tracking-wider mb-1">AI Intelligence</p>
        <h1 className="text-2xl font-semibold text-white tracking-tight">Job Search Agent</h1>
        <p className="text-[13px] text-zinc-500 mt-1">
          Describe the role you want — we find active openings on company career pages and job boards.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Search panel */}
        <div className="lg:col-span-2 space-y-4">
          <div className="saas-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/15 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-emerald-400" />
              </div>
              <span className="text-[14px] font-medium text-white">What are you looking for?</span>
            </div>

            <form onSubmit={handleSearch}>
              <div className="relative">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g. devops jobs at BLR startups currently hiring"
                  rows={4}
                  disabled={loading}
                  className="w-full bg-[#0a0a0c] border border-white/[0.08] rounded-lg px-3 py-3 pr-12 text-[13px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 resize-none"
                />
                <button
                  type="submit"
                  disabled={loading || !prompt.trim()}
                  className="absolute bottom-2.5 right-2.5 p-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white transition"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>

              <div className="mt-4">
                <p className="text-[11px] text-zinc-600 mb-2">Suggestions</p>
                <div className="flex flex-col gap-1.5">
                  {suggestChips.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setPrompt(chip)}
                      disabled={loading}
                      className="text-left text-[12px] px-3 py-2 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03] border border-transparent hover:border-white/[0.06] transition truncate"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            </form>
          </div>

          {/* Logs */}
          {(logs.length > 0 || loading) && (
            <div className="saas-card overflow-hidden">
              <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
                <span className="text-[12px] font-medium text-zinc-500">Pipeline log</span>
                {loading && <Loader2 className="h-3.5 w-3.5 text-emerald-400 animate-spin" />}
              </div>
              <div className="p-3 max-h-56 overflow-y-auto font-mono text-[11px] space-y-1">
                {logs.map((log, i) => (
                  <div
                    key={i}
                    className={`px-2 py-1 rounded ${
                      log.startsWith('✗') || log.startsWith('❌') ? 'text-red-400' :
                      log.startsWith('✅') || log.startsWith('✓') || log.startsWith('🎉') ? 'text-emerald-400' :
                      'text-zinc-500'
                    }`}
                  >
                    {log}
                  </div>
                ))}
                {loading && logs.length > 0 && (
                  <div className="text-zinc-600 px-2 py-1 animate-pulse">Searching live listings…</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Results panel */}
        <div className="lg:col-span-3 space-y-4">
          {error && (
            <div className="saas-card p-4 flex gap-3 border-red-500/20 bg-red-500/5">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[13px] font-medium text-red-400">Search failed</p>
                <p className="text-[12px] text-red-400/70 mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {hasResults && (
            <div className="saas-card p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-emerald-400" />
                </div>
                <div>
                  <p className="text-[14px] font-medium text-white">{totalCount} listings found</p>
                  {intent && (
                    <p className="text-[11px] text-zinc-600 mt-0.5">
                      {intent.keywords?.join(' · ')} — {intent.location}
                    </p>
                  )}
                </div>
              </div>
              {intent?.search_query && (
                <span className="hidden sm:block text-[11px] text-zinc-600 max-w-[200px] truncate" title={intent.search_query}>
                  &ldquo;{intent.search_query}&rdquo;
                </span>
              )}
            </div>
          )}

          {hasResults ? (
            <div className="space-y-6">
              <JobSection title="Company career pages" icon={Building2} jobs={companyJobs} accent="emerald" />
              <JobSection title="Job board listings" icon={LayoutList} jobs={boardJobs} accent="zinc" />
            </div>
          ) : !loading && !error ? (
            <div className="saas-card h-80 flex flex-col items-center justify-center text-center p-8">
              <div className="h-12 w-12 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-4">
                <Bot className="h-6 w-6 text-zinc-600" />
              </div>
              <p className="text-[14px] font-medium text-zinc-400">Ready to search</p>
              <p className="text-[12px] text-zinc-600 mt-1 max-w-xs">
                Type a prompt or pick a suggestion. Results appear here with direct apply links.
              </p>
            </div>
          ) : loading ? (
            <div className="saas-card h-80 flex flex-col items-center justify-center text-center p-8">
              <Loader2 className="h-7 w-7 text-emerald-500 animate-spin mb-4" />
              <p className="text-[14px] font-medium text-zinc-400">Searching live listings</p>
              <p className="text-[12px] text-zinc-600 mt-1">Google Jobs + company ATS platforms · 10–20s</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
