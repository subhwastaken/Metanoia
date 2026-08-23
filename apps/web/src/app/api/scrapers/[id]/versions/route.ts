import { NextResponse } from 'next/server';
import { db } from '../../../../../db';
import { selectorVersions } from '../../../../../db/schema';
import { eq, desc } from 'drizzle-orm';
import { serializeSelectorVersion } from '../../../../../lib/serializers';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const list = await db.select()
      .from(selectorVersions)
      .where(eq(selectorVersions.scraperId, id))
      .orderBy(desc(selectorVersions.version));
    return NextResponse.json(list.map(serializeSelectorVersion));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
export const dynamic = 'force-dynamic';
