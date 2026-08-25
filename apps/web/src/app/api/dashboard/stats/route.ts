import { NextResponse } from 'next/server';
import { db } from '../../../../db';
import { scrapers, runs, healingAttempts } from '../../../../db/schema';
import { ensureSchema } from '../../../../lib/schema-init';
import { emptyDashboardResponse } from '../../../../lib/empty-dashboard';

export async function GET() {
  try {
    await ensureSchema();
    const scraperList = await db.select().from(scrapers);
    const runList = await db.select().from(runs);
    const healList = await db.select().from(healingAttempts);

    // 1. Scraper counts
    const totalScrapers = scraperList.length;
    const healthyScrapers = scraperList.filter((s: any) => s.status === 'HEALTHY').length;
    const failingScrapers = scraperList.filter((s: any) => s.status === 'FAILING').length;
    const healingScrapers = scraperList.filter((s: any) => s.status === 'HEALING').length;
    const escalatedScrapers = scraperList.filter((s: any) => s.status === 'ESCALATED').length;

    // 2. Total runs & healing counts
    const totalRuns = runList.length;
    const totalHealed = runList.filter((r: any) => r.status === 'HEALED').length;
    const totalFailed = runList.filter((r: any) => ['FAILED', 'VALIDATION_FAILED'].includes(r.status)).length;

    // 3. Platform success rate (Average scraper success rate)
    let avgSuccessRate = 100.0;
    if (totalScrapers > 0) {
      const sum = scraperList.reduce((acc: number, s: any) => acc + (s.successRate || 0), 0);
      avgSuccessRate = parseFloat((sum / totalScrapers).toFixed(1));
    }

    // 4. Average recovery time (MTTR)
    let avgRecoveryTime = 0.0;
    const successfulHeals = healList.filter(
      (h: any) => h.status === 'SUCCESS' && h.completedAt && h.startedAt
    );

    if (successfulHeals.length > 0) {
      const durations = successfulHeals.map((h: any) => {
        const start = new Date(h.startedAt).getTime();
        const end = new Date(h.completedAt!).getTime();
        return (end - start) / 1000;
      });
      const sum = durations.reduce((acc: number, d: number) => acc + d, 0);
      avgRecoveryTime = parseFloat((sum / durations.length).toFixed(1));
    }

    // 5. Recent Activity Feed
    const sortedRuns = [...runList].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()).slice(0, 10);
    const sortedHeals = [...healList].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()).slice(0, 5);

    const activity: any[] = [];

    // Map runs
    for (const r of sortedRuns) {
      const scraper = scraperList.find((s: any) => s.id === r.scraperId);
      const name = scraper ? scraper.name : 'Unknown Scraper';

      const colors: Record<string, string> = {
        RUNNING: 'blue',
        SUCCESS: 'green',
        FAILED: 'red',
        HEALING: 'yellow',
        HEALED: 'purple',
        VALIDATION_FAILED: 'orange',
      };

      activity.push({
        id: `run_${r.id}`,
        type: 'run',
        scraper_name: name,
        scraper_id: r.scraperId,
        status: r.status,
        color: colors[r.status] || 'gray',
        timestamp: r.startedAt.toISOString(),
        details: ['SUCCESS', 'HEALED'].includes(r.status)
          ? `Extraction completed. ${r.recordsCount} records extracted.`
          : `Run status: ${r.status}.`,
      });
    }

    // Map heals
    for (const h of sortedHeals) {
      const scraper = scraperList.find((s: any) => s.id === h.scraperId);
      const name = scraper ? scraper.name : 'Unknown Scraper';

      activity.push({
        id: `heal_${h.id}`,
        type: 'healing',
        scraper_name: name,
        scraper_id: h.scraperId,
        status: h.status,
        color: ['REQUESTED', 'HEALING', 'VALIDATING'].includes(h.status)
          ? 'yellow'
          : h.status === 'SUCCESS'
          ? 'green'
          : 'red',
        timestamp: h.startedAt.toISOString(),
        details: h.status === 'SUCCESS'
          ? `AI Self-Healing triggered. Restored ${h.recordsAfter} records.`
          : `Healing attempt: ${h.status}.`,
      });
    }

    // Sort combined feed
    activity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const finalActivity = activity.slice(0, 10);

    // 6. Charting Data (last 7 days)
    const chartData = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      
      const startOfDay = new Date(d.setHours(0, 0, 0, 0));
      const endOfDay = new Date(d.setHours(23, 59, 59, 999));

      const dayRuns = runList.filter(
        (r: any) => r.startedAt >= startOfDay && r.startedAt <= endOfDay
      );

      const totalD = dayRuns.length;
      const successD = dayRuns.filter((r: any) => ['SUCCESS', 'HEALED'].includes(r.status)).length;
      const recordsD = dayRuns.reduce((sum: number, r: any) => sum + r.recordsCount, 0);
      const rateD = totalD > 0 ? parseFloat(((successD / totalD) * 100.0).toFixed(1)) : 100.0;

      chartData.push({
        date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        total_runs: totalD,
        success_rate: rateD,
        records_count: recordsD,
      });
    }

    // 7. Caching and recoveries stats
    const totalCachedRuns = runList.filter((r: any) => r.cached).length;
    const localVersionRecoveries = runList.filter((r: any) => r.recoverySource === 'LOCAL_VERSION_RECOVERY').length;
    const aiHealedRuns = runList.filter((r: any) => r.recoverySource === 'AI_HEAL').length;
    const manualOverrides = runList.filter((r: any) => r.recoverySource === 'MANUAL_OVERRIDE').length;

    return NextResponse.json({
      stats: {
        total_scrapers: totalScrapers,
        healthy_scrapers: healthyScrapers,
        failing_scrapers: failingScrapers,
        healing_scrapers: healingScrapers,
        escalated_scrapers: escalatedScrapers,
        total_runs: totalRuns,
        total_healed: totalHealed,
        total_failed: totalFailed,
        success_rate: avgSuccessRate,
        avg_recovery_time: avgRecoveryTime,
        total_cached_runs: totalCachedRuns,
        local_version_recoveries: localVersionRecoveries,
        ai_healed_runs: aiHealedRuns,
        manual_overrides: manualOverrides,
      },
      activity: finalActivity,
      chart_data: chartData,
    });
  } catch (e: any) {
    console.error('Dashboard stats error:', e.message);
    return NextResponse.json(emptyDashboardResponse());
  }
}
export const dynamic = 'force-dynamic';
