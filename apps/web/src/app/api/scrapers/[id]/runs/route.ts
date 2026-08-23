import { NextResponse } from 'next/server';
import { db } from '../../../../../db';
import { runs } from '../../../../../db/schema';
import { eq, desc } from 'drizzle-orm';
import { serializeRun } from '../../../../../lib/serializers';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const list = await db.select().from(runs).where(eq(runs.scraperId, id)).orderBy(desc(runs.startedAt));
    return NextResponse.json(list.map(serializeRun));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
export const dynamic = 'force-dynamic';
