'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Shield, Wrench, Play, RefreshCw, ArrowRight,
  Zap, Terminal, Bot, Cpu, ExternalLink, MousePointerClick,
} from 'lucide-react';

export default function SaasLandingPage() {
  const [simStatus, setSimStatus] = useState<'idle' | 'running' | 'failed' | 'healing' | 'healed'>('idle');
  const [simLogs, setSimLogs] = useState<string[]>([]);
  const [selectedFailure, setSelectedFailure] = useState('CLASS_RENAMED');
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [simLogs]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add('reveal-visible')),
      { threshold: 0.1 }
    );
    document.querySelectorAll('.reveal-hidden').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const addLog = (msg: string, delay: number) =>
    new Promise<void>((resolve) => {
      setTimeout(() => {
        setSimLogs((prev) => [...prev, msg]);
        resolve();
      }, delay);
    });

  const handleRunSimulator = async () => {
    setSimStatus('running');
    setSimLogs([]);
    await addLog('→ Running collector on /demo-site…', 300);
    await addLog('→ Extracting product_name, price, availability…', 500);

    if (selectedFailure === 'NORMAL') {
      await addLog('✓ Validation passed — 12/12 records', 400);
      setSimStatus('healed');
      return;
    }

    await addLog('✗ Schema drift: price field returned null', 500);
    setSimStatus('failed');
    await addLog('→ Healer: calling Bright Data Scraper Studio…', 800);
    setSimStatus('healing');
    await addLog('→ Selector repaired: .item-price → .price-tag-new', 900);
    await addLog('→ Re-running collector with healed selectors…', 600);
    await addLog('✓ Healed run validated — 12/12 records restored', 500);
    setSimStatus('healed');
  };

  const features = [
    {
      icon: Cpu,
      title: 'Failure detection',
      desc: 'Catches DOM changes, missing fields, type mismatches, and record count drops before bad data hits your pipeline.',
      tags: ['Schema contracts', 'Real-time'],
    },
    {
      icon: Wrench,
      title: 'Self-healing engine',
      desc: 'Triggers Bright Data Scraper Studio repair, updates selectors, re-runs, and validates output automatically.',
      tags: ['Studio API', 'Auto-retry'],
    },
    {
      icon: Bot,
      title: 'AI job intelligence',
      desc: 'Plain-English job search with live Google Jobs SERP data — company career pages first, not just search snippets.',
      tags: ['SERP API', 'Gemini'],
    },
  ];

  const agentSteps = [
    { step: '01', title: 'Parse intent', desc: 'Gemini understands your natural-language query — role, location, company type.' },
    { step: '02', title: 'Live SERP scrape', desc: 'Bright Data searches Google Jobs and company ATS platforms in real time.' },
    { step: '03', title: 'Structured results', desc: 'Active listings with apply links, split by company career pages and job boards.' },
  ];

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 antialiased">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#09090b]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Shield className="h-4 w-4 text-emerald-400" />
            </div>
            <span className="font-semibold text-[15px] text-white">Metanoia</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-[13px] text-zinc-500">
            <a href="#features" className="hover:text-zinc-200 transition">Features</a>
            <a href="#simulator" className="hover:text-zinc-200 transition">Simulator</a>
            <a href="#agent" className="hover:text-zinc-200 transition">AI Agent</a>
            <Link href="/demo-site" className="hover:text-zinc-200 transition flex items-center gap-1">
              Demo site <ExternalLink className="h-3 w-3" />
            </Link>
          </nav>
          <Link
            href="/dashboard"
            className="text-[13px] font-medium bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg transition"
          >
            Open console
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative pt-20 pb-16 px-5 overflow-hidden">
        <div className="absolute inset-0 grid-bg pointer-events-none" />
        <div className="max-w-6xl mx-auto relative">
          <div className="max-w-2xl reveal-hidden">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/5 text-[12px] text-emerald-400 font-medium mb-6">
              <Zap className="h-3 w-3" />
              Self-healing scrapers for Bright Data
            </div>
            <h1 className="text-4xl md:text-[3.25rem] font-semibold tracking-tight text-white leading-[1.1]">
              Websites change.
              <br />
              <span className="text-zinc-500">Your scrapers shouldn&apos;t break.</span>
            </h1>
            <p className="mt-5 text-[16px] text-zinc-500 leading-relaxed max-w-lg">
              Monitor extraction health, detect schema drift, and auto-heal broken selectors — with a developer console and CI-ready pipelines.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/dashboard" className="inline-flex items-center gap-2 bg-white text-zinc-900 px-5 py-2.5 rounded-lg text-[14px] font-medium hover:bg-zinc-100 transition">
                Get started <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#simulator" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-[14px] font-medium text-zinc-400 border border-white/[0.08] hover:bg-white/[0.04] hover:text-white transition">
                <Play className="h-4 w-4" /> Watch it heal
              </a>
            </div>
          </div>

          {/* Product preview */}
          <div className="mt-14 saas-card p-1 reveal-hidden">
            <div className="rounded-[10px] bg-[#0c0c0e] border border-white/[0.04] overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
                <div className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
                  <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
                  <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
                </div>
                <span className="text-[11px] text-zinc-600 ml-2">metanoia — dashboard</span>
              </div>
              <div className="p-5 grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  {[
                    { name: 'E-commerce Catalog', status: 'HEALTHY', pct: 100 },
                    { name: 'Real Estate Listings', status: 'HEALED', pct: 94 },
                    { name: 'Job Board Monitor', status: 'HEALTHY', pct: 98 },
                  ].map((s) => (
                    <div key={s.name} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                      <span className="text-[13px] text-zinc-300">{s.name}</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                          s.status === 'HEALTHY' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400'
                        }`}>{s.status}</span>
                        <span className="text-[12px] text-zinc-500 font-mono">{s.pct}%</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg bg-black/40 border border-white/[0.04] p-4 font-mono text-[11px] text-zinc-500 space-y-1">
                  <div className="text-zinc-600 mb-2 flex items-center gap-1.5"><Terminal className="h-3 w-3" /> orchestrator</div>
                  <div><span className="text-amber-400/80">warn</span> price field null on 12 nodes</div>
                  <div><span className="text-blue-400/80">heal</span> studio repair triggered</div>
                  <div><span className="text-emerald-400/80">ok</span> selectors updated, 12 records validated</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-5 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <div className="mb-12 reveal-hidden">
            <p className="text-[12px] font-medium text-emerald-400/80 uppercase tracking-wider mb-2">Platform</p>
            <h2 className="text-2xl font-semibold text-white">Everything your scraping pipeline needs</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {features.map((f, i) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className={`saas-card saas-card-hover p-6 reveal-hidden`} style={{ transitionDelay: `${i * 80}ms` }}>
                  <div className="h-10 w-10 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-4">
                    <Icon className="h-5 w-5 text-emerald-400" />
                  </div>
                  <h3 className="text-[15px] font-semibold text-white mb-2">{f.title}</h3>
                  <p className="text-[13px] text-zinc-500 leading-relaxed">{f.desc}</p>
                  <div className="flex gap-2 mt-4">
                    {f.tags.map((t) => (
                      <span key={t} className="text-[10px] px-2 py-0.5 rounded bg-white/[0.04] text-zinc-600 border border-white/[0.04]">{t}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* AI Agent pipeline */}
      <section id="agent" className="py-20 px-5 border-t border-white/[0.06] bg-[#0c0c0e]/50">
        <div className="max-w-6xl mx-auto">
          <div className="mb-10 reveal-hidden">
            <p className="text-[12px] font-medium text-emerald-400/80 uppercase tracking-wider mb-2">AI Intelligence</p>
            <h2 className="text-2xl font-semibold text-white">Job search in plain English</h2>
            <p className="text-[14px] text-zinc-500 mt-2 max-w-xl">
              Describe what you want — get live listings with real apply links on company career pages.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-4 mb-8">
            {agentSteps.map((s, i) => (
              <div key={s.step} className="saas-card p-5 reveal-hidden" style={{ transitionDelay: `${i * 80}ms` }}>
                <span className="text-[11px] font-mono text-emerald-400/60">{s.step}</span>
                <h3 className="text-[15px] font-semibold text-white mt-2 mb-1">{s.title}</h3>
                <p className="text-[13px] text-zinc-500 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center reveal-hidden">
            <Link href="/agent" className="inline-flex items-center gap-2 text-[13px] text-emerald-400 hover:text-emerald-300 transition">
              Open AI Agent <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Simulator */}
      <section id="simulator" className="py-20 px-5 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-8 items-start">
            <div className="reveal-hidden">
              <p className="text-[12px] font-medium text-emerald-400/80 uppercase tracking-wider mb-2">Live demo</p>
              <h2 className="text-2xl font-semibold text-white mb-3">Break it. Watch it heal.</h2>
              <p className="text-[14px] text-zinc-500 leading-relaxed mb-6">
                Inject a DOM failure on the demo site and see Metanoia detect, repair, and re-validate — exactly what happens in production.
              </p>
              <div className="space-y-2">
                {[
                  { id: 'CLASS_RENAMED', label: 'CSS class renamed' },
                  { id: 'DATA_DROPS', label: 'Data fields dropped' },
                  { id: 'NORMAL', label: 'Normal run (no failure)' },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => { setSelectedFailure(f.id); setSimStatus('idle'); setSimLogs([]); }}
                    className={`w-full text-left text-[13px] px-4 py-3 rounded-lg border transition flex items-center justify-between ${
                      selectedFailure === f.id
                        ? 'border-emerald-500/30 bg-emerald-500/5 text-white'
                        : 'border-white/[0.06] text-zinc-500 hover:text-zinc-300 hover:border-white/[0.1]'
                    }`}
                  >
                    {f.label}
                    {selectedFailure === f.id && <MousePointerClick className="h-4 w-4 text-emerald-400" />}
                  </button>
                ))}
              </div>
              <button
                onClick={handleRunSimulator}
                disabled={simStatus === 'running' || simStatus === 'healing'}
                className="mt-4 w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-medium py-3 rounded-lg text-[14px] transition"
              >
                {(simStatus === 'running' || simStatus === 'healing') ? (
                  <><RefreshCw className="h-4 w-4 animate-spin" /> Running…</>
                ) : (
                  <><Play className="h-4 w-4" /> Run simulation</>
                )}
              </button>
            </div>

            <div className="saas-card overflow-hidden h-[340px] flex flex-col reveal-hidden">
              <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
                <span className="text-[12px] text-zinc-500 font-mono">console</span>
                <span className="text-[11px] text-zinc-600 uppercase">{simStatus}</span>
              </div>
              <div className="flex-1 p-4 font-mono text-[12px] overflow-y-auto space-y-1.5">
                {simLogs.length === 0 ? (
                  <p className="text-zinc-600 h-full flex items-center justify-center">Select a failure and run the simulation</p>
                ) : (
                  simLogs.map((log, i) => (
                    <div key={i} className={
                      log.startsWith('✓') ? 'text-emerald-400' :
                      log.startsWith('✗') ? 'text-red-400' :
                      log.startsWith('→') ? 'text-zinc-400' : 'text-zinc-500'
                    }>{log}</div>
                  ))
                )}
                <div ref={logEndRef} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-5 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto text-center reveal-hidden">
          <h2 className="text-2xl font-semibold text-white mb-3">Ready to ship reliable scrapers?</h2>
          <p className="text-[14px] text-zinc-500 mb-8">Register your first collector and see self-healing in action.</p>
          <Link href="/dashboard" className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-lg text-[14px] font-medium transition">
            Launch console <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-white/[0.06] py-8 px-5">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-[12px] text-zinc-600">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-zinc-700" />
            <span>Metanoia</span>
          </div>
          <div className="flex gap-6">
            <Link href="/dashboard" className="hover:text-zinc-400 transition">Console</Link>
            <Link href="/agent" className="hover:text-zinc-400 transition">AI Agent</Link>
            <Link href="/demo-site" className="hover:text-zinc-400 transition">Demo site</Link>
          </div>
          <span>© 2026 Metanoia</span>
        </div>
      </footer>
    </div>
  );
}
