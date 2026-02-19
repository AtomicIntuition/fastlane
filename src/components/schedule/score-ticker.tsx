'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import type { ScheduledGame } from '@/lib/simulation/types';
import { TeamLogo } from '@/components/team/team-logo';

interface ScoreTickerProps {
  games: ScheduledGame[];
  currentGameId?: string;
}

function TickerGame({
  game,
  isCurrent,
}: {
  game: ScheduledGame;
  isCurrent: boolean;
}) {
  const hasScores = game.homeScore !== null && game.awayScore !== null;
  const isLive = game.status === 'broadcasting';
  const isFinal = game.status === 'completed';

  return (
    <Link
      href={`/game/${game.id}`}
      className={`
        inline-flex items-center gap-3 px-4 py-1.5
        border-r border-border/50 last:border-r-0
        hover:bg-surface-hover transition-colors duration-150
        shrink-0
        ${isCurrent ? 'bg-surface-elevated' : ''}
      `}
    >
      {/* Status indicator */}
      {isLive && (
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-live-red opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-live-red" />
        </span>
      )}
      {isFinal && (
        <span className="text-[9px] font-bold text-text-muted uppercase tracking-wider shrink-0">
          F
        </span>
      )}
      {!isLive && !isFinal && (
        <span className="text-[9px] font-medium text-info uppercase tracking-wider shrink-0">
          --
        </span>
      )}

      {/* Away team */}
      <div className="flex items-center gap-1.5">
        {game.awayTeam && (
          <TeamLogo
            abbreviation={game.awayTeam.abbreviation}
            teamName={game.awayTeam.name}
            size={14}
            className="w-3.5 h-3.5 object-contain shrink-0"
          />
        )}
        <span className="text-xs font-semibold text-text-secondary whitespace-nowrap">
          {game.awayTeam?.abbreviation ?? '?'}
        </span>
        {hasScores && (
          <span
            className={`
              text-xs font-mono font-bold tabular-nums
              ${isFinal && game.awayScore! > game.homeScore! ? 'text-text-primary' : 'text-text-muted'}
            `}
          >
            {game.awayScore}
          </span>
        )}
      </div>

      {/* Separator */}
      <span className="text-[10px] text-text-muted">@</span>

      {/* Home team */}
      <div className="flex items-center gap-1.5">
        {game.homeTeam && (
          <TeamLogo
            abbreviation={game.homeTeam.abbreviation}
            teamName={game.homeTeam.name}
            size={14}
            className="w-3.5 h-3.5 object-contain shrink-0"
          />
        )}
        <span className="text-xs font-semibold text-text-secondary whitespace-nowrap">
          {game.homeTeam?.abbreviation ?? '?'}
        </span>
        {hasScores && (
          <span
            className={`
              text-xs font-mono font-bold tabular-nums
              ${isFinal && game.homeScore! > game.awayScore! ? 'text-text-primary' : 'text-text-muted'}
            `}
          >
            {game.homeScore}
          </span>
        )}
      </div>
    </Link>
  );
}

export function ScoreTicker({ games, currentGameId }: ScoreTickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);

  if (!games.length) return null;

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden bg-midnight border-b border-border/50"
      style={{ height: 'var(--ticker-height, 36px)' }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={() => setIsPaused(true)}
      onTouchEnd={() => setIsPaused(false)}
    >
      {/* Scrolling content - duplicated for seamless loop */}
      <div
        className={`ticker-content flex items-center h-full whitespace-nowrap ${isPaused ? '[animation-play-state:paused]' : ''}`}
      >
        {/* First set */}
        {games.map((game) => (
          <TickerGame
            key={`a-${game.id}`}
            game={game}
            isCurrent={game.id === currentGameId}
          />
        ))}
        {/* Duplicated set for seamless scrolling */}
        {games.map((game) => (
          <TickerGame
            key={`b-${game.id}`}
            game={game}
            isCurrent={game.id === currentGameId}
          />
        ))}
      </div>
    </div>
  );
}
