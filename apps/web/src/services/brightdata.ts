import crypto from 'crypto';
import { db } from '../db';
import { scrapers } from '../db/schema';
import { eq } from 'drizzle-orm';

// Persist the simulator's selector state across hot reloads in development
const globalForSelectors = global as unknown as {
  simulatedSelectors: Record<string, Record<string, string>>;
};

export const SIMULATED_SELECTORS = globalForSelectors.simulatedSelectors || {};

if (process.env.NODE_ENV !== 'production') {
  globalForSelectors.simulatedSelectors = SIMULATED_SELECTORS;
}

export class BrightDataService {
  static getBaseUrl(): string {
    if (process.env.NEXT_PUBLIC_APP_URL) {
      return process.env.NEXT_PUBLIC_APP_URL;
    }
    return 'http://localhost:3000';
  }

  static isMockMode(): boolean {
    const apiKey = process.env.BRIGHTDATA_API_KEY;
    const mockEnv = process.env.MOCK_BRIGHTDATA;
    return !apiKey || mockEnv === 'true';
  }

  static async computePageHash(url: string): Promise<string | null> {
    try {
      let fetchUrl = url;
      if (this.isMockMode()) {
        fetchUrl = `${this.getBaseUrl()}/api/demo/catalog-raw`;
      }
      
      const res = await fetch(fetchUrl, { next: { revalidate: 0 } });
      if (res.status === 200) {
        const text = await res.text();
        return crypto.createHash('sha256').update(text).digest('hex');
      }
    } catch (e) {
      console.error('Error computing page hash:', e);
    }
    return null;
  }

  static async updateScraperCache(scraperId: string, records: any[], htmlHash: string) {
    if (!htmlHash) return;
    try {
      await db.update(scrapers)
        .set({
          lastHtmlHash: htmlHash,
          cachedRecords: records,
          updatedAt: new Date(),
        })
        .where(eq(scrapers.id, scraperId));
    } catch (e) {
      console.error('Error updating scraper cache:', e);
    }
  }

  static async runCollector(
    collectorId: string,
    targetUrl: string,
    schema: Record<string, string>,
    scraperId?: string,
    bypassCache: boolean = false
  ): Promise<{
    status: string;
    records: any[];
    error: string | null;
    cached?: boolean;
    hash?: string | null;
  }> {
    let currentHash: string | null = null;

    // 1. Pre-flight Cache Check
    if (scraperId && !bypassCache) {
      const foundList = await db.select().from(scrapers).where(eq(scrapers.id, scraperId)).limit(1);
      const scraper = foundList[0];
      if (scraper && scraper.lastHtmlHash && scraper.cachedRecords) {
        currentHash = await this.computePageHash(targetUrl);
        if (currentHash && currentHash === scraper.lastHtmlHash) {
          console.log(`Pre-flight Cache HIT for scraper ${scraperId}. Serving cached records (0 compute cost).`);
          return {
            status: 'SUCCESS',
            records: scraper.cachedRecords as any[],
            error: null,
            cached: true,
            hash: currentHash,
          };
        }
      }
    }

    // 2. Cache Miss: Execute run
    let res: { status: string; records: any[]; error: string | null };
    if (this.isMockMode()) {
      res = await this._runSimulatedCollector(collectorId, targetUrl, schema, scraperId);
    } else {
      res = await this._runRealCollector(collectorId, targetUrl);
    }

    // 3. Compute and attach hash details
    if (!currentHash) {
      currentHash = await this.computePageHash(targetUrl);
    }

    return {
      ...res,
      hash: currentHash,
      cached: false,
    };
  }

  private static async _runRealCollector(collectorId: string, targetUrl: string): Promise<{
    status: string;
    records: any[];
    error: string | null;
  }> {
    console.log(`Triggering real Bright Data collector ${collectorId} for URL ${targetUrl}`);
    const apiKey = process.env.BRIGHTDATA_API_KEY;
    
    if (apiKey) {
      try {
        const url = 'https://api.brightdata.com/dca/trigger_immediate';
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            collector: collectorId,
            input: [{ url: targetUrl }],
          }),
        });

        if (response.status === 200) {
          let records = await response.json();
          if (records && typeof records === 'object' && 'output' in records) {
            records = records.output;
          }
          const recordsList = Array.isArray(records) ? records : [records];
          return {
            status: 'SUCCESS',
            records: recordsList,
            error: null,
          };
        } else {
          const text = await response.text();
          return {
            status: 'FAILED',
            records: [],
            error: `Bright Data API Error (Status ${response.status}): ${text}`,
          };
        }
      } catch (e: any) {
        console.error('Failed to run via API, falling back to CLI:', e);
      }
    }

    // Fallback/Alternative via CLI
    try {
      const { execSync } = require('child_process');
      const cmd = `npx -p @brightdata/cli brightdata scraper run ${collectorId} -u "${targetUrl}" --format json`;
      const stdout = execSync(cmd, { timeout: 90000 }).toString();
      const records = JSON.parse(stdout);
      const recordsList = Array.isArray(records) ? records : [records];
      
      return {
        status: 'SUCCESS',
        records: recordsList,
        error: null,
      };
    } catch (e: any) {
      return {
        status: 'FAILED',
        records: [],
        error: `CLI/System error calling collector: ${e.message}`,
      };
    }
  }

  private static async _runSimulatedCollector(
    collectorId: string,
    targetUrl: string,
    schema: Record<string, string>,
    scraperId?: string
  ): Promise<{
    status: string;
    records: any[];
    error: string | null;
  }> {
    const key = scraperId || collectorId || 'default';

    if (!SIMULATED_SELECTORS[key]) {
      SIMULATED_SELECTORS[key] = {
        product_name: '.product-title',
        price: '.product-price',
        currency: '.product-currency',
        availability: '.product-stock',
        product_url: '.product-link',
      };
    }

    const selectors = SIMULATED_SELECTORS[key];
    console.log(`Running simulated scraper run for ${key} with selectors:`, selectors);

    try {
      if (
        targetUrl.includes('localhost') ||
        targetUrl.includes('127.0.0.1') ||
        targetUrl.includes('/demo-site') ||
        targetUrl.includes('/api/demo')
      ) {
        const fetchUrl = `${this.getBaseUrl()}/api/demo/catalog-raw`;
        const res = await fetch(fetchUrl, { next: { revalidate: 0 } });
        if (res.status === 200) {
          const data = await res.json();
          const rawItems = data.items || [];
          const currentDomClasses = data.dom_classes || {};

          const parsedRecords = rawItems.map((item: any) => {
            const record: Record<string, any> = {};
            for (const field of Object.keys(schema)) {
              const selector = selectors[field] || '';
              const expectedClass = `.${currentDomClasses[field] || 'invalid-class'}`;
              
              if (selector === expectedClass) {
                const val = item[field];
                if (schema[field] === 'number' && typeof val === 'string') {
                  const cleanVal = val.replace('$', '').replace(/,/g, '').trim();
                  record[field] = parseFloat(cleanVal);
                } else {
                  record[field] = val;
                }
              } else {
                record[field] = null;
              }
            }
            return record;
          });

          return {
            status: 'SUCCESS',
            records: parsedRecords,
            error: null,
          };
        }
      }

      // Static fallback if not hitting local demo
      const staticRecords = [
        { product_name: 'Premium Keyboard', price: 129.99, currency: 'USD', availability: 'In Stock', product_url: 'https://example.com/item/1' },
        { product_name: 'Wireless Mouse', price: 49.99, currency: 'USD', availability: 'In Stock', product_url: 'https://example.com/item/2' },
        { product_name: 'USB-C Hub', price: 35.00, currency: 'USD', availability: 'Low Stock', product_url: 'https://example.com/item/3' },
      ];

      const filtered = staticRecords.map((item: any) => {
        const record: Record<string, any> = {};
        for (const field of Object.keys(schema)) {
          if (selectors[field] && !selectors[field].startsWith('.broken')) {
            record[field] = item[field];
          } else {
            record[field] = null;
          }
        }
        return record;
      });

      return {
        status: 'SUCCESS',
        records: filtered,
        error: null,
      };
    } catch (e: any) {
      console.error('Failed simulated collection:', e);
      return {
        status: 'FAILED',
        records: [],
        error: `Simulated collection error: ${e.message}`,
      };
    }
  }

  static async healCollector(
    collectorId: string,
    failureDescription: string,
    scraperId?: string
  ): Promise<{
    status: string;
    error: string | null;
    logs: string;
  }> {
    if (this.isMockMode()) {
      return this._healSimulatedCollector(collectorId, failureDescription, scraperId);
    }
    return this._healRealCollector(collectorId, failureDescription);
  }

  private static async _healRealCollector(collectorId: string, failureDescription: string): Promise<{
    status: string;
    error: string | null;
    logs: string;
  }> {
    try {
      const { execSync } = require('child_process');
      const cmd = `npx -p @brightdata/cli brightdata scraper heal ${collectorId} --message "${failureDescription.replace(/"/g, '\\"')}"`;
      const logs = execSync(cmd, { timeout: 60000 }).toString();

      try {
        const approveCmd = `npx -p @brightdata/cli brightdata scraper approve ${collectorId}`;
        execSync(approveCmd, { timeout: 30000 });
      } catch (approveErr) {
        console.error('Approve failed:', approveErr);
      }

      return {
        status: 'SUCCESS',
        error: null,
        logs,
      };
    } catch (e: any) {
      return {
        status: 'FAILED',
        error: e.message,
        logs: '',
      };
    }
  }

  private static async _healSimulatedCollector(
    collectorId: string,
    failureDescription: string,
    scraperId?: string
  ): Promise<{
    status: string;
    error: string | null;
    logs: string;
  }> {
    const key = scraperId || collectorId || 'default';
    console.log(`Running simulated AI healing for ${key}. Diagnostics:`, failureDescription);

    try {
      const fetchUrl = `${this.getBaseUrl()}/api/demo/catalog-raw`;
      const res = await fetch(fetchUrl, { next: { revalidate: 0 } });
      if (res.status !== 200) {
        throw new Error(`Demo website status: ${res.status}`);
      }

      const data = await res.json();
      const currentDomClasses = data.dom_classes || {};
      const currentState = data.status || 'NORMAL';

      let healedLog = '';

      if (['DATA_DROPS', 'COUNT_COLLAPSE', 'TYPE_MISMATCH', 'EMPTY_EXTRACTION', 'QUALITY_DEGRADE'].includes(currentState)) {
        // Restore catalog structure on demo website via API call
        await fetch(`${this.getBaseUrl()}/api/demo/state`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'NORMAL' }),
        });

        SIMULATED_SELECTORS[key] = {
          product_name: '.product-title',
          price: '.product-price',
          currency: '.product-currency',
          availability: '.product-stock',
          product_url: '.product-link',
        };
        healedLog = 'AI Healing Agent resolved data structure collapse. Restored data extraction thresholds to baseline values.';
      } else {
        SIMULATED_SELECTORS[key] = {};
        for (const [field, clsName] of Object.entries(currentDomClasses)) {
          SIMULATED_SELECTORS[key][field] = `.${clsName}`;
        }
        healedLog = 'AI Healing Agent analysed HTML structure.\nSUCCESS: Outdated selectors updated.\n' +
          Object.entries(currentDomClasses).map(([field, clsName]) => `- ${field}: changed to '.${clsName}'`).join('\n');
      }

      return {
        status: 'SUCCESS',
        error: null,
        logs: healedLog,
      };
    } catch (e: any) {
      return {
        status: 'FAILED',
        error: `Simulated healing error: ${e.message}`,
        logs: '',
      };
    }
  }

  static resetSelectors(scraperId?: string, collectorId?: string) {
    const key = scraperId || collectorId || 'default';
    SIMULATED_SELECTORS[key] = {
      product_name: '.product-title',
      price: '.product-price',
      currency: '.product-currency',
      availability: '.product-stock',
      product_url: '.product-link',
    };
  }

  static getSelectors(scraperId?: string, collectorId?: string): Record<string, string> {
    const key = scraperId || collectorId || 'default';
    if (!SIMULATED_SELECTORS[key]) {
      this.resetSelectors(scraperId, collectorId);
    }
    return SIMULATED_SELECTORS[key];
  }

  static setSelectors(selectors: Record<string, string>, scraperId?: string, collectorId?: string) {
    const key = scraperId || collectorId || 'default';
    SIMULATED_SELECTORS[key] = selectors;
  }
}
