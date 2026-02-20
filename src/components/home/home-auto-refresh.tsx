'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface HomeAutoRefreshProps {
  /** ISO timestamp when intermission/week break ends — triggers refresh at this time + buffer */
  refreshAt: string | null;
  /** Game ID of the currently live game — used for live monitoring */
  liveGameId: string | null;
  /** Current page state determines refresh strategy */
  pageState: 'live' | 'intermission' | 'week_break' | 'next_game' | 'week_complete';
}

/**
 * Invisible client component that handles automatic page refresh
 * for the server-rendered homepage. Also auto-navigates to live games.
 */
export function HomeAutoRefresh({ refreshAt, liveGameId, pageState }: HomeAutoRefreshProps) {
  const router = useRouter();
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const intervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);
  const [redirecting, setRedirecting] = useState<string | null>(null);
  const [redirectCountdown, setRedirectCountdown] = useState(3);

  useEffect(() => {
    // Clear any existing timers/intervals on re-render
    timersRef.current.forEach(clearTimeout);
    intervalsRef.current.forEach(clearInterval);
    timersRef.current = [];
    intervalsRef.current = [];

    // Strategy 1: Timed refresh — schedule router.refresh() when intermission/break ends
    if (refreshAt) {
      const endsAt = new Date(refreshAt).getTime();
      const delay = endsAt - Date.now() + 3000; // 3s buffer after end time

      if (delay > 0) {
        const timer = setTimeout(() => {
          router.refresh();
        }, delay);
        timersRef.current.push(timer);
      } else {
        // Already past — refresh now
        router.refresh();
      }
    }

    // Strategy 2: Live game monitoring — poll to detect when game ends
    if (pageState === 'live' && liveGameId) {
      const interval = setInterval(async () => {
        try {
          const res = await fetch('/api/game/current');
          const data = await res.json();

          // If the game is no longer live, refresh the page to show new state
          if (!data.currentGame || data.currentGame.id !== liveGameId) {
            router.refresh();
          }
        } catch {
          // Silently fail — will retry on next interval
        }
      }, 15_000);
      intervalsRef.current.push(interval);
    }

    // Strategy 3: Stale state polling — when week is complete, poll for new activity
    if (pageState === 'week_complete') {
      const interval = setInterval(() => {
        router.refresh();
      }, 30_000);
      intervalsRef.current.push(interval);
    }

    // Strategy 4: Auto-navigate to live game when "next_game" state
    if (pageState === 'next_game') {
      const interval = setInterval(async () => {
        try {
          const res = await fetch('/api/game/current');
          const data = await res.json();

          // Check if a game is now broadcasting/simulating
          if (data.currentGame && (data.currentGame.status === 'broadcasting' || data.currentGame.status === 'simulating')) {
            clearInterval(interval);
            setRedirecting(data.currentGame.id);
          }
        } catch {
          // Silently fail — will retry on next interval
        }
      }, 10_000);
      intervalsRef.current.push(interval);
    }

    return () => {
      timersRef.current.forEach(clearTimeout);
      intervalsRef.current.forEach(clearInterval);
      timersRef.current = [];
      intervalsRef.current = [];
    };
  }, [refreshAt, liveGameId, pageState, router]);

  // Handle redirect countdown
  useEffect(() => {
    if (!redirecting) return;

    setRedirectCountdown(3);
    const countdownInterval = setInterval(() => {
      setRedirectCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
          router.push(`/game/${redirecting}`);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdownInterval);
  }, [redirecting, router]);

  if (redirecting) {
    return (
      <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center px-4 py-3 bg-gold/90 text-midnight">
        <div className="flex items-center gap-3">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-midnight opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-midnight" />
          </span>
          <span className="text-sm font-bold">
            Game starting! Redirecting in {redirectCountdown}...
          </span>
        </div>
      </div>
    );
  }

  return null;
}
