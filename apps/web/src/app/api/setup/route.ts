import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { INIT_SQL } from '../../../lib/schema-init';

export async function POST() {
  try {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      return NextResponse.json({ error: 'DATABASE_URL not set' }, { status: 500 });
    }

    const sql = neon(connectionString);
    const statements = INIT_SQL.split(';')
      .map((s) => s.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await sql.query(statement);
    }

    const tables = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;

    return NextResponse.json({
      success: true,
      message: 'Database schema initialized',
      tables: tables.map((t) => String(t.table_name)),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
