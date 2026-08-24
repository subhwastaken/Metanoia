'use client';

import React, { useState, useEffect } from 'react';
import { RotateCcw, Circle } from 'lucide-react';

const API_BASE = '';

export default function Header() {
  const [siteState, setSiteState] = useState<string>('NORMAL');
  const [loading, setLoading] = useState<boolean>(false);

  const fetchState = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/demo/state`);
      if (res.ok) {
        const data = await res.json();
        setSiteState(data.status);
      }
    } catch (e) {
      console.error('Failed to fetch demo state:', e);
    }
  };

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleStateChange = async (newState: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/demo/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newState }),
      });
      if (res.ok) {
        const data = await res.json();
        setSiteState(data.status);
      }
    } catch (e) {
      console.error('Failed to update state:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/demo/reset`, { method: 'POST' });
      if (res.ok) setSiteState('NORMAL');
    } catch (e) {
      console.error('Failed to reset demo state:', e);
    } finally {
      setLoading(false);
    }
  };

  const isHealthy = siteState === 'NORMAL';

  return (
    <header className="h-14 border-b border-white/[0.06] bg-[#09090b]/80 backdrop-blur-xl px-5 flex items-center justify-between">
      <div className="flex items-center gap-3 text-[13px] text-zinc-500">
        <Circle className={`h-2 w-2 fill-current ${isHealthy ? 'text-emerald-400' : 'text-amber-400'}`} />
        <span>Demo environment</span>
        <span className="text-zinc-700">·</span>
        <span className={isHealthy ? 'text-emerald-400/80' : 'text-amber-400/80'}>
          {isHealthy ? 'All systems operational' : 'Failure injected'}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <select
          value={siteState}
          disabled={loading}
          onChange={(e) => handleStateChange(e.target.value)}
          className="bg-zinc-900 border border-white/[0.08] text-zinc-300 text-[12px] rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
        >
          <option value="NORMAL">Healthy DOM</option>
          <option value="CLASS_RENAMED">CSS class renamed</option>
          <option value="ELEMENT_MOVED">Element moved</option>
          <option value="DATA_DROPS">Data fields dropped</option>
          <option value="EMPTY_EXTRACTION">Empty extraction</option>
          <option value="TYPE_MISMATCH">Type mismatch</option>
          <option value="COUNT_COLLAPSE">Count collapse</option>
        </select>

        <button
          onClick={handleReset}
          disabled={loading}
          title="Reset demo"
          className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] rounded-lg transition"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
