import { NextResponse } from 'next/server';
import { db } from '../../../../db';
import { runs } from '../../../../db/schema';
import { eq } from 'drizzle-orm';
import { serializeRun } from '../../../../lib/serializers';

export async function GET(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await params;
    const list = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
    if (list.length === 0) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }
    return NextResponse.json(serializeRun(list[0]));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
