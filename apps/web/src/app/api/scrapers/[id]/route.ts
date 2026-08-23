import { NextResponse } from 'next/server';
import { db } from '../../../../db';
import { scrapers } from '../../../../db/schema';
import { eq } from 'drizzle-orm';
import { serializeScraper } from '../../../../lib/serializers';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const list = await db.select().from(scrapers).where(eq(scrapers.id, id)).limit(1);
    if (list.length === 0) {
      return NextResponse.json({ error: 'Scraper not found' }, { status: 404 });
    }
    return NextResponse.json(serializeScraper(list[0]));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, description, target_url, schema_definition, schedule, status } = body;

    const list = await db.select().from(scrapers).where(eq(scrapers.id, id)).limit(1);
    if (list.length === 0) {
      return NextResponse.json({ error: 'Scraper not found' }, { status: 404 });
    }

    const updateFields: any = {};
    if (name !== undefined) updateFields.name = name;
    if (description !== undefined) updateFields.description = description;
    if (target_url !== undefined) updateFields.targetUrl = target_url;
    if (schema_definition !== undefined) updateFields.schemaDefinition = schema_definition;
    if (schedule !== undefined) updateFields.schedule = schedule;
    if (status !== undefined) updateFields.status = status;
    updateFields.updatedAt = new Date();

    await db.update(scrapers).set(updateFields).where(eq(scrapers.id, id));

    const updated = await db.select().from(scrapers).where(eq(scrapers.id, id)).limit(1);
    return NextResponse.json(serializeScraper(updated[0]));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const list = await db.select().from(scrapers).where(eq(scrapers.id, id)).limit(1);
    if (list.length === 0) {
      return NextResponse.json({ error: 'Scraper not found' }, { status: 404 });
    }

    await db.delete(scrapers).where(eq(scrapers.id, id));
    return NextResponse.json({ message: 'Scraper deleted successfully' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
