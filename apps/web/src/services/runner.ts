import fs from 'fs';
import path from 'path';
import { db } from '../db';
import { scrapers, runs } from '../db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { BrightDataService } from './brightdata';
import { HealerService } from './healer';
import { OutputValidator } from './validator';

export class RunnerService {
  static async runScraperExecution(scraperId: string, autoHeal: boolean = true): Promise<any> {
    try {
      const scraperList = await db.select().from(scrapers).where(eq(scrapers.id, scraperId)).limit(1);
      const scraper = scraperList[0];
      if (!scraper) return;

      // 1. Create Run entry
      const runId = crypto.randomUUID();
      const startedAt = new Date();

      await db.insert(runs).values({
        id: runId,
        scraperId: scraper.id,
        collectorId: scraper.collectorId,
        startedAt,
        status: 'RUNNING',
      });

      // Update scraper last run
      await db.update(scrapers).set({ lastRun: startedAt }).where(eq(scrapers.id, scraper.id));

      // 2. Get baseline average
      const successRuns = await db.select()
        .from(runs)
        .where(and(eq(runs.scraperId, scraperId), eq(runs.status, 'SUCCESS')))
        .orderBy(desc(runs.completedAt))
        .limit(5);

      let histAvg: number | null = null;
      if (successRuns.length > 0) {
        histAvg = successRuns.reduce((sum, r) => sum + r.recordsCount, 0) / successRuns.length;
      }

      // 3. Call Bright Data
      const res = await BrightDataService.runCollector(
        scraper.collectorId || 'c_mock',
        scraper.targetUrl,
        scraper.schemaDefinition as Record<string, string>,
        scraper.id,
        false
      );

      const completedAt = new Date();
      const duration = (completedAt.getTime() - startedAt.getTime()) / 1000;

      // Handle cached response
      if (res.cached) {
        const resultFilename = `run_${runId}.json`;
        this.saveRawResult(resultFilename, res.records);

        await db.update(runs).set({
          status: 'SUCCESS',
          cached: true,
          completedAt,
          duration,
          recordsCount: res.records.length,
          rawResultReference: resultFilename,
          validationStatus: { success: true, cached: true },
        }).where(eq(runs.id, runId));

        await db.update(scrapers).set({
          status: 'HEALTHY',
          lastSuccess: completedAt,
        }).where(eq(scrapers.id, scraper.id));

        await HealerService.updateScraperSuccessRate(scraperId);
        return;
      }

      if (res.status !== 'SUCCESS') {
        const errMsg = res.error || 'Unknown collector execution error.';
        await db.update(runs).set({
          status: 'FAILED',
          error: errMsg,
          completedAt,
          duration,
        }).where(eq(runs.id, runId));

        await db.update(scrapers).set({ status: 'FAILING' }).where(eq(scrapers.id, scraper.id));
        await HealerService.updateScraperSuccessRate(scraperId);

        if (autoHeal) {
          HealerService.triggerHealingProcess(scraperId, runId).catch(console.error);
        }
        return;
      }

      const records = res.records;
      const resultFilename = `run_${runId}.json`;
      this.saveRawResult(resultFilename, records);

      // 4. Validate
      const valRes = OutputValidator.validateRecords(
        records,
        scraper.schemaDefinition as Record<string, string>,
        1,
        histAvg ? Math.floor(histAvg) : null
      );

      await db.update(runs).set({
        completedAt,
        duration,
        recordsCount: records.length,
        rawResultReference: resultFilename,
        validationStatus: valRes,
      }).where(eq(runs.id, runId));

      if (valRes.success) {
        await db.update(runs).set({ status: 'SUCCESS' }).where(eq(runs.id, runId));
        await db.update(scrapers).set({ status: 'HEALTHY', lastSuccess: new Date() }).where(eq(scrapers.id, scraper.id));
        
        await BrightDataService.updateScraperCache(scraper.id, records, res.hash || '');
      } else {
        await db.update(runs).set({
          status: 'VALIDATION_FAILED',
          error: 'Validation checks failed against contract.',
        }).where(eq(runs.id, runId));
        await db.update(scrapers).set({ status: 'FAILING' }).where(eq(scrapers.id, scraper.id));
      }

      await HealerService.updateScraperSuccessRate(scraperId);

      // 5. Auto-Heal Trigger if validation failed
      if (!valRes.success && autoHeal) {
        HealerService.triggerHealingProcess(scraperId, runId).catch(console.error);
      }
    } catch (e) {
      console.error(`Error in scraper run:`, e);
    }
  }

  private static saveRawResult(filename: string, data: any[]) {
    try {
      const dir = path.join(process.cwd(), 'storage', 'runs');
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(path.join(dir, filename), JSON.stringify(data, null, 2));
    } catch (e) {
      console.error('Error saving raw run results:', e);
    }
  }
}
