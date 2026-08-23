import { NextResponse } from 'next/server';
import { db } from '../../../../../db';
import { healingAttempts } from '../../../../../db/schema';
import { eq, desc } from 'drizzle-orm';
import { serializeHealingAttempt } from '../../../../../lib/serializers';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const list = await db.select().from(healingAttempts).where(eq(healingAttempts.scraperId, id)).orderBy(desc(healingAttempts.startedAt));
    return NextResponse.json(list.map(serializeHealingAttempt));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
export const dynamic = 'force-dynamic';
