import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { db } from '../../../../../db';
import { runs } from '../../../../../db/schema';
import { eq } from 'drizzle-orm';

export async function GET(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await params;
    const list = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
    const run = list[0];
    if (!run) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }

    if (!run.rawResultReference) {
      return NextResponse.json([]);
    }

    const filepath = path.join(process.cwd(), 'storage', 'runs', run.rawResultReference);
    if (!fs.existsSync(filepath)) {
      return NextResponse.json([]);
    }

    const records = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    return NextResponse.json(records);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
