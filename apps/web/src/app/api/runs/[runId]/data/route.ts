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

    // 1. Primary: Return rawResult directly from database if available
    if (run.rawResult && Array.isArray(run.rawResult) && run.rawResult.length > 0) {
      return NextResponse.json(run.rawResult);
    }

    // 2. Secondary fallback for older runs: Read from local disk file if present
    if (run.rawResultReference) {
      const filepath = path.join(process.cwd(), 'storage', 'runs', run.rawResultReference);
      if (fs.existsSync(filepath)) {
        const records = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
        return NextResponse.json(records);
      }
    }

    // Return stored rawResult if it exists (e.g. empty array or object)
    if (run.rawResult !== undefined && run.rawResult !== null) {
      return NextResponse.json(run.rawResult);
    }

    return NextResponse.json([]);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
