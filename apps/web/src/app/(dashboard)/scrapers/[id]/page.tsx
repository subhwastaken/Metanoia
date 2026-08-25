'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { 
  ArrowLeft, Play, Wrench, RefreshCw, CheckCircle2, XCircle, 
  Clock, Database, Tag, FileJson, ShieldAlert, Check, Calendar, ChevronRight, Pause, Trash2 
} from 'lucide-react';

const API_BASE = '';

interface Scraper {
  id: string;
  name: string;
  description: string;
  target_url: string;
  collector_id: string;
  schedule: string;
  status: string;
  schema_definition: Record<string, string>;
  last_run: string | null;
  last_success: string | null;
  success_rate: number;
  current_version: number;
}

interface Run {
  id: string;
  scraper_id: string;
  collector_id: string;
  started_at: string;
  completed_at: string | null;
  duration: number | null;
  status: string;
  records_count: number;
  validation_status: any | null;
  error: string | null;
}

export default function ScraperDetailPage() {
  const params = useParams();
  const router = useRouter();
  const scraperId = params.id as string;

  const [scraper, setScraper] = useState<Scraper | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [versions, setVersions] = useState<any[]>([]);
  const [showOverride, setShowOverride] = useState(false);
  const [overrideSelectors, setOverrideSelectors] = useState<Record<string, string>>({});
  const [overrideMessage, setOverrideMessage] = useState<string | null>(null);
  const [overrideSuccess, setOverrideSuccess] = useState<boolean | null>(null);

  const [latestRunData, setLatestRunData] = useState<any[] | null>(null);
  const [loadingLatestData, setLoadingLatestData] = useState(false);
  const [isPolling, setIsPolling] = useState(false);

  const fetchScraperDetails = async () => {
    try {
      const sRes = await fetch(`${API_BASE}/api/scrapers/${scraperId}`);
      if (!sRes.ok) throw new Error('Scraper not found');
      const sData = await sRes.json();
      setScraper(sData);

      const rRes = await fetch(`${API_BASE}/api/scrapers/${scraperId}/runs`);
      if (rRes.ok) {
        const rData = await rRes.json();
        setRuns(rData);
      }

      const vRes = await fetch(`${API_BASE}/api/scrapers/${scraperId}/versions`);
      if (vRes.ok) {
        const vData = await vRes.json();
        setVersions(vData);
        if (vData.length > 0 && Object.keys(overrideSelectors).length === 0) {
          setOverrideSelectors(vData[0].selectors);
        }
      }
    } catch (e) {
      console.error(e);
      router.push('/scrapers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScraperDetails();
  }, [scraperId]);

  // Dynamic Polling: Check status every 2 seconds if there is a running/healing job, or if we just triggered one
  useEffect(() => {
    const hasActiveJobs = runs.some(r => r.status === 'RUNNING') || scraper?.status === 'HEALING' || isPolling;
    
    if (hasActiveJobs) {
      const interval = setInterval(async () => {
        await fetchScraperDetails();
        if (isPolling) {
          try {
            const sRes = await fetch(`${API_BASE}/api/scrapers/${scraperId}/runs`);
            if (sRes.ok) {
              const latestRuns = await sRes.json();
              const anyRunning = latestRuns.some((r: any) => r.status === 'RUNNING');
              if (!anyRunning && latestRuns.length > 0) {
                setIsPolling(false);
              }
            }
          } catch (err) {
            console.error(err);
          }
        }
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [runs, scraper, isPolling, scraperId]);

  // Fetch data of the latest run dynamically
  useEffect(() => {
    const fetchLatestRunData = async () => {
      if (runs.length > 0) {
        const latestRun = runs[0];
        setLoadingLatestData(true);
        try {
          const res = await fetch(`${API_BASE}/api/runs/${latestRun.id}/data`);
          if (res.ok) {
            setLatestRunData(await res.json());
          } else {
            setLatestRunData(null);
          }
        } catch (e) {
          console.error(e);
          setLatestRunData(null);
        } finally {
          setLoadingLatestData(false);
        }
      } else {
        setLatestRunData(null);
      }
    };
    fetchLatestRunData();
  }, [runs]);

  const handleRunCollector = async () => {
    setActionLoading(true);
    setMessage('Triggering Bright Data collector run...');
    setIsPolling(true);
    try {
      const res = await fetch(`${API_BASE}/api/scrapers/${scraperId}/run`, { method: 'POST' });
      if (res.ok) {
        setMessage('Scraper run triggered successfully. Monitoring execution...');
        fetchScraperDetails();
      }
    } catch (e) {
      setMessage('Failed to trigger scraper run.');
      setIsPolling(false);
    } finally {
      setActionLoading(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const handleHealScraper = async () => {
    setActionLoading(true);
    setMessage('Initiating self-healing protocol...');
    setIsPolling(true);
    try {
      const res = await fetch(`${API_BASE}/api/scrapers/${scraperId}/heal`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setMessage(`Self-Healing attempt: ${data.attempt_status}. Records before: ${data.records_before}, after: ${data.records_after}`);
        fetchScraperDetails();
      } else {
        setMessage(`Healing error: ${data.detail || 'Could not trigger self-healing'}`);
        setIsPolling(false);
      }
    } catch (e) {
      setMessage('Failed to trigger healing.');
      setIsPolling(false);
    } finally {
      setActionLoading(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const handlePauseToggle = async () => {
    if (!scraper) return;
    const isPaused = scraper.status === 'PAUSED';
    const nextStatus = isPaused ? 'HEALTHY' : 'PAUSED';
    setActionLoading(true);
    setMessage(isPaused ? 'Resuming scraper scheduler...' : 'Pausing scraper scheduler...');
    try {
      const res = await fetch(`${API_BASE}/api/scrapers/${scraperId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        setMessage(isPaused ? 'Scraper scheduler resumed.' : 'Scraper scheduler paused.');
        fetchScraperDetails();
      } else {
        setMessage('Failed to update scraper status.');
      }
    } catch (e) {
      setMessage('Failed to update status.');
    } finally {
      setActionLoading(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const handleDeleteScraper = async () => {
    if (!scraper) return;
    const confirmed = window.confirm(`Are you sure you want to delete "${scraper.name}"? This will delete all its runs and healing history.`);
    if (!confirmed) return;

    setActionLoading(true);
    setMessage('Deleting scraper...');
    try {
      const res = await fetch(`${API_BASE}/api/scrapers/${scraperId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        router.push('/scrapers');
      } else {
        setMessage('Failed to delete scraper.');
        setActionLoading(false);
      }
    } catch (e) {
      setMessage('Failed to delete scraper.');
      setActionLoading(false);
    }
  };

  const handleOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setOverrideMessage('Submitting selector overrides and validating extraction...');
    setOverrideSuccess(null);
    try {
      const res = await fetch(`${API_BASE}/api/scrapers/${scraperId}/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectors: overrideSelectors })
      });
      const data = await res.json();
      if (res.ok && data.status === 'HEALTHY') {
        setOverrideSuccess(true);
        setOverrideMessage('Override successful! Active selectors updated and verified.');
        fetchScraperDetails();
      } else {
        setOverrideSuccess(false);
        setOverrideMessage(`Validation failed: ${data.error || 'Selectors do not match catalog contract.'}`);
      }
    } catch (err) {
      setOverrideSuccess(false);
      setOverrideMessage('Error submitting selector overrides.');
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      HEALTHY: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      FAILING: 'bg-red-500/10 text-red-400 border-red-500/20',
      HEALING: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      ESCALATED: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    };
    return badges[status] || 'bg-gray-500/10 text-gray-400 border-gray-500/20';
  };

  const getRunStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      SUCCESS: 'text-emerald-400',
      FAILED: 'text-red-400',
      HEALING: 'text-purple-400',
      HEALED: 'text-purple-400',
      VALIDATION_FAILED: 'text-amber-400',
      RUNNING: 'text-blue-400 animate-pulse'
    };
    return colors[status] || 'text-gray-400';
  };

  if (loading || !scraper) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <RefreshCw className="h-8 w-8 text-indigo-500 animate-spin" />
        <span className="text-sm text-gray-400">Loading collector details...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Back link */}
      <Link href="/scrapers" className="flex items-center gap-2 text-xs font-semibold text-gray-400 hover:text-white transition">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Scrapers
      </Link>

      {/* Main Info Header */}
      <div className="bg-gray-950 border border-gray-800 rounded-xl p-6 flex flex-col lg:flex-row justify-between gap-6">
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-extrabold text-white">{scraper.name}</h1>
            <span className={`text-xs px-2.5 py-0.5 rounded-full border uppercase font-bold ${getStatusBadge(scraper.status)}`}>
              {scraper.status}
            </span>
          </div>
          <p className="text-sm text-gray-400 max-w-2xl">{scraper.description || 'No description provided.'}</p>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-2 text-xs font-mono text-gray-400 border-t border-gray-900">
            <div>
              <span className="text-[10px] text-gray-500 block uppercase font-bold tracking-wider mb-1">Collector ID</span>
              <span className="text-slate-200">{scraper.collector_id}</span>
            </div>
            <div>
              <span className="text-[10px] text-gray-500 block uppercase font-bold tracking-wider mb-1">Target Endpoint</span>
              <a href={scraper.target_url} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline truncate block max-w-[200px]">{scraper.target_url}</a>
            </div>
            <div>
              <span className="text-[10px] text-gray-500 block uppercase font-bold tracking-wider mb-1">Schedule</span>
              <span className="text-slate-200">
                {scraper.schedule === '0 */1 * * *' ? 'Every 1 hour' :
                 scraper.schedule === '0 */2 * * *' ? 'Every 2 hours' :
                 scraper.schedule === '0 */6 * * *' ? 'Every 6 hours' :
                 scraper.schedule === '0 */12 * * *' ? 'Every 12 hours' :
                 scraper.schedule === '0 0 * * *' ? 'Every day (24 hours)' :
                 scraper.schedule}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-gray-500 block uppercase font-bold tracking-wider mb-1">Active Version</span>
              <span className="text-slate-200">v{scraper.current_version}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-row lg:flex-col justify-end items-end gap-3 flex-shrink-0 border-t lg:border-t-0 border-gray-900 pt-4 lg:pt-0">
          <div className="flex flex-wrap gap-2 w-full lg:w-auto">
            <button
              onClick={handleRunCollector}
              disabled={actionLoading || scraper.status === 'HEALING' || scraper.status === 'PAUSED'}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-800 text-white px-4 py-2 rounded-lg text-xs font-semibold transition"
            >
              <Play className="h-3.5 w-3.5" /> Trigger Run
            </button>
            <button
              onClick={handlePauseToggle}
              disabled={actionLoading || scraper.status === 'HEALING'}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold border transition ${
                scraper.status === 'PAUSED'
                  ? 'bg-emerald-950/20 hover:bg-emerald-900/30 text-emerald-400 border-emerald-500/20'
                  : 'bg-amber-950/10 hover:bg-amber-900/20 text-amber-400 border-amber-500/20'
              }`}
            >
              {scraper.status === 'PAUSED' ? (
                <>
                  <Play className="h-3.5 w-3.5" /> Resume
                </>
              ) : (
                <>
                  <Pause className="h-3.5 w-3.5" /> Pause
                </>
              )}
            </button>
            <button
              onClick={handleHealScraper}
              disabled={actionLoading || scraper.status === 'HEALTHY' || scraper.status === 'HEALING' || scraper.status === 'PAUSED'}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-800 text-white px-4 py-2 rounded-lg text-xs font-semibold border border-purple-500/20 transition"
            >
              <Wrench className="h-3.5 w-3.5" /> Force Heal
            </button>
            <button
              onClick={() => {
                setShowOverride(true);
                if (versions.length > 0) setOverrideSelectors(versions[0].selectors);
              }}
              disabled={actionLoading || scraper.status === 'HEALING'}
              className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-300 px-4 py-2 rounded-lg text-xs font-semibold transition"
            >
              <Wrench className="h-3.5 w-3.5 text-gray-400" /> Override Selectors
            </button>
            <button
              onClick={handleDeleteScraper}
              disabled={actionLoading}
              className="flex items-center gap-2 bg-red-950/30 hover:bg-red-900/40 border border-red-500/20 text-red-400 px-4 py-2 rounded-lg text-xs font-semibold transition ml-auto"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete Scraper
            </button>
          </div>
          <Link
            href={`/scrapers/${scraper.id}/healing`}
            className="text-xs text-indigo-400 hover:underline font-semibold"
          >
            View Self-Healing Attempts &rarr;
          </Link>
        </div>
      </div>

      {/* Action Logs Banner */}
      {message && (
        <div className="p-4 bg-indigo-950/20 border border-indigo-500/20 rounded-xl text-xs font-mono text-indigo-300 flex items-center gap-3">
          <RefreshCw className="h-4 w-4 animate-spin" />
          {message}
        </div>
      )}

      {/* Selector Override Portal */}
      {(scraper.status !== 'HEALTHY' || showOverride) && (
        <div className="bg-gray-950 border border-indigo-500/30 rounded-xl p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Wrench className="h-4 w-4 text-indigo-400" />
              Developer Selector Override Portal
            </h2>
            <button
              onClick={() => setShowOverride(false)}
              className="text-xs text-gray-400 hover:text-white"
            >
              Cancel
            </button>
          </div>
          <p className="text-xs text-gray-400">
            Override the scraper selectors manually. The platform will execute a test run and validate the extracted records against the contract schema before promoting them to active.
          </p>
          
          <form onSubmit={handleOverrideSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.keys(scraper.schema_definition).map((field) => (
                <div key={field} className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-300 capitalize">{field.replace('_', ' ')} Selector</label>
                  <input
                    type="text"
                    value={overrideSelectors[field] || ''}
                    onChange={(e) => setOverrideSelectors({ ...overrideSelectors, [field]: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
                    placeholder="e.g. .product-title"
                    required
                  />
                </div>
              ))}
            </div>

            {overrideMessage && (
              <div className={`p-3 rounded-lg text-xs font-mono border ${
                overrideSuccess === true ? 'bg-emerald-950/20 border-emerald-500/20 text-emerald-300' :
                overrideSuccess === false ? 'bg-red-950/20 border-red-500/20 text-red-300' :
                'bg-indigo-950/20 border-indigo-500/20 text-indigo-300'
              }`}>
                {overrideMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={actionLoading}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-800 text-white px-4 py-2 rounded-lg text-xs font-semibold transition"
            >
              Test and Save Selectors
            </button>
          </form>
        </div>
      )}

      {/* Contract & Success Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Card: Extraction Schema Contract */}
        <div className="bg-gray-950 border border-gray-800 rounded-xl p-6 md:col-span-1">
          <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
            <FileJson className="h-4 w-4 text-indigo-400" />
            Extraction Contract Schema
          </h2>
          <div className="space-y-3 font-mono text-xs">
            {Object.entries(scraper.schema_definition).map(([field, type]) => (
              <div key={field} className="flex justify-between items-center p-2.5 bg-gray-900/50 rounded-lg border border-gray-900">
                <span className="font-semibold text-slate-300">{field}</span>
                <span className="text-gray-500 text-[10px] uppercase font-bold bg-gray-800 px-2 py-0.5 rounded">
                  {type}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Right Card: Runs history table */}
        <div className="bg-gray-950 border border-gray-800 rounded-xl p-6 md:col-span-2 space-y-4">
          <h2 className="text-base font-bold text-white">Execution Run History</h2>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-gray-800 text-gray-500 text-[10px] uppercase tracking-wider">
                  <th className="pb-3 font-bold">Run ID</th>
                  <th className="pb-3 font-bold">Executed At</th>
                  <th className="pb-3 font-bold">Status</th>
                  <th className="pb-3 font-bold">Records</th>
                  <th className="pb-3 font-bold">Duration</th>
                  <th className="pb-3 font-bold text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-900 text-gray-300">
                {runs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-500">
                      No runs logged for this scraper. Click &quot;Trigger Run&quot; to execute.
                    </td>
                  </tr>
                ) : (
                  runs.map((run) => {
                    const runDate = new Date(run.started_at).toLocaleTimeString();
                    const durationStr = run.duration ? `${run.duration.toFixed(1)}s` : 'N/A';
                    
                    return (
                      <tr key={run.id} className="hover:bg-gray-900/20">
                        <td className="py-3 font-bold text-slate-400">
                          run_{run.id.substring(0, 8)}
                        </td>
                        <td className="py-3 text-gray-400">
                          {new Date(run.started_at).toLocaleDateString()} {runDate}
                        </td>
                        <td className="py-3">
                          <span className={`font-bold capitalize flex items-center gap-1.5 ${getRunStatusColor(run.status)}`}>
                            {run.status === 'SUCCESS' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                            {run.status === 'FAILED' && <XCircle className="h-3.5 w-3.5 text-red-500" />}
                            {run.status === 'VALIDATION_FAILED' && <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />}
                            {run.status === 'HEALED' && <Wrench className="h-3.5 w-3.5 text-purple-500" />}
                            {run.status}
                          </span>
                        </td>
                        <td className="py-3 font-semibold text-slate-200">
                          {run.records_count}
                        </td>
                        <td className="py-3 font-semibold text-slate-200">
                          {durationStr}
                        </td>
                        <td className="py-3 text-right">
                          <Link
                             href={`/scrapers/${scraperId}/runs/${run.id}`}
                            className="p-1 hover:bg-gray-800 rounded inline-flex text-indigo-400 hover:text-indigo-300 transition"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Latest Scraped Output Preview */}
      {runs.length > 0 && (
        <div className="bg-gray-950 border border-gray-800 rounded-xl p-6 space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <FileJson className="h-4 w-4 text-emerald-400" />
            Latest Scraped Output (Run #{runs[0].id.substring(0, 8)})
          </h2>
          {loadingLatestData ? (
            <div className="flex items-center justify-center py-8 gap-2 text-xs text-gray-500 font-mono">
              <RefreshCw className="h-4 w-4 animate-spin text-indigo-500" />
              Loading latest scraped output...
            </div>
          ) : latestRunData && latestRunData.length > 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 overflow-x-auto max-h-96">
              <pre className="text-xs font-mono text-emerald-300">
                {JSON.stringify(latestRunData, null, 2)}
              </pre>
            </div>
          ) : (
            <div className="text-xs font-mono text-gray-500 bg-gray-900/30 border border-gray-900 rounded-lg p-4">
              // No records returned or failed to load data for this run.
            </div>
          )}
        </div>
      )}

      {/* Selector Version History */}
      <div className="bg-gray-950 border border-gray-800 rounded-xl p-6 space-y-4">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-indigo-400" />
          Selector Lineage History
        </h2>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-[10px] uppercase tracking-wider">
                <th className="pb-3 font-bold">Version</th>
                <th className="pb-3 font-bold">Selectors Config</th>
                <th className="pb-3 font-bold">Success Scrapes</th>
                <th className="pb-3 font-bold">Created At</th>
                <th className="pb-3 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-900 text-gray-300">
              {versions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-500">
                    No selector history logged.
                  </td>
                </tr>
              ) : (
                versions.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-900/20">
                    <td className="py-3 font-bold text-slate-400">
                      v{v.version} {v.version === scraper.current_version && <span className="text-[9px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded ml-1 uppercase font-bold">active</span>}
                    </td>
                    <td className="py-3 text-gray-400 max-w-[400px] truncate">
                      {JSON.stringify(v.selectors)}
                    </td>
                    <td className="py-3 font-semibold text-slate-200">
                      {v.success_count} successful runs
                    </td>
                    <td className="py-3 text-gray-400">
                      {new Date(v.created_at).toLocaleString()}
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => {
                          setOverrideSelectors(v.selectors);
                          setShowOverride(true);
                          window.scrollTo({ top: 300, behavior: "smooth" });
                        }}
                        className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
                      >
                        Apply as Template
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
