import { NextResponse } from 'next/server';
import { db } from '../../../../../db';
import { scrapers, runs } from '../../../../../db/schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { HealerService } from '../../../../../services/healer';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const scraperList = await db.select().from(scrapers).where(eq(scrapers.id, id)).limit(1);
    const scraper = scraperList[0];
    if (!scraper) {
      return NextResponse.json({ error: 'Scraper not found' }, { status: 404 });
    }

    // Get last failed run to recover
    const failedRuns = await db.select()
      .from(runs)
      .where(and(
        eq(runs.scraperId, scraper.id),
        inArray(runs.status, ['FAILED', 'VALIDATION_FAILED'])
      ))
      .orderBy(desc(runs.startedAt))
      .limit(1);

    const lastFailedRun = failedRuns[0];
    if (!lastFailedRun) {
      return NextResponse.json({ error: 'No failed runs available to trigger healing.' }, { status: 400 });
    }

    const attempt = await HealerService.triggerHealingProcess(scraper.id, lastFailedRun.id);

    return NextResponse.json({
      message: 'Manual healing process finished',
      attempt_status: attempt.status,
      records_before: attempt.recordsBefore,
      records_after: attempt.recordsAfter,
      error: attempt.error,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
export const dynamic = 'force-dynamic';
