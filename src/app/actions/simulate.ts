'use server';

/**
 * Server action that triggers a simulation tick.
 * Runs on the server — no secrets exposed to the client.
 */
export async function triggerSimulation() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) return;

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
