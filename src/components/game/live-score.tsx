'use client';

import { useGameStream } from '@/hooks/use-game-stream';

interface LiveScoreProps {
  gameId: string;
}

export function LiveScore({ gameId }: LiveScoreProps) {
  const stream = useGameStream(gameId);

  const homeScore = stream.gameState?.homeScore ?? 0;
  const awayScore = stream.gameState?.awayScore ?? 0;
  const quarter = stream.gameState?.quarter ?? null;
  const clock = stream.gameState?.clock ?? null;

  // Format clock as M:SS
  const clockDisplay =
    clock !== null
      ? `${Math.floor(clock / 60)}:${String(clock % 60).padStart(2, '0')}`
      : '';

  const quarterDisplay =
    quarter === 'OT' ? 'OT' : quarter ? `Q${quarter}` : '';

  const isConnecting = stream.status === 'connecting';
  const isLive = stream.status === 'live' || stream.status === 'catchup';
  const isGameOver = stream.status === 'game_over';

  // Use final score from stream if game is over
  const displayAway = isGameOver && stream.finalScore ? stream.finalScore.away : awayScore;
  const displayHome = isGameOver && stream.finalScore ? stream.finalScore.home : homeScore;

  return (
    <div className="text-center">
      <div className="flex items-baseline gap-3 sm:gap-5">
        <span className="font-mono text-4xl sm:text-6xl font-black tabular-nums">
          {isConnecting ? (
            <span className="text-text-muted animate-pulse">-</span>
          ) : (
            displayAway
          )}
        </span>
        <span className="text-text-muted text-lg sm:text-2xl font-medium">
          -
        </span>
        <span className="font-mono text-4xl sm:text-6xl font-black tabular-nums">
          {isConnecting ? (
            <span className="text-text-muted animate-pulse">-</span>
          ) : (
            displayHome
          )}
        </span>
      </div>
      {isConnecting && (
        <p className="text-xs text-text-muted mt-2 tracking-wider uppercase animate-pulse">
          Connecting...
        </p>
      )}
      {isLive && quarterDisplay && (
        <p className="text-xs text-gold mt-2 tracking-wider uppercase font-bold">
          {quarterDisplay} &middot; {clockDisplay}
        </p>
      )}
      {isGameOver && (
        <p className="text-xs text-text-muted mt-2 tracking-wider uppercase font-bold">
          Final
        </p>
      )}
    </div>
  );
}
