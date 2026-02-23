'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  GameEvent,
  GameState,
  BoxScore,
  PlayerGameStats,
  StreamMessage,
} from '@/lib/simulation/types';

export type BreakType = 'quarter_1_end' | 'halftime' | 'quarter_3_end' | 'two_minute_warning' | null;

interface GameStreamState {
  events: GameEvent[];
  currentEvent: GameEvent | null;
  gameState: GameState | null;
  boxScore: BoxScore | null;
  mvp: PlayerGameStats | null;
  finalScore: { home: number; away: number } | null;
  status: 'connecting' | 'live' | 'catchup' | 'game_over' | 'error' | 'intermission';
  error: string | null;
  intermissionMessage: string | null;
  intermissionCountdown: number;
  nextGameId: string | null;
  pendingBreak: BreakType;
}

const INITIAL_STATE: GameStreamState = {
  events: [],
  currentEvent: null,
  gameState: null,
  boxScore: null,
  mvp: null,
  finalScore: null,
  status: 'connecting',
  error: null,
  intermissionMessage: null,
  intermissionCountdown: 0,
  nextGameId: null,
  pendingBreak: null,
};

const MAX_RECONNECT_DELAY = 30000;
const BASE_RECONNECT_DELAY = 1000;

export function useGameStream(gameId: string | null): GameStreamState & {
  reconnect: () => void;
  pause: () => void;
  resume: () => void;
} {
  const [state, setState] = useState<GameStreamState>(INITIAL_STATE);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackQueueRef = useRef<GameEvent[]>([]);
  const playbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCatchingUpRef = useRef(false);
  const isReconnectingRef = useRef(false);
  const pauseRef = useRef(false);
  const pauseQueueRef = useRef<GameEvent[]>([]);

  // Break detection refs — track last RENDERED quarter/clock so we can
  // intercept quarter-crossing events BEFORE they paint to the UI.
  const lastRenderedQuarterRef = useRef<number | 'OT' | null>(null);
  const lastRenderedClockRef = useRef<number | null>(null);
  const breakBufferRef = useRef<GameEvent | null>(null);
  const breaksShownRef = useRef<Set<string>>(new Set());

  const clearTimers = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (playbackTimerRef.current) {
      clearTimeout(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
  }, []);

  /**
   * Detect if an incoming event crosses a quarter boundary or 2-minute warning
   * relative to the last rendered state. Returns the break type or null.
   */
  const detectBreak = useCallback((event: GameEvent): BreakType => {
    const prevQ = lastRenderedQuarterRef.current;
    const prevClock = lastRenderedClockRef.current;
    const newQ = event.gameState.quarter;

    // No previous state to compare against (first event)
    if (prevQ === null) return null;

    // Quarter transitions
    if (typeof prevQ === 'number' && typeof newQ === 'number') {
      // Q1 → Q2
      if (prevQ === 1 && newQ === 2 && !breaksShownRef.current.has('quarter_1_end')) {
        breaksShownRef.current.add('quarter_1_end');
        return 'quarter_1_end';
      }
      // Q2 → Q3 (halftime)
      if (prevQ === 2 && newQ === 3 && !breaksShownRef.current.has('halftime')) {
        breaksShownRef.current.add('halftime');
        return 'halftime';
      }
      // Q3 → Q4
      if (prevQ === 3 && newQ === 4 && !breaksShownRef.current.has('quarter_3_end')) {
        breaksShownRef.current.add('quarter_3_end');
        return 'quarter_3_end';
      }
    }

    // Two-minute warning: Q4, clock crossed 120s
    if (
      typeof newQ === 'number' && newQ === 4 &&
      typeof prevClock === 'number' && prevClock > 120 &&
      event.gameState.clock <= 120 &&
      !breaksShownRef.current.has('two_minute_warning')
    ) {
      breaksShownRef.current.add('two_minute_warning');
      return 'two_minute_warning';
    }

    return null;
  }, []);

  /**
   * Apply an event to state and update tracking refs.
   */
  const applyEvent = useCallback((event: GameEvent) => {
    lastRenderedQuarterRef.current = event.gameState.quarter;
    lastRenderedClockRef.current = event.gameState.clock;
    setState((prev) => ({
      ...prev,
      events: [...prev.events, event],
      currentEvent: event,
      gameState: event.gameState,
      status: 'live',
    }));
  }, []);

  /**
   * Try to render an event, intercepting it if it triggers a break.
   * Returns true if the event was held back (break triggered).
   */
  const tryRenderEvent = useCallback((event: GameEvent): boolean => {
    const breakType = detectBreak(event);
    if (breakType) {
      // Hold this event — don't render it yet
      breakBufferRef.current = event;
      pauseRef.current = true;
      setState((prev) => ({ ...prev, pendingBreak: breakType }));
      return true; // event was intercepted
    }
    // No break — render normally
    applyEvent(event);
    return false;
  }, [detectBreak, applyEvent]);

  const processPlaybackQueue = useCallback(() => {
    if (playbackQueueRef.current.length === 0) return;

    const nextEvent = playbackQueueRef.current.shift()!;

    // Check for break before rendering
    const intercepted = tryRenderEvent(nextEvent);
    if (intercepted) {
      // Event held — remaining queue stays in playbackQueueRef
      return;
    }

    // Schedule next event playback with timing based on play type
    if (playbackQueueRef.current.length > 0) {
      const delay = getPlaybackDelay(nextEvent);
      playbackTimerRef.current = setTimeout(processPlaybackQueue, delay);
    }
  }, [tryRenderEvent]);

  const connect = useCallback(() => {
    if (!gameId) return;

    // Clean up any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    clearTimers();

    // When reconnecting (server-initiated or error recovery with existing state),
    // keep the current UI state instead of flashing back to "connecting"
    if (!isReconnectingRef.current) {
      setState((prev) => ({ ...prev, status: 'connecting', error: null }));
    } else {
      setState((prev) => ({ ...prev, error: null }));
    }

    const url = `/api/game/${gameId}/stream`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      reconnectAttemptRef.current = 0;
      isReconnectingRef.current = false;
    };

    eventSource.onmessage = (event) => {
      try {
        const message: StreamMessage = JSON.parse(event.data);

        switch (message.type) {
          case 'catchup': {
            isCatchingUpRef.current = true;
            // Apply all catchup events immediately without animation delay
            // Set tracking refs from the final catchup event — skip break detection
            const lastCatchupEvent = message.events[message.events.length - 1] ?? null;
            if (lastCatchupEvent) {
              lastRenderedQuarterRef.current = lastCatchupEvent.gameState.quarter;
              lastRenderedClockRef.current = lastCatchupEvent.gameState.clock;
              // Mark all breaks up to this point as shown
              const q = lastCatchupEvent.gameState.quarter;
              if (typeof q === 'number') {
                if (q >= 2) breaksShownRef.current.add('quarter_1_end');
                if (q >= 3) breaksShownRef.current.add('halftime');
                if (q >= 4) breaksShownRef.current.add('quarter_3_end');
                if (q === 4 && lastCatchupEvent.gameState.clock <= 120) {
                  breaksShownRef.current.add('two_minute_warning');
                }
              }
            }
            setState((prev) => ({
              ...prev,
              events: message.events,
              currentEvent: lastCatchupEvent,
              gameState: message.gameState,
              status: 'catchup',
            }));
            // Briefly show catchup state, then transition to live
            setTimeout(() => {
              isCatchingUpRef.current = false;
              setState((prev) => ({
                ...prev,
                status: 'live',
              }));
            }, 500);
            break;
          }

          case 'play': {
            if (pauseRef.current) {
              // Paused (either user-initiated or break-initiated) — buffer events for later
              pauseQueueRef.current.push(message.event);
            } else if (isCatchingUpRef.current) {
              // Still catching up -- queue this play
              playbackQueueRef.current.push(message.event);
            } else if (playbackQueueRef.current.length > 0) {
              // There are queued plays, add to queue
              playbackQueueRef.current.push(message.event);
            } else {
              // Try to immediately display the play (may be intercepted for break)
              tryRenderEvent(message.event);
            }
            break;
          }

          case 'game_over': {
            // Flush any remaining queued events
            playbackQueueRef.current = [];
            clearTimers();

            setState((prev) => ({
              ...prev,
              boxScore: message.boxScore,
              finalScore: message.finalScore,
              mvp: message.mvp,
              status: 'game_over',
              pendingBreak: null, // clear any pending break
            }));
            break;
          }

          case 'intermission': {
            setState((prev) => ({
              ...prev,
              // Don't overwrite game_over status — the user should see the
              // game-over summary, not the intermission screen. Store the
              // intermission data so GameOverWithRedirect can show "Up Next".
              status: prev.status === 'game_over' ? 'game_over' : 'intermission',
              intermissionMessage: message.message,
              intermissionCountdown: message.countdown,
              nextGameId: message.nextGameId,
            }));
            break;
          }

          case 'reconnect': {
            // Server is about to close the connection (approaching Vercel timeout).
            // Reconnect seamlessly without resetting UI state.
            isReconnectingRef.current = true;
            reconnectAttemptRef.current = 0;
            // Store in ref so clearTimers() cancels it on gameId change
            reconnectTimeoutRef.current = setTimeout(() => connect(), 100);
            break;
          }

          case 'week_recap': {
            // Week recap can be handled by the parent component
            // We just store it as an event for now
            break;
          }

          case 'error': {
            setState((prev) => ({
              ...prev,
              status: 'error',
              error: message.message,
            }));
            break;
          }
        }
      } catch {
        console.error('Failed to parse SSE message');
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      eventSourceRef.current = null;

      // Don't reconnect if the game is over or intermission
      setState((prev) => {
        if (prev.status === 'game_over' || prev.status === 'intermission') return prev;

        const attempt = reconnectAttemptRef.current;
        const delay = Math.min(
          BASE_RECONNECT_DELAY * Math.pow(2, attempt),
          MAX_RECONNECT_DELAY
        );
        reconnectAttemptRef.current = attempt + 1;

        // If we have events, reconnect silently in the background
        // without changing the displayed status (no UI flash)
        if (prev.events.length > 0) {
          isReconnectingRef.current = true;
        }

        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);

        // Keep current status if we have events (silent reconnect)
        return {
          ...prev,
          status: prev.events.length > 0 ? prev.status : 'error',
          error: prev.events.length > 0 ? null : `Connection lost. Reconnecting in ${Math.round(delay / 1000)}s...`,
        };
      });
    };
  }, [gameId, clearTimers, tryRenderEvent]);

  const reconnect = useCallback(() => {
    reconnectAttemptRef.current = 0;
    connect();
  }, [connect]);

  const pause = useCallback(() => {
    pauseRef.current = true;
  }, []);

  const resume = useCallback(() => {
    // If there's a buffered break event, flush it to state first
    if (breakBufferRef.current) {
      applyEvent(breakBufferRef.current);
      breakBufferRef.current = null;
    }

    // Clear pending break
    setState((prev) => ({ ...prev, pendingBreak: null }));

    pauseRef.current = false;
    // Move buffered events into the playback queue and drain them
    if (pauseQueueRef.current.length > 0) {
      playbackQueueRef.current.push(...pauseQueueRef.current);
      pauseQueueRef.current = [];
      if (!playbackTimerRef.current) {
        processPlaybackQueue();
      }
    }
  }, [processPlaybackQueue, applyEvent]);

  // Connect on mount / gameId change
  useEffect(() => {
    if (!gameId) {
      setState(INITIAL_STATE);
      return;
    }

    // Reset state for new game
    setState(INITIAL_STATE);
    playbackQueueRef.current = [];
    pauseQueueRef.current = [];
    pauseRef.current = false;
    isCatchingUpRef.current = false;
    isReconnectingRef.current = false;
    lastRenderedQuarterRef.current = null;
    lastRenderedClockRef.current = null;
    breakBufferRef.current = null;
    breaksShownRef.current = new Set();

    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      clearTimers();
      playbackQueueRef.current = [];
    };
  }, [gameId, connect, clearTimers]);

  // Start playback queue processing when catchup finishes and there are queued plays
  useEffect(() => {
    if (
      state.status === 'live' &&
      !isCatchingUpRef.current &&
      playbackQueueRef.current.length > 0 &&
      !playbackTimerRef.current
    ) {
      processPlaybackQueue();
    }
  }, [state.status, processPlaybackQueue]);

  return {
    ...state,
    reconnect,
    pause,
    resume,
  };
}

/**
 * Calculate playback delay between events based on play significance.
 * Bigger plays get more breathing room to build drama.
 */
function getPlaybackDelay(event: GameEvent): number {
  const { playResult, commentary } = event;

  // Touchdowns and turnovers deserve the most dramatic pause
  if (playResult.isTouchdown) return 2500;
  if (playResult.turnover) return 2200;

  // Scoring plays
  if (playResult.scoring) return 1800;

  // Big plays (15+ yards)
  if (playResult.yardsGained >= 15) return 1400;

  // Sacks and penalties
  if (playResult.type === 'sack') return 1200;
  if (playResult.penalty && !playResult.penalty.declined) return 1200;

  // High excitement commentary
  if (commentary.excitement > 70) return 1400;

  // Kickoffs get extra time for intro overlay and dramatic ball flight
  if (playResult.type === 'kickoff') return 1800;
  // Punts
  if (playResult.type === 'punt') return 1000;

  // Normal plays
  return 800;
}
