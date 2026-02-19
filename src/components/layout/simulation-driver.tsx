'use client';

import { useEffect, useRef } from 'react';
import { triggerSimulation } from '@/app/actions/simulate';

const POLL_INTERVAL = 30_000; // 30 seconds

/**
 * Invisible component that drives the simulation forward.
 * Calls a server action periodically while the user has the app open.
 * The secret stays on the server — nothing exposed in the browser bundle.
 */
export function SimulationDriver() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isVisibleRef = useRef(true);

  useEffect(() => {
    async function tick() {
      if (!isVisibleRef.current) return;

      try {
        await triggerSimulation();
      } catch {
        // Silently ignore — will retry on next interval
      }
    }

    function onVisibilityChange() {
      isVisibleRef.current = !document.hidden;
      if (isVisibleRef.current) {
        tick();
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange);

    const startTimer = setTimeout(tick, 3000);
    intervalRef.current = setInterval(tick, POLL_INTERVAL);

    return () => {
      clearTimeout(startTimer);
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return null;
}
