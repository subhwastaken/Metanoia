'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Activity, CheckCircle2, XCircle, Wrench, TrendingUp, Clock,
  RefreshCw, ChevronRight, Database, Bot, Plus, ArrowUpRight, Zap,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar,
} from 'recharts';

const API_BASE = '';

interface DashboardData {
  stats: {
    total_scrapers: number;
    healthy_scrapers: number;
    failing_scrapers: number;
    healing_scrapers: number;
    escalated_scrapers: number;
    total_runs: number;
    total_healed: number;
    total_failed: number;
    success_rate: number;
    avg_recovery_time: number;
    total_cached_runs?: number;
    local_version_recoveries?: number;
  };
  activity: Array<{
    id: string;
    type: 'run' | 'healing';
    scraper_name: string;
    scraper_id: string;
    status: string;
    color: string;
    timestamp: string;
    details: string;
  }>;
  chart_data: Array<{
    date: string;
    total_runs: number;
    success_rate: number;
    records_count: number;
  }>;
}

const statusStyles: Record<string, string> = {
  SUCCESS: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  HEALED: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  FAILED: 'bg-red-500/10 text-red-400 border-red-500/20',
  HEALING: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  RUNNING: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
};

const EMPTY_CHART = Array.from({ length: 7 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - (6 - i));
  return {
    date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    total_runs: 0,
    success_rate: 100,
    records_count: 0,
  };
});

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/dashboard/stats`);
      if (res.ok) {
        setData(await res.json());
        setError(null);
      } else {
        const err = await res.json().catch(() => ({}));
        setData({
          stats: {
            total_scrapers: 0, healthy_scrapers: 0, failing_scrapers: 0,
            healing_scrapers: 0, escalated_scrapers: 0, total_runs: 0,
            total_healed: 0, total_failed: 0, success_rate: 100,
            avg_recovery_time: 0, total_cached_runs: 0, local_version_recoveries: 0,
          },
          activity: [],
          chart_data: EMPTY_CHART,
        });
        setError(err.error || 'Could not load dashboard');
      }
    } catch (e) {
      console.error('Failed to load dashboard data:', e);
      setData({
        stats: {
          total_scrapers: 0, healthy_scrapers: 0, failing_scrapers: 0,
          healing_scrapers: 0, escalated_scrapers: 0, total_runs: 0,
          total_healed: 0, total_failed: 0, success_rate: 100,
          avg_recovery_time: 0, total_cached_runs: 0, local_version_recoveries: 0,
        },
        activity: [],
        chart_data: EMPTY_CHART,
      });
      setError('Network error loading dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <RefreshCw className="h-6 w-6 text-emerald-500 animate-spin" />
        <span className="text-sm text-zinc-500">Loading dashboard…</span>
      </div>
    );
  }

  if (!data) return null;

  const { stats, activity, chart_data } = data;

  const primaryKpis = [
    {
      label: 'Success rate',
      value: `${stats.success_rate}%`,
      sub: `${stats.total_runs} total runs`,
      icon: TrendingUp,
      accent: 'text-emerald-400',
    },
    {
      label: 'Healthy scrapers',
      value: stats.healthy_scrapers,
      sub: `of ${stats.total_scrapers} registered`,
      icon: CheckCircle2,
      accent: 'text-emerald-400',
    },
    {
      label: 'Self-healed',
      value: stats.total_healed,
      sub: 'auto-recovered runs',
      icon: Wrench,
      accent: 'text-blue-400',
    },
    {
      label: 'Avg recovery',
      value: `${stats.avg_recovery_time}s`,
      sub: 'mean time to repair',
      icon: Clock,
      accent: 'text-amber-400',
    },
  ];

  const secondaryKpis = [
    { label: 'Failing', value: stats.failing_scrapers + stats.escalated_scrapers, icon: XCircle },
    { label: 'Healing now', value: stats.healing_scrapers, icon: Activity },
    { label: 'Cache hits', value: stats.total_cached_runs ?? 0, icon: Zap },
    { label: 'Local recoveries', value: stats.local_version_recoveries ?? 0, icon: RefreshCw },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {error && (
        <div className="saas-card p-4 border-amber-500/20 bg-amber-500/5 text-[13px] text-amber-400/90">
          {error} — register a scraper to get started.
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-[12px] font-medium text-emerald-400/80 uppercase tracking-wider mb-1">Overview</p>
          <h1 className="text-2xl font-semibold text-white tracking-tight">Reliability Dashboard</h1>
          <p className="text-[13px] text-zinc-500 mt-1">Monitor scraper health, healing events, and pipeline throughput.</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/scrapers"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-medium bg-white/[0.04] border border-white/[0.08] text-zinc-300 hover:bg-white/[0.06] hover:text-white transition"
          >
            <Plus className="h-3.5 w-3.5" />
            Register scraper
          </Link>
          <Link
            href="/agent"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition"
          >
            <Bot className="h-3.5 w-3.5" />
            AI Agent
          </Link>
        </div>
      </div>

      {/* Primary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {primaryKpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="saas-card p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[12px] font-medium text-zinc-500">{kpi.label}</span>
                <Icon className={`h-4 w-4 ${kpi.accent}`} />
              </div>
              <div className="text-3xl font-semibold text-white tracking-tight">{kpi.value}</div>
              <p className="text-[12px] text-zinc-600 mt-1">{kpi.sub}</p>
            </div>
          );
        })}
      </div>

      {/* Secondary + Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="saas-card p-4 lg:col-span-1">
          <h2 className="text-[13px] font-medium text-zinc-400 mb-3">System status</h2>
          <div className="space-y-2">
            {secondaryKpis.map((kpi) => {
              const Icon = kpi.icon;
              return (
                <div key={kpi.label} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
                  <div className="flex items-center gap-2 text-[13px] text-zinc-400">
                    <Icon className="h-3.5 w-3.5 text-zinc-600" />
                    {kpi.label}
                  </div>
                  <span className="text-[13px] font-medium text-white">{kpi.value}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="saas-card p-5 lg:col-span-2">
          <h2 className="text-[13px] font-medium text-zinc-400 mb-4">Success rate trend</h2>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart_data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="rateGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="date" stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#52525b" domain={[0, 100]} fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#a1a1aa' }}
                />
                <Area type="monotone" dataKey="success_rate" stroke="#10b981" strokeWidth={2} fill="url(#rateGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Volume chart + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="saas-card p-5">
          <h2 className="text-[13px] font-medium text-zinc-400 mb-4">Records extracted</h2>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart_data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="date" stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="records_count" fill="#3b82f6" radius={[4, 4, 0, 0]} opacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="saas-card overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
            <h2 className="text-[13px] font-medium text-zinc-400">Recent activity</h2>
            <span className="flex items-center gap-1.5 text-[11px] text-zinc-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </span>
          </div>
          <div className="divide-y divide-white/[0.04] max-h-[220px] overflow-y-auto">
            {activity.length === 0 ? (
              <div className="p-8 text-center text-[13px] text-zinc-600">
                No activity yet. Register a scraper and run it.
              </div>
            ) : (
              activity.slice(0, 8).map((log) => (
                <Link
                  key={log.id}
                  href={log.type === 'run' ? `/scrapers/${log.scraper_id}` : `/scrapers/${log.scraper_id}/healing`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.02] transition group"
                >
                  <div className="h-8 w-8 rounded-lg bg-white/[0.04] flex items-center justify-center shrink-0">
                    {log.type === 'run' ? (
                      <Database className="h-3.5 w-3.5 text-zinc-500" />
                    ) : (
                      <Wrench className="h-3.5 w-3.5 text-blue-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-zinc-200 truncate">{log.scraper_name}</p>
                    <p className="text-[11px] text-zinc-600 truncate">{log.details}</p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded border font-medium uppercase ${statusStyles[log.status] || 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
                    {log.status}
                  </span>
                  <ArrowUpRight className="h-3.5 w-3.5 text-zinc-700 group-hover:text-zinc-400 shrink-0" />
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
