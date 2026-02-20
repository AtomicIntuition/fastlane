'use client';

interface DownDistanceOverlayProps {
  /** Absolute field % for ball position (0=left, 100=right) */
  ballLeftPercent: number;
  /** Absolute field % for first down line */
  firstDownLeftPercent: number;
  down: 1 | 2 | 3 | 4;
  yardsToGo: number;
  /** Is the ball inside the opponent's 20? */
  isRedZone: boolean;
  /** Is the ball inside the opponent's 5? */
  isGoalLine: boolean;
  possession: 'home' | 'away';
}

const DOWN_LABELS: Record<number, string> = {
  1: '1st',
  2: '2nd',
  3: '3rd',
  4: '4th',
};

/**
 * NFL broadcast-style down & distance overlay:
 * - Yellow semi-transparent first-down zone
 * - Blue line of scrimmage
 * - Yellow first-down line with glow
 * - Down & distance text badge
 * - Red zone pulse overlay
 * - Goal line shimmer
 */
export function DownDistanceOverlay({
  ballLeftPercent,
  firstDownLeftPercent,
  down,
  yardsToGo,
  isRedZone,
  isGoalLine,
  possession,
}: DownDistanceOverlayProps) {
  const leftBound = Math.min(ballLeftPercent, firstDownLeftPercent);
  const rightBound = Math.max(ballLeftPercent, firstDownLeftPercent);
  const zoneWidth = rightBound - leftBound;

  const downText = `${DOWN_LABELS[down]} & ${yardsToGo >= 10 && yardsToGo >= 100 ? 'Goal' : yardsToGo}`;
  const isGoalToGo = yardsToGo >= 100 || firstDownLeftPercent <= 0 || firstDownLeftPercent >= 100;

  return (
    <>
      {/* Yellow first-down zone */}
      {zoneWidth > 0.5 && (
        <div
          className="absolute top-0 bottom-0 pointer-events-none"
          style={{
            left: `${leftBound}%`,
            width: `${zoneWidth}%`,
            background: 'rgba(251, 191, 36, 0.1)',
          }}
        />
      )}

      {/* Line of scrimmage — blue */}
      <div
        className="absolute top-0 bottom-0 pointer-events-none"
        style={{
          left: `${ballLeftPercent}%`,
          width: '2.5px',
          transform: 'translateX(-50%)',
          background: '#3b82f6',
          boxShadow: '0 0 8px rgba(59, 130, 246, 0.6), 0 0 16px rgba(59, 130, 246, 0.3)',
        }}
      />

      {/* First down line — yellow */}
      {!isGoalToGo && firstDownLeftPercent > 0 && firstDownLeftPercent < 100 && (
        <div
          className="absolute top-0 bottom-0 pointer-events-none"
          style={{
            left: `${firstDownLeftPercent}%`,
            width: '2.5px',
            transform: 'translateX(-50%)',
            background: '#fbbf24',
            boxShadow: '0 0 12px rgba(251, 191, 36, 0.8), 0 0 24px rgba(251, 191, 36, 0.4)',
          }}
        />
      )}

      {/* Down & distance badge — positioned above field at LOS */}
      <div
        className="absolute pointer-events-none z-30"
        style={{
          left: `${ballLeftPercent}%`,
          top: '6px',
          transform: 'translateX(-50%)',
        }}
      >
        <div className="bg-black/70 backdrop-blur-sm rounded px-2 py-0.5 border border-white/10">
          <span className="text-[10px] sm:text-xs font-mono font-black text-white whitespace-nowrap">
            {downText}
          </span>
        </div>
      </div>

      {/* Red zone pulse */}
      {isRedZone && (
        <div
          className="absolute top-0 bottom-0 pointer-events-none red-zone-pulse"
          style={{
            // Pulse on the end zone side the offense is attacking
            left: possession === 'away' ? '83.33%' : '0%',
            width: '16.67%',
          }}
        />
      )}

      {/* Goal line shimmer */}
      {isGoalLine && (
        <div
          className="absolute top-0 bottom-0 pointer-events-none goal-line-shimmer"
          style={{
            left: possession === 'away' ? '91.67%' : '8.33%',
            width: '2px',
            transform: 'translateX(-50%)',
          }}
        />
      )}
    </>
  );
}
