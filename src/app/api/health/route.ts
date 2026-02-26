export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServiceReadiness } from '@/lib/utils/service-readiness';

export async function GET() {
  const readiness = getServiceReadiness();
  const isProduction = process.env.NODE_ENV === 'production';
  const healthy = !isProduction || readiness.readyForProduction;

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      readiness,
    },
    { status: healthy ? 200 : 503 },
  );
}
