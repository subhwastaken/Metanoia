'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { 
  ArrowLeft, CheckCircle2, XCircle, Clock, ShieldAlert, FileText, 
  Terminal, ShieldCheck, HelpCircle, RefreshCw
} from 'lucide-react';

const API_BASE = '';

interface Run {
  id: string;
  scraper_id: string;
  collector_id: string;
  started_at: string;
  completed_at: string | null;
  duration: number | null;
  status: string;
  records_count: number;
  validation_status: {
    success: boolean;
    summary: {
      total_records: number;
      valid_records: number;
      invalid_records: number;
      fields_presence: Record<string, number>;
      fields_type_valid: Record<string, number>;
    };
    checks: {
      json_valid: boolean;
      schema_valid: boolean;
      required_fields_present: boolean;
      record_count_threshold: boolean;
      url_validation_passed: boolean;
      historical_anomaly_check: boolean;
    };
    errors: string[];
  } | null;
  error: string | null;
}

export default function RunDetailPage() {
  const params = useParams();
  const router = useRouter();
  const scraperId = params.id as string;
  const runId = params.runId as string;

  const [run, setRun] = useState<Run | null>(null);
  const [extractedData, setExtractedData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRunData = async () => {
      try {
        const rRes = await fetch(`${API_BASE}/api/runs/${runId}`);
        if (!rRes.ok) throw new Error('Run not found');
        const rData = await rRes.json();
        setRun(rData);

        // Fetch raw extracted records
        const dRes = await fetch(`${API_BASE}/api/runs/${runId}/data`);
        if (dRes.ok) {
          const dData = await dRes.json();
          setExtractedData(dData);
        }
      } catch (e) {
        console.error(e);
        router.push(`/scrapers/${scraperId}`);
      } finally {
        setLoading(false);
      }
    };
    fetchRunData();
  }, [scraperId, runId]);

  const getRunStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      SUCCESS: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      FAILED: 'bg-red-500/10 text-red-400 border-red-500/20',
      HEALING: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      HEALED: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      VALIDATION_FAILED: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      RUNNING: 'bg-blue-500/10 text-blue-400 border-blue-500/20'
    };
    return colors[status] || 'bg-gray-500/10 text-gray-400 border-gray-500/20';
  };

  if (loading || !run) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <RefreshCw className="h-8 w-8 text-indigo-500 animate-spin" />
        <span className="text-sm text-gray-400">Loading run detail logs...</span>
      </div>
    );
  }

  const durationStr = run.duration ? `${run.duration.toFixed(1)}s` : 'N/A';
  const valStatus = run.validation_status;

  const validationChecks = valStatus ? [
    { name: 'JSON format parsing check', state: valStatus.checks.json_valid },
    { name: 'Required fields presence check', state: valStatus.checks.required_fields_present },
    { name: 'Expected schema type checks', state: valStatus.checks.schema_valid },
    { name: 'Record quantity count threshold', state: valStatus.checks.record_count_threshold },
    { name: 'Target URL integrity structure', state: valStatus.checks.url_validation_passed },
    { name: 'Historical record anomaly checking', state: valStatus.checks.historical_anomaly_check }
  ] : [];

  return (
    <div className="space-y-8">
      {/* Back link */}
      <Link href={`/scrapers/${scraperId}`} className="flex items-center gap-2 text-xs font-semibold text-gray-400 hover:text-white transition">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Scraper Details
      </Link>

      {/* Main Info */}
      <div className="bg-gray-950 border border-gray-800 rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-white font-mono">Run # {run.id.substring(0, 8)}</h1>
            <span className={`text-xs px-2.5 py-0.5 rounded-full border uppercase font-bold ${getRunStatusColor(run.status)}`}>
              {run.status}
            </span>
          </div>
          <p className="text-xs text-gray-400">Started: {new Date(run.started_at).toLocaleString()}</p>
        </div>

        <div className="flex gap-6 text-xs font-mono text-gray-400">
          <div className="text-right">
            <span className="text-[10px] text-gray-500 block uppercase font-bold tracking-wider mb-1">Records</span>
            <span className="text-slate-200 text-sm font-semibold">{run.records_count} items</span>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-gray-500 block uppercase font-bold tracking-wider mb-1">Duration</span>
            <span className="text-slate-200 text-sm font-semibold">{durationStr}</span>
          </div>
        </div>
      </div>

      {/* Main Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Validation Checklist */}
        <div className="bg-gray-950 border border-gray-800 rounded-xl p-6 lg:col-span-1 space-y-6">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-indigo-400" />
            Contract Validation Checklist
          </h2>

          <div className="space-y-4 font-mono text-xs">
            {valStatus ? (
              validationChecks.map((check) => (
                <div key={check.name} className="flex items-center justify-between p-2.5 bg-gray-900/40 rounded-lg border border-gray-900">
                  <span className="text-gray-300 pr-2">{check.name}</span>
                  {check.state ? (
                    <span className="text-emerald-400 flex items-center gap-1 font-bold text-[10px] uppercase bg-emerald-500/5 px-2 py-0.5 rounded border border-emerald-500/10">
                      PASS
                    </span>
                  ) : (
                    <span className="text-red-400 flex items-center gap-1 font-bold text-[10px] uppercase bg-red-500/5 px-2 py-0.5 rounded border border-red-500/10 animate-pulse">
                      FAIL
                    </span>
                  )}
                </div>
              ))
            ) : (
              <div className="text-gray-500 italic">No validation performed.</div>
            )}
          </div>

          {/* Detailed Error message if failed */}
          {run.error && (
            <div className="p-4 bg-red-950/20 border border-red-500/20 rounded-lg space-y-2">
              <span className="text-xs font-bold text-red-400 uppercase flex items-center gap-1.5">
                <ShieldAlert className="h-4 w-4" />
                Pipeline Error Log
              </span>
              <p className="text-[11px] text-red-300 font-mono break-words">{run.error}</p>
              {valStatus && valStatus.errors.map((err, idx) => (
                <p key={idx} className="text-[10px] text-red-400/90 font-mono">&bull; {err}</p>
              ))}
            </div>
          )}
        </div>

        {/* Center: Data Quality Completeness percentages */}
        <div className="bg-gray-950 border border-gray-800 rounded-xl p-6 lg:col-span-2 space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <FileText className="h-4 w-4 text-indigo-400" />
            Field Extraction Completeness
          </h2>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-gray-800 text-gray-500 text-[10px] uppercase tracking-wider">
                  <th className="pb-3 font-bold">Field Name</th>
                  <th className="pb-3 font-bold">Presence Rate</th>
                  <th className="pb-3 font-bold">Type Integrity</th>
                  <th className="pb-3 font-bold text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-900 text-gray-300">
                {valStatus && valStatus.summary ? (
                  Object.keys(valStatus.summary.fields_presence).map((field) => {
                    const presence = valStatus.summary.fields_presence[field];
                    const type_valid = valStatus.summary.fields_type_valid[field];
                    
                    const isHealthy = presence === 1.0 && type_valid === 1.0;
                    
                    return (
                      <tr key={field}>
                        <td className="py-3 font-bold text-slate-300">{field}</td>
                        <td className="py-3">
                          <div className="flex items-center gap-3">
                            <span className="w-12 text-slate-200">{Math.round(presence * 100)}%</span>
                            <div className="w-24 h-1.5 bg-gray-900 rounded-full overflow-hidden border border-gray-800 hidden sm:block">
                              <div className="h-full bg-indigo-500" style={{ width: `${presence * 100}%` }}></div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-3">
                            <span className="w-12 text-slate-200">{Math.round(type_valid * 100)}%</span>
                            <div className="w-24 h-1.5 bg-gray-900 rounded-full overflow-hidden border border-gray-800 hidden sm:block">
                              <div className="h-full bg-indigo-500" style={{ width: `${type_valid * 100}%` }}></div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 text-right">
                          {isHealthy ? (
                            <span className="text-emerald-400 bg-emerald-500/5 px-2 py-0.5 rounded text-[10px] uppercase font-bold border border-emerald-500/10">HEALTHY</span>
                          ) : (
                            <span className="text-red-400 bg-red-500/5 px-2 py-0.5 rounded text-[10px] uppercase font-bold border border-red-500/10">IMPAIRED</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-gray-500">
                      No structure metrics available for this run.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* JSON Record Preview */}
      <div className="bg-gray-950 border border-gray-800 rounded-xl p-6 space-y-4">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Terminal className="h-4 w-4 text-indigo-400" />
          Extracted JSON Explorer
        </h2>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 overflow-x-auto max-h-96">
          <pre className="text-xs font-mono text-indigo-300">
            {extractedData.length > 0 
              ? JSON.stringify(extractedData, null, 2) 
              : '// Zero records returned in this extraction run.'}
          </pre>
        </div>
      </div>
    </div>
  );
}
