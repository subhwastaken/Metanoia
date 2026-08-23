import { NextResponse } from 'next/server';
import { db } from '../../../../../db';
import { scrapers } from '../../../../../db/schema';
import { eq } from 'drizzle-orm';
import { RunnerService } from '../../../../../services/runner';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const list = await db.select().from(scrapers).where(eq(scrapers.id, id)).limit(1);
    const scraper = list[0];
    if (!scraper) {
      return NextResponse.json({ error: 'Scraper not found' }, { status: 404 });
    }

    // Trigger run execution asynchronously (un-awaited background promise)
    RunnerService.runScraperExecution(id, true).catch(console.error);

    return NextResponse.json({
      message: 'Scraper run triggered in background',
      status: scraper.status,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
export const dynamic = 'force-dynamic';
