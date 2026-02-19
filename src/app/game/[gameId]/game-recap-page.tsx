'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import type {
  Team,
  BoxScore as BoxScoreType,
  PlayerGameStats,
  GameEvent,
  GameState,
} from '@/lib/simulation/types';
import { GameOverSummary } from '@/components/game/game-over-summary';
import { PlayFeed } from '@/components/game/play-feed';
import { FieldVisual } from '@/components/game/field-visual';
import { MomentumMeter } from '@/components/game/momentum-meter';
import { BoxScore } from '@/components/game/box-score';
import { ScoreBug } from '@/components/game/scorebug';
import { useMomentum } from '@/hooks/use-momentum';
import { buildLiveBoxScore } from '@/lib/utils/live-box-score';
import { getTeamScoreboardLogoUrl } from '@/lib/utils/team-logos';

interface GameRecapPageProps {
  gameId: string;
  homeTeam: Team;
  awayTeam: Team;
  finalScore: { home: number; away: number };
  boxScore: BoxScoreType | null;
  mvp: PlayerGameStats | null;
}

export function GameRecapPage({
  gameId,
  homeTeam,
  awayTeam,
  finalScore,
  boxScore,
  mvp,
}: GameRecapPageProps) {
  const [mode, setMode] = useState<'recap' | 'plays'>('recap');
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch all events when switching to plays view
  useEffect(() => {
    if (mode !== 'plays' || events.length > 0) return;

    setLoading(true);
    fetch(`/api/game/${gameId}/events`)
      .then((res) => res.json())
      .then((data: GameEvent[]) => {
        if (Array.isArray(data)) setEvents(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [mode, gameId, events.length]);

  if (mode === 'plays') {
    return (
      <GamePlaysView
        events={events}
        loading={loading}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        finalScore={finalScore}
        boxScore={boxScore}
        onBack={() => setMode('recap')}
      />
    );
  }

  return (
    <div className="min-h-dvh">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 scorebug-glass border-b border-white/[0.06]">
        <Link
          href="/"
          className="text-xs font-bold text-text-secondary hover:text-text-primary transition-colors"
        >
          {'\u2190'} Home
        </Link>
        <span className="text-[10px] font-bold text-text-muted tracking-wider uppercase">
          Game Recap
        </span>
        <Link
          href="/schedule"
          className="text-xs font-bold text-text-secondary hover:text-text-primary transition-colors"
        >
          Schedule
        </Link>
      </div>

      {/* Recap content */}
      <div className="pb-4">
        <GameOverSummary
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          finalScore={finalScore}
          boxScore={boxScore}
          mvp={mvp}
          nextGameCountdown={0}
        />

        {/* View full game button */}
        <div className="max-w-lg mx-auto px-4 mt-2">
          <button
            onClick={() => setMode('plays')}
            className="w-full glass-card rounded-xl py-3.5 text-center text-sm font-bold text-gold hover:bg-surface-hover transition-colors flex items-center justify-center gap-2"
          >
            View Full Game
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Static play-by-play browser ──────────────────────────────

function GamePlaysView({
  events,
  loading,
  homeTeam,
  awayTeam,
  finalScore,
  boxScore,
  onBack,
}: {
  events: GameEvent[];
  loading: boolean;
  homeTeam: Team;
  awayTeam: Team;
  finalScore: { home: number; away: number };
  boxScore: BoxScoreType | null;
  onBack: () => void;
}) {
  const { momentum } = useMomentum(events);
  const liveBoxScore = useMemo(() => buildLiveBoxScore(events), [events]);
  const activeBoxScore = boxScore ?? liveBoxScore;

  // Use final game state from last event
  const lastEvent = events[events.length - 1] ?? null;
  const gameState: GameState | null = lastEvent?.gameState ?? null;

  if (loading || !gameState) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-gold/30 border-t-gold animate-spin" />
          <span className="text-sm text-text-muted">Loading plays...</span>
        </div>
      </div>
    );
  }

  const firstDownLine = gameState.ballPosition + gameState.yardsToGo;

  return (
    <div className="flex flex-col min-h-dvh">
      {/* ── Mobile Layout ── */}
      <div className="flex flex-col h-dvh lg:hidden">
        {/* Scoreboard */}
        <ScoreBug gameState={gameState} status="game_over" />

        {/* Back button + field */}
        <div className="flex-shrink-0">
          <div className="flex items-center px-3 py-1.5 border-b border-border/50">
            <button
              onClick={onBack}
              className="text-xs font-bold text-text-secondary hover:text-text-primary transition-colors"
            >
              {'\u2190'} Back to Recap
            </button>
            <span className="text-[10px] text-text-muted font-bold tracking-wider uppercase ml-auto">
              {events.length} plays
            </span>
          </div>

          <FieldVisual
            ballPosition={gameState.ballPosition}
            firstDownLine={firstDownLine}
            possession={gameState.possession}
            homeTeam={{ abbreviation: homeTeam.abbreviation, primaryColor: homeTeam.primaryColor }}
            awayTeam={{ abbreviation: awayTeam.abbreviation, primaryColor: awayTeam.primaryColor }}
          />

          <MomentumMeter
            momentum={momentum}
            homeColor={homeTeam.primaryColor}
            awayColor={awayTeam.primaryColor}
            homeAbbrev={homeTeam.abbreviation}
            awayAbbrev={awayTeam.abbreviation}
          />
        </div>

        {/* All plays — scrollable */}
        <div className="flex-1 min-h-0">
          <PlayFeed events={events} isLive={false} />
        </div>
      </div>

      {/* ── Desktop Layout ── */}
      <div className="hidden lg:flex lg:flex-col lg:h-dvh">
        {/* Scoreboard */}
        <ScoreBug gameState={gameState} status="game_over" />

        {/* Toolbar */}
        <div className="flex items-center px-4 py-1.5 border-b border-border/50 flex-shrink-0">
          <button
            onClick={onBack}
            className="text-xs font-bold text-text-secondary hover:text-text-primary transition-colors"
          >
            {'\u2190'} Back to Recap
          </button>
          <span className="text-[10px] text-text-muted font-bold tracking-wider uppercase ml-auto">
            {events.length} plays
          </span>
        </div>

        {/* Content grid */}
        <div className="flex-1 min-h-0 grid grid-cols-3 gap-0">
          {/* Left: field + plays */}
          <div className="col-span-2 flex flex-col border-r border-border">
            <div className="flex-shrink-0">
              <FieldVisual
                ballPosition={gameState.ballPosition}
                firstDownLine={firstDownLine}
                possession={gameState.possession}
                homeTeam={{ abbreviation: homeTeam.abbreviation, primaryColor: homeTeam.primaryColor }}
                awayTeam={{ abbreviation: awayTeam.abbreviation, primaryColor: awayTeam.primaryColor }}
              />
              <MomentumMeter
                momentum={momentum}
                homeColor={homeTeam.primaryColor}
                awayColor={awayTeam.primaryColor}
                homeAbbrev={homeTeam.abbreviation}
                awayAbbrev={awayTeam.abbreviation}
              />
            </div>

            <div className="flex-1 min-h-0">
              <PlayFeed events={events} isLive={false} />
            </div>
          </div>

          {/* Right: box score */}
          <div className="col-span-1 overflow-y-auto">
            <BoxScore
              boxScore={activeBoxScore}
              homeTeam={homeTeam}
              awayTeam={awayTeam}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
