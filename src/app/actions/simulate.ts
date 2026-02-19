'use server';

import { headers } from 'next/headers';

/**
 * Server action that triggers a simulation tick.
 * Runs on the server — no secrets exposed to the client.
 * Uses the request's host header to build the correct URL automatically.
 */
export async function triggerSimulation() {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return;

  const headersList = await headers();
  const host = headersList.get('host');
  const protocol = headersList.get('x-forwarded-proto') ?? 'https';
  const baseUrl = `${protocol}://${host}`;

  try {
    const res = await fetch(`${baseUrl}/api/simulate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cronSecret}`,
      },
    });
    return await res.json();
  } catch {
    // Silently fail — next tick will retry
  }
}
