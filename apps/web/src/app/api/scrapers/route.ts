import { NextResponse } from 'next/server';
import { db } from '../../../db';
import { scrapers, selectorVersions } from '../../../db/schema';
import { desc, eq } from 'drizzle-orm';
import { BrightDataService } from '../../../services/brightdata';
import { serializeScraper } from '../../../lib/serializers';
import { ensureSchema } from '../../../lib/schema-init';

export async function GET() {
  try {
    await ensureSchema();
    const list = await db.select().from(scrapers).orderBy(desc(scrapers.createdAt));
    return NextResponse.json(list.map(serializeScraper));
  } catch (e: any) {
    console.error('Scrapers list error:', e.message);
    return NextResponse.json([]);
  }
}

export async function POST(req: Request) {
  try {
    await ensureSchema();
    const body = await req.json();
    const { name, description, target_url, schema_definition, schedule } = body;

    if (!name || !target_url || !schema_definition) {
      return NextResponse.json({ error: 'Missing required fields (name, target_url, schema_definition)' }, { status: 400 });
    }

    const scraperId = crypto.randomUUID();
    const newScraper = {
      id: scraperId,
      name,
      description: description || '',
      targetUrl: target_url,
      collectorId: `c_${scraperId.slice(0, 8)}`,
      schedule: schedule || '0 0 * * *',
      status: 'HEALTHY',
      schemaDefinition: schema_definition,
      successRate: 100.0,
      currentVersion: 1,
    };

    await db.insert(scrapers).values(newScraper);

    BrightDataService.resetSelectors(scraperId);
    const defaultSelectors = BrightDataService.getSelectors(scraperId);

    await db.insert(selectorVersions).values({
      id: crypto.randomUUID(),
      scraperId: scraperId,
      version: 1,
      selectors: defaultSelectors,
      successCount: 0,
      createdAt: new Date(),
    });

    const created = await db.select().from(scrapers).where(eq(scrapers.id, scraperId)).limit(1);
    return NextResponse.json(serializeScraper(created[0]));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
