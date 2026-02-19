'use client';

import { useEffect, useRef, useState } from 'react';
import type { GameState } from '@/lib/simulation/types';
import { Badge } from '@/components/ui/badge';
import { useCountdown } from '@/hooks/use-countdown';
import {
  formatQuarter,
  formatDownAndDistance,
  formatFieldPosition,
} from '@/lib/utils/formatting';
import { getTeamScoreboardLogoUrl } from '@/lib/utils/team-logos';

interface ScoreBugProps {
  gameState: GameState;
  status: 'live' | 'game_over';
}

export function ScoreBug({ gameState, status }: ScoreBugProps) {
  const {
    homeTeam,
    awayTeam,
    homeScore,
    awayScore,
    quarter,
    clock,
    possession,
    down,
    yardsToGo,
    ballPosition,
    homeTimeouts,
    awayTimeouts,
    isClockRunning,
    isHalftime,
    kickoff,
    patAttempt,
  } = gameState;

  const { formatted: clockDisplay } = useCountdown(clock, isClockRunning && status === 'live');

  // Track score changes for animation
  const [homeScoreAnim, setHomeScoreAnim] = useState(false);
  const [awayScoreAnim, setAwayScoreAnim] = useState(false);
  const prevHomeScore = useRef(homeScore);
  const prevAwayScore = useRef(awayScore);

  useEffect(() => {
    if (homeScore !== prevHomeScore.current) {
      setHomeScoreAnim(true);
      prevHomeScore.current = homeScore;
      const t = setTimeout(() => setHomeScoreAnim(false), 700);
      return () => clearTimeout(t);
    }
  }, [homeScore]);

  useEffect(() => {
    if (awayScore !== prevAwayScore.current) {
      setAwayScoreAnim(true);
      prevAwayScore.current = awayScore;
      const t = setTimeout(() => setAwayScoreAnim(false), 700);
      return () => clearTimeout(t);
    }
  }, [awayScore]);

  const situationText = isHalftime
    ? 'HALFTIME'
    : kickoff
      ? 'KICKOFF'
      : patAttempt
        ? 'PAT ATTEMPT'
        : formatDownAndDistance(down, yardsToGo, ballPosition);

  const fieldPosText =
    isHalftime || kickoff || patAttempt
      ? ''
      : formatFieldPosition(
          ballPosition,
          homeTeam.abbreviation,
          awayTeam.abbreviation,
          possession
        );

  return (
    <div className="scorebug-glass border-b border-white/[0.06] z-50 flex-shrink-0">
      {/* ── Desktop layout ── */}
      <div className="hidden sm:block max-w-4xl mx-auto">
        {/* Main row: Away | Center | Home */}
        <div className="flex items-center h-[56px] px-4">
          {/* Away team side */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <img
              src={getTeamScoreboardLogoUrl(awayTeam.abbreviation)}
              alt=""
              className="w-7 h-7 flex-shrink-0 object-contain"
            />
            <span
              className={`text-sm font-bold tracking-wide ${
                possession === 'away' ? 'text-text-primary' : 'text-text-secondary'
              }`}
            >
              {awayTeam.abbreviation}
            </span>
            {possession === 'away' && (
              <span className="text-gold text-[8px]">{'\u25B6'}</span>
            )}
            <TimeoutDots remaining={awayTimeouts} color={awayTeam.primaryColor} />
            <span
              className={`font-mono text-2xl font-black tabular-nums ml-auto ${
                awayScoreAnim ? 'score-update' : ''
              }`}
            >
              {awayScore}
            </span>
          </div>

          {/* Center: clock + quarter + status */}
          <div className="flex flex-col items-center mx-6 min-w-[100px]">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-text-secondary tracking-widest uppercase">
                {formatQuarter(quarter)}
              </span>
              {status === 'live' ? (
                <Badge variant="live" size="sm" pulse>LIVE</Badge>
              ) : (
                <Badge variant="final" size="sm">FINAL</Badge>
              )}
            </div>
            <span className="font-mono text-xl font-black tabular-nums text-text-primary leading-tight">
              {isHalftime ? 'HALF' : clockDisplay}
            </span>
          </div>

          {/* Home team side */}
          <div className="flex items-center gap-3 flex-1 min-w-0 justify-end">
            <span
              className={`font-mono text-2xl font-black tabular-nums mr-auto ${
                homeScoreAnim ? 'score-update' : ''
              }`}
            >
              {homeScore}
            </span>
            <TimeoutDots remaining={homeTimeouts} color={homeTeam.primaryColor} />
            {possession === 'home' && (
              <span className="text-gold text-[8px]">{'\u25C0'}</span>
            )}
            <span
              className={`text-sm font-bold tracking-wide ${
                possession === 'home' ? 'text-text-primary' : 'text-text-secondary'
              }`}
            >
              {homeTeam.abbreviation}
            </span>
            <img
              src={getTeamScoreboardLogoUrl(homeTeam.abbreviation)}
              alt=""
              className="w-7 h-7 flex-shrink-0 object-contain"
            />
          </div>
        </div>

        {/* Situation row */}
        <div className="flex items-center justify-center gap-3 h-6 border-t border-white/[0.04]">
          <span className="text-[11px] font-bold text-text-secondary tracking-wide">
            {situationText}
          </span>
          {fieldPosText && (
            <>
              <span className="text-[10px] text-border">{'|'}</span>
              <span className="text-[11px] text-text-muted font-medium">
                {fieldPosText}
              </span>
            </>
          )}
        </div>
      </div>

      {/* ── Mobile layout ── */}
      <div className="sm:hidden">
        {/* Main row: Away | Clock | Home */}
        <div className="flex items-center h-11 px-3">
          {/* Away side */}
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <img
              src={getTeamScoreboardLogoUrl(awayTeam.abbreviation)}
              alt=""
              className="w-5 h-5 flex-shrink-0 object-contain"
            />
            <span
              className={`text-xs font-bold ${
                possession === 'away' ? 'text-text-primary' : 'text-text-secondary'
              }`}
            >
              {awayTeam.abbreviation}
            </span>
            {possession === 'away' && (
              <span className="text-gold text-[7px]">{'\u25B6'}</span>
            )}
            <span
              className={`font-mono text-lg font-black tabular-nums ml-auto ${
                awayScoreAnim ? 'score-update' : ''
              }`}
            >
              {awayScore}
            </span>
          </div>

          {/* Center: clock + quarter */}
          <div className="flex flex-col items-center mx-3 min-w-[60px]">
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] font-bold text-text-muted tracking-widest uppercase">
                {formatQuarter(quarter)}
              </span>
              {status === 'live' ? (
                <Badge variant="live" size="sm" pulse>LIVE</Badge>
              ) : (
                <Badge variant="final" size="sm">FINAL</Badge>
              )}
            </div>
            <span className="font-mono text-sm font-black tabular-nums leading-none">
              {isHalftime ? 'HALF' : clockDisplay}
            </span>
          </div>

          {/* Home side */}
          <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
            <span
              className={`font-mono text-lg font-black tabular-nums mr-auto ${
                homeScoreAnim ? 'score-update' : ''
              }`}
            >
              {homeScore}
            </span>
            {possession === 'home' && (
              <span className="text-gold text-[7px]">{'\u25C0'}</span>
            )}
            <span
              className={`text-xs font-bold ${
                possession === 'home' ? 'text-text-primary' : 'text-text-secondary'
              }`}
            >
              {homeTeam.abbreviation}
            </span>
            <img
              src={getTeamScoreboardLogoUrl(homeTeam.abbreviation)}
              alt=""
              className="w-5 h-5 flex-shrink-0 object-contain"
            />
          </div>
        </div>

        {/* Situation row: timeouts + situation + timeouts */}
        <div className="flex items-center h-6 px-3 gap-2 border-t border-white/[0.04]">
          <TimeoutDots remaining={awayTimeouts} color={awayTeam.primaryColor} size="sm" />
          <span className="text-[10px] font-bold text-text-secondary tracking-wide flex-1 text-center">
            {situationText}
            {fieldPosText && (
              <span className="text-text-muted font-medium ml-1.5">{fieldPosText}</span>
            )}
          </span>
          <TimeoutDots remaining={homeTimeouts} color={homeTeam.primaryColor} size="sm" />
        </div>
      </div>
    </div>
  );
}

function TimeoutDots({
  remaining,
  color,
  size = 'md',
}: {
  remaining: number;
  color: string;
  size?: 'sm' | 'md';
}) {
  const dotSize = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2';

  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className={`${dotSize} rounded-full transition-colors duration-300`}
          style={{
            backgroundColor: i <= remaining ? color : 'transparent',
            border: `1.5px solid ${i <= remaining ? color : 'rgba(100, 116, 139, 0.4)'}`,
          }}
        />
      ))}
    </div>
  );
}
