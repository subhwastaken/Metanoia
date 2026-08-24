'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Database, Bot, ExternalLink, Shield } from 'lucide-react';

export default function Sidebar() {
  const pathname = usePathname();

  const navItems = [
    { name: 'Overview', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Scrapers', href: '/scrapers', icon: Database },
    { name: 'AI Agent', href: '/agent', icon: Bot },
  ];

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };

  return (
    <aside className="w-60 border-r border-white/[0.06] bg-[#0a0a0c] flex flex-col">
      <div className="p-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5 px-2 py-1">
          <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Shield className="h-4 w-4 text-emerald-400" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white leading-none">Metanoia</div>
            <div className="text-[10px] text-zinc-500 mt-0.5">Reliability Console</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-0.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition ${
                active
                  ? 'bg-white/[0.06] text-white'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]'
              }`}
            >
              <Icon className={`h-4 w-4 ${active ? 'text-emerald-400' : ''}`} />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-white/[0.06]">
        <a
          href="/demo-site"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03] transition"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Demo target site
        </a>
      </div>
    </aside>
  );
}
