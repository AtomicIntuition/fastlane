import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { jumbotronMessages } from '@/lib/db/schema';
import { gt, desc } from 'drizzle-orm';

// ============================================================
// GET /api/admin/jumbotron — Public: fetch latest active message
// ============================================================

export async function GET() {
  try {
    const rows = await db
      .select()
      .from(jumbotronMessages)
      .where(gt(jumbotronMessages.expiresAt, new Date()))
      .orderBy(desc(jumbotronMessages.createdAt))
      .limit(1);

    const message = rows[0] ?? null;
    return NextResponse.json({ message });
  } catch (error) {
    console.error('Jumbotron GET error:', error);
    return NextResponse.json({ message: null });
  }
}

// ============================================================
// POST /api/admin/jumbotron — Auth: create a new message
// ============================================================

export async function POST(request: NextRequest) {
  // Auth check
  const authHeader = request.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!authHeader || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      message,
      type = 'info',
      durationSeconds = 30,
    } = body as { message?: string; type?: string; durationSeconds?: number };

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const expiresAt = new Date(Date.now() + durationSeconds * 1000);

    const [created] = await db
      .insert(jumbotronMessages)
      .values({
        message: message.trim(),
        type,
        durationSeconds,
        expiresAt,
      })
      .returning();

    return NextResponse.json({ message: created }, { status: 201 });
  } catch (error) {
    console.error('Jumbotron POST error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ============================================================
// DELETE /api/admin/jumbotron — Auth: expire all messages
// ============================================================

export async function DELETE(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!authHeader || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Set all future expiresAt to now (effectively clearing them)
    await db
      .update(jumbotronMessages)
      .set({ expiresAt: new Date() })
      .where(gt(jumbotronMessages.expiresAt, new Date()));

    return NextResponse.json({ cleared: true });
  } catch (error) {
    console.error('Jumbotron DELETE error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
