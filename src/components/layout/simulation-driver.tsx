'use client';

import { useEffect, useRef } from 'react';
import { triggerSimulation } from '@/app/actions/simulate';

const POLL_INTERVAL = 30_000; // 30 seconds

/**
 * Invisible component that drives the simulation forward.
 * Calls a server action periodically while the user has the app open.
 * The secret stays on the server — nothing exposed in the browser bundle.
 *
 * Uses a busy flag to prevent overlapping simulation requests, which
 * could cause double-counting of standings or duplicate game events.
 */
export function SimulationDriver() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isVisibleRef = useRef(true);
  const isBusyRef = useRef(false);

  useEffect(() => {
    async function tick() {
      if (!isVisibleRef.current) return;
      if (isBusyRef.current) return; // Skip if previous request still in flight

      isBusyRef.current = true;
      try {
        await triggerSimulation();
      } catch {
        // Silently ignore — will retry on next interval
      } finally {
        isBusyRef.current = false;
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
