'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { 
  ArrowLeft, Wrench, RefreshCw, CheckCircle2, XCircle, Clock, 
  Terminal, ShieldAlert, ChevronRight, HelpCircle 
} from 'lucide-react';

const API_BASE = '';

interface HealingAttempt {
  id: string;
  scraper_id: string;
  run_id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  failure_description: string | null;
  collector_id: string | null;
  records_before: number;
  records_after: number;
  validation_result: any | null;
  error: string | null;
}

export default function HealingPage() {
  const params = useParams();
  const router = useRouter();
  const scraperId = params.id as string;

  const [attempts, setAttempts] = useState<HealingAttempt[]>([]);
  const [selectedAttempt, setSelectedAttempt] = useState<HealingAttempt | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchHealingDetails = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/scrapers/${scraperId}/healing`);
      if (res.ok) {
        const data = await res.json();
        setAttempts(data);
        if (data.length > 0) {
          setSelectedAttempt(data[0]); // Select latest by default
        }
      }
    } catch (e) {
      console.error(e);
      router.push(`/scrapers/${scraperId}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealingDetails();
  }, [scraperId]);

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      SUCCESS: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      FAILED: 'bg-red-500/10 text-red-400 border-red-500/20',
      HEALING: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      VALIDATING: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      REQUESTED: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      ESCALATED: 'bg-red-500/10 text-red-400 border-red-500/20 animate-pulse'
    };
    return colors[status] || 'bg-gray-500/10 text-gray-400 border-gray-500/20';
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <RefreshCw className="h-8 w-8 text-indigo-500 animate-spin" />
        <span className="text-sm text-gray-400">Loading healing logs...</span>
      </div>
    );
  }

  // Generate timeline steps mock timestamps relative to attempt started_at
  const getTimelineSteps = (attempt: HealingAttempt) => {
    const baseTime = new Date(attempt.started_at);
    
    const fmt = (secs: number) => {
      const d = new Date(baseTime.getTime() + secs * 1000);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    const steps = [
      { time: fmt(0), label: 'Extraction failure detected', details: 'Record count collapse or schema type validation checks failed.', status: 'fail' },
      { time: fmt(2), label: 'Failure Detector generated diagnostics', details: 'Analyzed output anomalies, classified failure type, and generated self-healing prompts.', status: 'info' },
      { time: fmt(5), label: 'AI self-healing protocol triggered', details: 'Sent repair request to Bright Data Scraper Studio agent.', status: 'info' }
    ];

    if (attempt.status === 'HEALING') {
      steps.push({ time: fmt(15), label: 'Bright Data AI refactoring selectors...', details: 'Re-evaluating DOM elements and rewriting scraping script in place.', status: 'loading' });
    } else if (attempt.status === 'FAILED' && !attempt.completed_at) {
      steps.push({ time: fmt(20), label: 'Healing script failed', details: attempt.error || 'Unknown error occurred.', status: 'fail' });
    } else {
      // Completed states
      steps.push({ time: fmt(26), label: 'Bright Data code repair finished', details: 'Updated collector selectors applied programmatically.', status: 'success' });
      steps.push({ time: fmt(31), label: 'Collector execution triggered', details: 'Running healed scraper on target URL to retrieve repaired structured output.', status: 'info' });
      steps.push({ time: fmt(36), label: 'Post-healing validation checks initiated', details: 'Verifying data structures against contract types, completeness ratios, and quantity targets.', status: 'info' });

      if (attempt.status === 'SUCCESS') {
        steps.push({ time: fmt(38), label: 'Validation PASSED', details: `Healthy recovery verified. Extracted ${attempt.records_after} records successfully matching schema contracts.`, status: 'success' });
        steps.push({ time: fmt(39), label: 'Scraper status restored to HEALTHY', details: 'Pipeline successfully restored. Registry dashboard updated.', status: 'restored' });
      } else {
        steps.push({ time: fmt(38), label: 'Validation FAILED', details: attempt.error || 'Contract schema check failed after healing.', status: 'fail' });
        steps.push({ time: fmt(39), label: 'Automatic recovery failed. Escalating...', details: 'Limit reached. Flagging scraper status as ESCALATED. Human review required.', status: 'fail' });
      }
    }

    return steps;
  };

  return (
    <div className="space-y-8">
      {/* Back link */}
      <Link href={`/scrapers/${scraperId}`} className="flex items-center gap-2 text-xs font-semibold text-gray-400 hover:text-white transition">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Scraper Details
      </Link>

      <div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">Self-Healing Timeline</h1>
        <p className="text-gray-400 mt-1">Audit log of autonomous scraper repairs and schema diffs</p>
      </div>

      {attempts.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-gray-800 rounded-xl bg-gray-950/20 text-gray-500">
          No healing attempts recorded. This scraper has not failed validation yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          {/* Sidebar: Attempt History List */}
          <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 lg:col-span-1 space-y-4">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider px-2">Healing Log History</h2>
            <div className="space-y-1">
              {attempts.map((att) => {
                const isSelected = selectedAttempt?.id === att.id;
                const attDate = new Date(att.started_at).toLocaleDateString();
                const attTime = new Date(att.started_at).toLocaleTimeString();
                
                return (
                  <button
                    key={att.id}
                    onClick={() => setSelectedAttempt(att)}
                    className={`w-full text-left p-3 rounded-lg border font-mono text-xs transition flex flex-col gap-2 ${
                      isSelected
                        ? 'bg-indigo-500/10 border-indigo-500/30 text-white'
                        : 'bg-transparent border-transparent text-gray-400 hover:bg-gray-900 hover:text-white'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-bold">attempt_{att.id.substring(0, 8)}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border uppercase ${getStatusColor(att.status)}`}>
                        {att.status}
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-500">
                      {attDate} {attTime}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Main Area: Timeline and Diff of Selected Attempt */}
          {selectedAttempt && (
            <div className="lg:col-span-3 space-y-6">
              
              {/* Timeline Section */}
              <div className="bg-gray-950 border border-gray-800 rounded-xl p-6 space-y-6">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-purple-400" />
                  Self-Healing Execution Timeline
                </h2>
                
                <div className="space-y-6 font-mono text-xs relative pl-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-800">
                  {getTimelineSteps(selectedAttempt).map((step, idx) => (
                    <div key={idx} className="relative">
                      {/* Bullet Dot */}
                      <span className={`absolute -left-[23px] top-1 h-2 w-2 rounded-full border ${
                        step.status === 'success' || step.status === 'restored'
                          ? 'bg-emerald-500 border-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.3)]'
                          : step.status === 'fail'
                            ? 'bg-red-500 border-red-400'
                            : step.status === 'loading'
                              ? 'bg-purple-500 border-purple-400 animate-pulse'
                              : 'bg-gray-700 border-gray-600'
                      }`}></span>
                      
                      <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4">
                        <span className="text-gray-500 flex-shrink-0 font-semibold">{step.time}</span>
                        <div className="space-y-1">
                          <h4 className="font-bold text-slate-200">{step.label}</h4>
                          <p className="text-gray-400 text-[11px] font-sans leading-relaxed">{step.details}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Before/After Diff Schema Visualizer */}
              <div className="bg-gray-950 border border-gray-800 rounded-xl p-6 space-y-6">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-indigo-400" />
                  Before &amp; After Extraction Diff
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Before card */}
                  <div className="border border-red-500/10 bg-red-950/5 rounded-lg p-4 space-y-3 font-mono text-xs">
                    <div className="flex justify-between items-center border-b border-red-500/10 pb-2">
                      <span className="text-red-400 font-bold uppercase tracking-wider text-[10px]">FAILED RUN EXTRACTION</span>
                      <span className="text-red-400 font-bold">{selectedAttempt.records_before} records</span>
                    </div>
                    <div className="space-y-2">
                      {selectedAttempt.validation_result?.summary?.fields_presence ? (
                        Object.keys(selectedAttempt.validation_result.summary.fields_presence).map((field) => (
                          <div key={field} className="flex justify-between items-center text-red-300">
                            <span>{field}</span>
                            <span className="bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded text-[10px] font-bold">
                              broken
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="text-red-400/70 italic text-[11px]">All extraction outputs failed check.</div>
                      )}
                    </div>
                  </div>

                  {/* After card */}
                  <div className="border border-emerald-500/10 bg-emerald-950/5 rounded-lg p-4 space-y-3 font-mono text-xs">
                    <div className="flex justify-between items-center border-b border-emerald-500/10 pb-2">
                      <span className="text-emerald-400 font-bold uppercase tracking-wider text-[10px]">HEALED RUN EXTRACTION</span>
                      <span className="text-emerald-400 font-bold">{selectedAttempt.records_after} records</span>
                    </div>
                    <div className="space-y-2">
                      {selectedAttempt.validation_result?.summary?.fields_presence ? (
                        Object.keys(selectedAttempt.validation_result.summary.fields_presence).map((field) => (
                          <div key={field} className="flex justify-between items-center text-emerald-300">
                            <span>{field}</span>
                            <span className="bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded text-[10px] font-bold">
                              {selectedAttempt.status === 'SUCCESS' ? 'recovered ✓' : 'unrecovered ✗'}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="text-emerald-400/70 italic text-[11px]">Pending validation complete.</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Diagnostic Logs Panel */}
              <div className="bg-gray-950 border border-gray-800 rounded-xl p-6 space-y-4">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-indigo-400" />
                  Self-Healing Diagnostic Logs
                </h2>
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 max-h-80 overflow-y-auto">
                  <pre className="text-xs font-mono text-indigo-300 whitespace-pre-wrap leading-relaxed">
                    {selectedAttempt.failure_description || '// No diagnostic log recorded for this attempt.'}
                  </pre>
                </div>
              </div>

            </div>
          )}
        </div>
      )}
    </div>
  );
}
