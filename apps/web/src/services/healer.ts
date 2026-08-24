import fs from 'fs';
import path from 'path';
import { db } from '../db';
import { scrapers, runs, healingAttempts, selectorVersions } from '../db/schema';
import { eq, desc, and, inArray } from 'drizzle-orm';
import { BrightDataService } from './brightdata';
import { FailureDetector } from './detector';
import { OutputValidator } from './validator';

const MAX_HEAL_ATTEMPTS = 2;

export class HealerService {
  static calculateConfidenceScore(validationResult: any | null = null, historicalAvg: number | null = null): number {
    if (!validationResult || !validationResult.success) {
      return 30; // Default failure score
    }

    let score = 70; // Base score for passing validation

    const summary = validationResult.summary || {};
    const fieldsPresence = summary.fields_presence || {};
    const fieldsTypeValid = summary.fields_type_valid || {};
    const totalRecords = summary.total_records || 0;

    // 1. Field completeness bonus (up to 10%)
    const presenceVals = Object.values(fieldsPresence) as number[];
    if (presenceVals.length > 0) {
      const avgPresence = presenceVals.reduce((a, b) => a + b, 0) / presenceVals.length;
      score += Math.floor(avgPresence * 10);
    }

    // 2. Schema validity bonus (up to 10%)
    const typeVals = Object.values(fieldsTypeValid) as number[];
    if (typeVals.length > 0) {
      const avgTypeValid = typeVals.reduce((a, b) => a + b, 0) / typeVals.length;
      score += Math.floor(avgTypeValid * 10);
    }

    // 3. Historical count recovery bonus (up to 10%)
    if (historicalAvg !== null && historicalAvg > 0) {
      const countRatio = Math.min(totalRecords, historicalAvg) / Math.max(totalRecords, historicalAvg);
      score += Math.floor(countRatio * 10);
    } else {
      if (totalRecords > 0) {
        score += 5;
      }
    }

    return Math.min(Math.max(score, 0), 100);
  }

  static async triggerHealingProcess(scraperId: string, failedRunId: string): Promise<any> {
    const scraperList = await db.select().from(scrapers).where(eq(scrapers.id, scraperId)).limit(1);
    const scraper = scraperList[0];

    const runList = await db.select().from(runs).where(eq(runs.id, failedRunId)).limit(1);
    const failedRun = runList[0];

    if (!scraper || !failedRun) {
      console.error(`Cannot heal: Scraper ${scraperId} or Run ${failedRunId} not found.`);
      throw new Error('Scraper or Run not found');
    }

    // 1. Fetch previous successful runs to establish baseline
    const successRuns = await db.select()
      .from(runs)
      .where(and(eq(runs.scraperId, scraperId), eq(runs.status, 'SUCCESS')))
      .orderBy(desc(runs.completedAt))
      .limit(5);

    let histAvg: number | null = null;
    if (successRuns.length > 0) {
      histAvg = successRuns.reduce((sum, r) => sum + r.recordsCount, 0) / successRuns.length;
    }

    // 2. Perform failure detection
    const valStatus = (failedRun.validationStatus as any) || {};
    const failureDescription = FailureDetector.generateDiagnosticSummary(
      scraper.name,
      scraper.collectorId || 'c_mock',
      scraper.schemaDefinition as Record<string, string>,
      valStatus
    );

    // 3. Record Healing Attempt
    const attemptId = crypto.randomUUID();
    await db.insert(healingAttempts).values({
      id: attemptId,
      scraperId: scraper.id,
      runId: failedRun.id,
      status: 'HEALING',
      failureDescription,
      collectorId: scraper.collectorId,
      recordsBefore: failedRun.recordsCount,
      startedAt: new Date(),
    });

    // Update state to HEALING
    await db.update(runs).set({ status: 'HEALING' }).where(eq(runs.id, failedRun.id));
    await db.update(scrapers).set({ status: 'HEALING' }).where(eq(scrapers.id, scraper.id));

    // 3.5. Try Local Selector Version Recovery
    const historicalVersions = await db.select()
      .from(selectorVersions)
      .where(eq(selectorVersions.scraperId, scraperId))
      .orderBy(desc(selectorVersions.successCount), desc(selectorVersions.version));

    let localHealed = false;
    let healedSelectors: any = null;
    let healedVersionObj: any = null;
    let testRunRes: any = null;
    let testValRes: any = null;

    const originalSelectors = { ...BrightDataService.getSelectors(scraper.id) };

    for (const hv of historicalVersions) {
      // Check if selectors match current active selectors
      const hvSelectors = hv.selectors as Record<string, string>;
      const match = Object.keys(hvSelectors).every(k => hvSelectors[k] === originalSelectors[k]) &&
                    Object.keys(originalSelectors).every(k => hvSelectors[k] === originalSelectors[k]);
      if (match) continue;

      console.log(`Attempting local selector recovery using version ${hv.version} for scraper ${scraperId}...`);
      BrightDataService.setSelectors(hvSelectors, scraper.id);

      testRunRes = await BrightDataService.runCollector(
        scraper.collectorId || 'c_mock',
        scraper.targetUrl,
        scraper.schemaDefinition as Record<string, string>,
        scraper.id,
        true // bypass cache
      );

      if (testRunRes.status === 'SUCCESS') {
        testValRes = OutputValidator.validateRecords(
          testRunRes.records,
          scraper.schemaDefinition as Record<string, string>,
          1,
          histAvg ? Math.floor(histAvg) : null
        );

        if (testValRes.success) {
          console.log(`Local selector recovery SUCCESS using version ${hv.version}!`);
          localHealed = true;
          healedSelectors = hvSelectors;
          healedVersionObj = hv;

          // Increment success count
          await db.update(selectorVersions)
            .set({ successCount: hv.successCount + 1 })
            .where(eq(selectorVersions.id, hv.id));
          break;
        }
      }
    }

    if (localHealed && testRunRes && testValRes && healedVersionObj) {
      const now = new Date();
      await db.update(healingAttempts).set({
        status: 'SUCCESS',
        completedAt: now,
        error: null,
        recordsAfter: testRunRes.records.length,
        validationResult: testValRes,
      }).where(eq(healingAttempts.id, attemptId));

      const duration = (now.getTime() - failedRun.startedAt.getTime()) / 1000;
      const resultFilename = `run_${failedRun.id}_healed.json`;
      this.saveRawResult(resultFilename, testRunRes.records);

      await db.update(runs).set({
        status: 'HEALED',
        completedAt: now,
        recordsCount: testRunRes.records.length,
        validationStatus: testValRes,
        recoverySource: 'LOCAL_VERSION_RECOVERY',
        duration,
        rawResultReference: resultFilename,
      }).where(eq(runs.id, failedRun.id));

      await db.update(scrapers).set({
        status: 'HEALTHY',
        currentVersion: healedVersionObj.version,
        lastSuccess: now,
        lastRun: now,
      }).where(eq(scrapers.id, scraper.id));

      // Cache records
      await BrightDataService.updateScraperCache(scraper.id, testRunRes.records, testRunRes.hash || '');

      // Correlate
      await this.correlateScrapersSelectorUpdate(scraper.id, healedSelectors);
      await this.updateScraperSuccessRate(scraper.id);

      const updatedAttempt = await db.select().from(healingAttempts).where(eq(healingAttempts.id, attemptId)).limit(1);
      return updatedAttempt[0];
    }

    // Restore original selectors if local version recovery failed
    BrightDataService.setSelectors(originalSelectors, scraper.id);

    // 4. Fallback to Bright Data AI Healing CLI (with retry loop)
    let lastError: string | null = null;
    let finalAttempt: any = null;

    for (let healAttempt = 1; healAttempt <= MAX_HEAL_ATTEMPTS; healAttempt++) {
      if (healAttempt > 1) {
        console.log(`Retrying AI heal (attempt ${healAttempt}/${MAX_HEAL_ATTEMPTS})...`);
      }

      const healRes = await BrightDataService.healCollector(
        scraper.collectorId || 'c_mock',
        failureDescription,
        scraper.id
      );

      if (healRes.status !== 'SUCCESS') {
        lastError = `Bright Data CLI Healing failed: ${healRes.error}`;
        continue;
      }

      await db.update(healingAttempts).set({ status: 'VALIDATING' }).where(eq(healingAttempts.id, attemptId));

      const runRes = await BrightDataService.runCollector(
        scraper.collectorId || 'c_mock',
        scraper.targetUrl,
        scraper.schemaDefinition as Record<string, string>,
        scraper.id,
        true
      );

      if (runRes.status !== 'SUCCESS') {
        lastError = `Healed collector failed to run: ${runRes.error}`;
        continue;
      }

      const newRecords = runRes.records;
      const newValRes = OutputValidator.validateRecords(
        newRecords,
        scraper.schemaDefinition as Record<string, string>,
        1,
        histAvg ? Math.floor(histAvg) : null
      );

      const now = new Date();
      if (newValRes.success) {
        await db.update(healingAttempts).set({
          status: 'SUCCESS',
          completedAt: now,
          recordsAfter: newRecords.length,
          validationResult: newValRes,
        }).where(eq(healingAttempts.id, attemptId));

        const nextVersion = scraper.currentVersion + 1;
        await db.update(scrapers).set({
          status: 'HEALTHY',
          lastSuccess: now,
          lastRun: now,
          currentVersion: nextVersion,
        }).where(eq(scrapers.id, scraper.id));

        const duration = (now.getTime() - failedRun.startedAt.getTime()) / 1000;
        const resultFilename = `run_${failedRun.id}_healed.json`;
        this.saveRawResult(resultFilename, newRecords);

        await db.update(runs).set({
          status: 'HEALED',
          recoverySource: 'AI_HEAL',
          recordsCount: newRecords.length,
          validationStatus: newValRes,
          completedAt: now,
          duration,
          rawResultReference: resultFilename,
        }).where(eq(runs.id, failedRun.id));

        const newSelectors = BrightDataService.getSelectors(scraper.id);
        await db.insert(selectorVersions).values({
          id: crypto.randomUUID(),
          scraperId: scraper.id,
          version: nextVersion,
          selectors: newSelectors,
          successCount: 1,
          createdAt: now,
        });

        await BrightDataService.updateScraperCache(scraper.id, newRecords, runRes.hash || '');
        await this.correlateScrapersSelectorUpdate(scraper.id, newSelectors);
        await this.updateScraperSuccessRate(scraper.id);

        const updatedAttempt = await db.select().from(healingAttempts).where(eq(healingAttempts.id, attemptId)).limit(1);
        return updatedAttempt[0];
      }

      lastError = 'Post-healing validation failed. Structure is still incorrect.';
      finalAttempt = { newValRes, newRecords, now };
    }

    // All heal attempts exhausted
    const now = new Date();
    const errMsg = lastError || 'All healing attempts failed.';

    await db.update(healingAttempts).set({
      status: 'FAILED',
      completedAt: now,
      error: errMsg,
      validationResult: finalAttempt?.newValRes ?? null,
    }).where(eq(healingAttempts.id, attemptId));

    const duration = (now.getTime() - failedRun.startedAt.getTime()) / 1000;
    await db.update(runs).set({
      status: 'VALIDATION_FAILED',
      error: errMsg,
      validationStatus: finalAttempt?.newValRes ?? null,
      completedAt: now,
      duration,
    }).where(eq(runs.id, failedRun.id));

    await db.update(scrapers).set({ status: 'ESCALATED' }).where(eq(scrapers.id, scraper.id));
    await this.updateScraperSuccessRate(scraper.id);

    const finalAttemptRow = await db.select().from(healingAttempts).where(eq(healingAttempts.id, attemptId)).limit(1);
    return finalAttemptRow[0];
  }

  static async correlateScrapersSelectorUpdate(healedScraperId: string, newSelectors: Record<string, string>) {
    const scraperList = await db.select().from(scrapers).where(eq(scrapers.id, healedScraperId)).limit(1);
    const healedScraper = scraperList[0];
    if (!healedScraper) return;

    try {
      const healedDomain = new URL(healedScraper.targetUrl).hostname;
      if (!healedDomain) return;

      const correlatedScrapers = await db.select()
        .from(scrapers)
        .where(and(
          inArray(scrapers.status, ['FAILING', 'ESCALATED', 'VALIDATION_FAILED']),
          // We filter matching domains dynamically below
        ));

      for (const cs of correlatedScrapers) {
        let csDomain = '';
        try {
          csDomain = new URL(cs.targetUrl).hostname;
        } catch {}

        if (csDomain === healedDomain && cs.id !== healedScraperId) {
          console.log(`Cross-scraper correlation: Pre-emptively healing scraper ${cs.id} ('${cs.name}') using selectors from ${healedScraperId}`);

          // Update selector mapping in memory
          BrightDataService.setSelectors(newSelectors, cs.id);

          const nextVersion = cs.currentVersion + 1;
          await db.update(scrapers).set({
            currentVersion: nextVersion,
            status: 'HEALTHY',
            updatedAt: new Date(),
          }).where(eq(scrapers.id, cs.id));

          // Save new version
          await db.insert(selectorVersions).values({
            id: crypto.randomUUID(),
            scraperId: cs.id,
            version: nextVersion,
            selectors: newSelectors,
            successCount: 1,
          });
        }
      }
    } catch (e) {
      console.error('Error in cross-scraper correlation:', e);
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

  static async updateScraperSuccessRate(scraperId: string) {
    try {
      const runList = await db.select().from(runs).where(eq(runs.scraperId, scraperId));
      const totalRuns = runList.length;

      if (totalRuns === 0) {
        await db.update(scrapers).set({ successRate: 100.0 }).where(eq(scrapers.id, scraperId));
        return;
      }

      const successfulRuns = runList.filter(r => ['SUCCESS', 'HEALED'].includes(r.status)).length;
      const successRate = parseFloat(((successfulRuns / totalRuns) * 100.0).toFixed(1));

      await db.update(scrapers).set({ successRate }).where(eq(scrapers.id, scraperId));
    } catch (e) {
      console.error('Error updating scraper success rate:', e);
    }
  }
}
