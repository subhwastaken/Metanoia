import { NextResponse } from 'next/server';
import { db } from '../../../../../db';
import { scrapers, runs, selectorVersions } from '../../../../../db/schema';
import { eq } from 'drizzle-orm';
import { BrightDataService } from '../../../../../services/brightdata';
import { OutputValidator } from '../../../../../services/validator';
import { HealerService } from '../../../../../services/healer';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const scraperList = await db.select().from(scrapers).where(eq(scrapers.id, id)).limit(1);
    const scraper = scraperList[0];
    if (!scraper) {
      return NextResponse.json({ error: 'Scraper not found' }, { status: 404 });
    }

    const { selectors } = await req.json();
    if (!selectors) {
      return NextResponse.json({ error: 'Missing selectors payload' }, { status: 400 });
    }

    // Apply selectors to simulator memory
    BrightDataService.setSelectors(selectors, scraper.id);

    // Run collector to verify
    const res = await BrightDataService.runCollector(
      scraper.collectorId || 'c_mock',
      scraper.targetUrl,
      scraper.schemaDefinition as Record<string, string>,
      scraper.id,
      true // bypass cache
    );

    if (res.status !== 'SUCCESS') {
      return NextResponse.json({ error: `Scraper failed to run with these selectors: ${res.error}` }, { status: 400 });
    }

    // Validate output
    const valRes = OutputValidator.validateRecords(
      res.records,
      scraper.schemaDefinition as Record<string, string>
    );

    if (!valRes.success) {
      return NextResponse.json({
        status: 'VALIDATION_FAILED',
        validation: valRes,
        error: 'The test run did not pass validation contract checks.',
      });
    }

    // Validation succeeded! Update database states
    const nextVersion = scraper.currentVersion + 1;
    const now = new Date();

    await db.update(scrapers).set({
      status: 'HEALTHY',
      currentVersion: nextVersion,
      lastSuccess: now,
      updatedAt: now,
    }).where(eq(scrapers.id, scraper.id));

    // Save version history record
    await db.insert(selectorVersions).values({
      id: crypto.randomUUID(),
      scraperId: scraper.id,
      version: nextVersion,
      selectors: selectors,
      successCount: 1,
      createdAt: now,
    });

    // Update cache
    await BrightDataService.updateScraperCache(scraper.id, res.records, res.hash || '');

    // Log manual recovery run
    const runId = crypto.randomUUID();
    await db.insert(runs).values({
      id: runId,
      scraperId: scraper.id,
      collectorId: scraper.collectorId,
      status: 'SUCCESS',
      recordsCount: res.records.length,
      rawResultReference: `run_override_${crypto.randomUUID().slice(0, 8)}.json`,
      validationStatus: valRes,
      recoverySource: 'MANUAL_OVERRIDE',
      startedAt: now,
      completedAt: now,
      duration: 0.1,
    });

    // Update success rate
    await HealerService.updateScraperSuccessRate(scraper.id);

    return NextResponse.json({
      status: 'HEALTHY',
      message: 'Manual override successful! Selectors updated and validated.',
      version: nextVersion,
      records: res.records,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
export const dynamic = 'force-dynamic';
