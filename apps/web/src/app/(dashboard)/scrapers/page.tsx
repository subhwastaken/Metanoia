'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Plus, RefreshCw, Globe, Server, ChevronRight, X,
  Database, CheckCircle2, AlertCircle, Wrench,
} from 'lucide-react';

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
}

const STATUS: Record<string, string> = {
  HEALTHY: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  FAILING: 'bg-red-500/10 text-red-400 border-red-500/20',
  HEALING: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  ESCALATED: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
};

const DEFAULT_SCHEMA = [
  { name: 'product_name', type: 'string' },
  { name: 'price', type: 'number' },
  { name: 'currency', type: 'string' },
  { name: 'availability', type: 'string' },
  { name: 'product_url', type: 'url' },
];

export default function ScrapersPage() {
  const [scrapers, setScrapers] = useState<Scraper[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [targetUrl, setTargetUrl] = useState('/demo-site');
  const [collectorId, setCollectorId] = useState('');
  const [schedule, setSchedule] = useState('0 */6 * * *');
  const [autoHeal, setAutoHeal] = useState(true);
  const [schemaFields, setSchemaFields] = useState(DEFAULT_SCHEMA);

  const fetchScrapers = async () => {
    try {
      const res = await fetch('/api/scrapers');
      if (res.ok) {
        setScrapers(await res.json());
        setError(null);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error || 'Failed to load scrapers');
      }
    } catch {
      setError('Network error loading scrapers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchScrapers(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const schema_definition: Record<string, string> = {};
    schemaFields.forEach((f) => {
      if (f.name.trim()) schema_definition[f.name] = f.type;
    });

    try {
      const res = await fetch('/api/scrapers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, description, target_url: targetUrl,
          collector_id: collectorId || undefined,
          schema_definition, schedule, auto_heal: autoHeal,
        }),
      });

      if (res.ok) {
        setName(''); setDescription(''); setTargetUrl('/demo-site');
        setCollectorId(''); setShowAddForm(false);
        setSchemaFields(DEFAULT_SCHEMA);
        fetchScrapers();
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error || 'Failed to register scraper');
      }
    } catch {
      setError('Network error registering scraper');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-[12px] font-medium text-emerald-400/80 uppercase tracking-wider mb-1">Registry</p>
          <h1 className="text-2xl font-semibold text-white tracking-tight">Scrapers</h1>
          <p className="text-[13px] text-zinc-500 mt-1">
            Register collectors, define extraction schemas, and monitor pipeline health.
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition"
        >
          {showAddForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {showAddForm ? 'Cancel' : 'Register scraper'}
        </button>
      </div>

      {error && (
        <div className="saas-card p-4 border-amber-500/20 bg-amber-500/5 text-[13px] text-amber-400/90 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {showAddForm && (
        <form onSubmit={handleSubmit} className="saas-card p-6 space-y-6">
          <h2 className="text-[15px] font-semibold text-white">New collector</h2>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Name</label>
              <input
                required value={name} onChange={(e) => setName(e.target.value)}
                placeholder="E-commerce catalog"
                className="mt-1.5 w-full bg-[#0a0a0c] border border-white/[0.08] rounded-lg px-3 py-2 text-[13px] text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Collector ID</label>
              <input
                value={collectorId} onChange={(e) => setCollectorId(e.target.value)}
                placeholder="c_xxxxx (auto-generated if empty)"
                className="mt-1.5 w-full bg-[#0a0a0c] border border-white/[0.08] rounded-lg px-3 py-2 text-[13px] text-zinc-200 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Target URL</label>
              <input
                required value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)}
                className="mt-1.5 w-full bg-[#0a0a0c] border border-white/[0.08] rounded-lg px-3 py-2 text-[13px] text-zinc-200 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Description</label>
              <textarea
                value={description} onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="mt-1.5 w-full bg-[#0a0a0c] border border-white/[0.08] rounded-lg px-3 py-2 text-[13px] text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 resize-none"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Cron schedule</label>
              <input
                value={schedule} onChange={(e) => setSchedule(e.target.value)}
                className="mt-1.5 w-full bg-[#0a0a0c] border border-white/[0.08] rounded-lg px-3 py-2 text-[13px] text-zinc-200 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-[13px] text-zinc-400 cursor-pointer">
                <input type="checkbox" checked={autoHeal} onChange={(e) => setAutoHeal(e.target.checked)} className="rounded" />
                Enable self-healing
              </label>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Extraction schema</label>
              <button type="button" onClick={() => setSchemaFields([...schemaFields, { name: '', type: 'string' }])} className="text-[12px] text-emerald-400 hover:text-emerald-300">
                + Add field
              </button>
            </div>
            <div className="space-y-2">
              {schemaFields.map((field, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    required placeholder="field_name" value={field.name}
                    onChange={(e) => { const u = [...schemaFields]; u[i].name = e.target.value; setSchemaFields(u); }}
                    className="flex-1 bg-[#0a0a0c] border border-white/[0.08] rounded-lg px-3 py-2 text-[12px] text-zinc-200 font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
                  />
                  <select
                    value={field.type}
                    onChange={(e) => { const u = [...schemaFields]; u[i].type = e.target.value; setSchemaFields(u); }}
                    className="bg-[#0a0a0c] border border-white/[0.08] rounded-lg px-3 py-2 text-[12px] text-zinc-400 focus:outline-none"
                  >
                    <option value="string">string</option>
                    <option value="number">number</option>
                    <option value="boolean">boolean</option>
                    <option value="url">url</option>
                  </select>
                  <button type="button" onClick={() => setSchemaFields(schemaFields.filter((_, j) => j !== i))} className="p-2 text-zinc-600 hover:text-red-400">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.06]">
            <button type="button" onClick={() => setShowAddForm(false)} className="px-4 py-2 text-[13px] text-zinc-500 hover:text-zinc-300">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 rounded-lg text-[13px] font-medium bg-emerald-600 hover:bg-emerald-500 text-white">
              Save collector
            </button>
          </div>
        </form>
      )}

      {loading && scrapers.length === 0 ? (
        <div className="flex justify-center py-16">
          <RefreshCw className="h-6 w-6 text-emerald-500 animate-spin" />
        </div>
      ) : scrapers.length === 0 ? (
        <div className="saas-card p-12 text-center">
          <Database className="h-8 w-8 text-zinc-700 mx-auto mb-3" />
          <p className="text-[14px] font-medium text-zinc-400">No scrapers yet</p>
          <p className="text-[12px] text-zinc-600 mt-1">Register your first collector to start monitoring.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {scrapers.map((scraper) => {
            const lastRun = scraper.last_run
              ? new Date(scraper.last_run).toLocaleString()
              : 'Never';

            return (
              <Link
                key={scraper.id}
                href={`/scrapers/${scraper.id}`}
                className="saas-card saas-card-hover p-4 flex items-center gap-4 group"
              >
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
                  scraper.status === 'HEALTHY' ? 'bg-emerald-500/10' :
                  scraper.status === 'HEALING' ? 'bg-violet-500/10' : 'bg-red-500/10'
                }`}>
                  {scraper.status === 'HEALTHY' ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> :
                   scraper.status === 'HEALING' ? <Wrench className="h-4 w-4 text-violet-400" /> :
                   <AlertCircle className="h-4 w-4 text-red-400" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[14px] font-medium text-white group-hover:text-emerald-400/90 transition">
                      {scraper.name}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded border font-medium uppercase ${STATUS[scraper.status] || 'bg-zinc-800 text-zinc-400'}`}>
                      {scraper.status}
                    </span>
                  </div>
                  <p className="text-[12px] text-zinc-600 mt-0.5 truncate">{scraper.description || 'No description'}</p>
                  <div className="flex gap-4 mt-1.5 text-[11px] text-zinc-600">
                    <span className="flex items-center gap-1"><Globe className="h-3 w-3" />{scraper.target_url}</span>
                    <span className="flex items-center gap-1"><Server className="h-3 w-3" />{scraper.collector_id}</span>
                  </div>
                </div>

                <div className="text-right shrink-0 hidden sm:block">
                  <div className="text-[11px] text-zinc-600">Success rate</div>
                  <div className="text-[14px] font-semibold text-white">{scraper.success_rate}%</div>
                  <div className="text-[10px] text-zinc-700 mt-0.5">{lastRun}</div>
                </div>

                <ChevronRight className="h-4 w-4 text-zinc-700 group-hover:text-zinc-400 shrink-0" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
