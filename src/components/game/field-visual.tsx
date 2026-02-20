'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { PlayResult, NarrativeSnapshot } from '@/lib/simulation/types';
import { FieldSurface } from './field/field-surface';
import { BallMarker } from './field/ball-marker';
import { DownDistanceOverlay } from './field/down-distance-overlay';
import { PlayScene } from './field/play-scene';
import { CoinFlip } from './field/coin-flip';
import { CelebrationOverlay } from './field/celebration-overlay';
import { DriveTrail } from './field/drive-trail';
import { PlayerHighlight } from './field/player-highlight';

interface FieldVisualProps {
  ballPosition: number;
  firstDownLine: number;
  possession: 'home' | 'away';
  homeTeam: { abbreviation: string; primaryColor: string; secondaryColor: string };
  awayTeam: { abbreviation: string; primaryColor: string; secondaryColor: string };
  down: 1 | 2 | 3 | 4;
  yardsToGo: number;
  quarter: number | 'OT';
  clock: number;
  lastPlay: PlayResult | null;
  isKickoff: boolean;
  isPatAttempt: boolean;
  gameStatus: 'pregame' | 'live' | 'halftime' | 'game_over';
  driveStartPosition: number;
  narrativeContext: NarrativeSnapshot | null;
}

/**
 * Immersive field visual — orchestrator component.
 * Manages perspective container, coordinate conversions, animation state,
 * and delegates rendering to specialized sub-components.
 */
export function FieldVisual({
  ballPosition,
  firstDownLine,
  possession,
  homeTeam,
  awayTeam,
  down,
  yardsToGo,
  quarter,
  lastPlay,
  isKickoff,
  isPatAttempt,
  gameStatus,
  driveStartPosition,
}: FieldVisualProps) {
  // ── Coordinate conversion ─────────────────────────────

  const toAbsolutePercent = (pos: number, team: 'home' | 'away'): number => {
    return team === 'home' ? 100 - pos : pos;
  };

  let absoluteBallPct = toAbsolutePercent(ballPosition, possession);

  // Force ball to the correct end zone on touchdowns.
  // After a TD the engine sets ballPosition=15 (PAT spot), so the normal
  // coordinate conversion places the ball nowhere near the end zone.
  // Override: home scores at the left end zone (0%), away at the right (100%).
  if (lastPlay?.isTouchdown && lastPlay?.scoring) {
    absoluteBallPct = lastPlay.scoring.team === 'home' ? 0 : 100;
  }

  const absoluteFirstDownPct = toAbsolutePercent(
    Math.min(firstDownLine, 100),
    possession
  );
  const absoluteDriveStartPct = toAbsolutePercent(driveStartPosition, possession);

  // End zones take ~8.33% each side, playing field is ~83.33% in the middle
  const endZoneWidth = 8.33;
  const fieldStart = endZoneWidth;
  const fieldWidth = 100 - endZoneWidth * 2;

  let ballLeft = fieldStart + (absoluteBallPct / 100) * fieldWidth;

  // Push ball visually INTO the end zone graphic
  if (lastPlay?.isTouchdown) {
    if (absoluteBallPct >= 95) {
      ballLeft = 96; // Deep in the right end zone
    } else if (absoluteBallPct <= 5) {
      ballLeft = 4;  // Deep in the left end zone
    }
  }

  const firstDownLeft = fieldStart + (absoluteFirstDownPct / 100) * fieldWidth;
  const driveStartLeft = fieldStart + (absoluteDriveStartPct / 100) * fieldWidth;

  // ── Play tracking for animations ──────────────────────

  const [playKey, setPlayKey] = useState(0);
  const [celebKey, setCelebKey] = useState(0);
  const [highlightKey, setHighlightKey] = useState(0);
  const prevPlayRef = useRef<PlayResult | null>(null);
  const [prevBallLeft, setPrevBallLeft] = useState(ballLeft);

  // Track previous ball position for direction detection
  const ballDirection = useMemo<'left' | 'right' | null>(() => {
    const diff = ballLeft - prevBallLeft;
    if (Math.abs(diff) < 0.5) return null;
    return diff > 0 ? 'right' : 'left';
  }, [ballLeft, prevBallLeft]);

  useEffect(() => {
    setPrevBallLeft(ballLeft);
  }, [ballLeft]);

  // Detect new play
  useEffect(() => {
    if (!lastPlay || lastPlay === prevPlayRef.current) return;
    prevPlayRef.current = lastPlay;
    setPlayKey((k) => k + 1);

    // Trigger celebration?
    if (lastPlay.isTouchdown) {
      setCelebKey((k) => k + 1);
    } else if (lastPlay.turnover) {
      setCelebKey((k) => k + 1);
    } else if (lastPlay.isSafety) {
      setCelebKey((k) => k + 1);
    } else if (lastPlay.type === 'field_goal' && lastPlay.scoring) {
      setCelebKey((k) => k + 1);
    }

    // Trigger player highlight on big plays
    const isBigPlay =
      lastPlay.isTouchdown ||
      lastPlay.turnover != null ||
      lastPlay.type === 'sack' ||
      (lastPlay.type === 'pass_complete' && lastPlay.yardsGained > 20) ||
      (lastPlay.type === 'run' && lastPlay.yardsGained > 15);

    if (isBigPlay) {
      setHighlightKey((k) => k + 1);
    }
  }, [lastPlay]);

  // ── Celebration type ──────────────────────────────────

  const celebType = useMemo(() => {
    if (!lastPlay) return null;
    if (lastPlay.isTouchdown) return 'touchdown' as const;
    if (lastPlay.turnover) return 'turnover' as const;
    if (lastPlay.isSafety) return 'safety' as const;
    if (lastPlay.type === 'field_goal' && lastPlay.scoring) return 'field_goal' as const;
    return null;
  }, [lastPlay]);

  // ── Coin flip state ───────────────────────────────────

  const [showCoinFlip, setShowCoinFlip] = useState(false);
  const coinFlipShownRef = useRef(false);

  // Trigger coin flip when we receive a coin_toss event from the engine
  useEffect(() => {
    if (
      lastPlay?.type === 'coin_toss' &&
      !coinFlipShownRef.current
    ) {
      setShowCoinFlip(true);
      coinFlipShownRef.current = true;
    }
  }, [lastPlay]);

  const handleCoinFlipComplete = useCallback(() => {
    setShowCoinFlip(false);
  }, []);

  // ── Kicking detection for ball launch ─────────────────

  const isKicking =
    lastPlay?.type === 'punt' ||
    lastPlay?.type === 'kickoff' ||
    lastPlay?.type === 'field_goal' ||
    lastPlay?.type === 'extra_point';

  // ── Player highlight data ─────────────────────────────

  const highlightPlayer = useMemo(() => {
    if (!lastPlay) return { name: null, number: null };
    if (lastPlay.isTouchdown) {
      const p = lastPlay.receiver ?? lastPlay.rusher ?? lastPlay.passer;
      return { name: p?.name ?? null, number: null };
    }
    if (lastPlay.turnover) {
      const p = lastPlay.defender ?? lastPlay.passer;
      return { name: p?.name ?? null, number: null };
    }
    if (lastPlay.type === 'sack') {
      return { name: lastPlay.defender?.name ?? null, number: null };
    }
    if (lastPlay.type === 'pass_complete' && lastPlay.yardsGained > 20) {
      return { name: lastPlay.receiver?.name ?? null, number: null };
    }
    if (lastPlay.type === 'run' && lastPlay.yardsGained > 15) {
      return { name: lastPlay.rusher?.name ?? null, number: null };
    }
    return { name: null, number: null };
  }, [lastPlay]);

  // ── Possessing team data ──────────────────────────────

  const possessingTeam = possession === 'home' ? homeTeam : awayTeam;
  const isRedZone = ballPosition >= 80;
  const isGoalLine = ballPosition >= 95;

  const showDriveTrail = !isKickoff && !isPatAttempt && gameStatus === 'live';

  // ── PlayScene animation state ──────────────────────────
  const [isPlayAnimating, setIsPlayAnimating] = useState(false);
  const handlePlayAnimating = useCallback((animating: boolean) => {
    setIsPlayAnimating(animating);
  }, []);

  const opposingTeam = possession === 'home' ? awayTeam : homeTeam;

  // ── Ball vertical position variety ─────────────────────
  const ballTopPercent = useMemo(() => {
    if (!lastPlay) return 50;
    switch (lastPlay.type) {
      case 'run':
        // Run plays vary the ball position slightly
        return 45 + (lastPlay.yardsGained % 7) * 2; // 45-57%
      case 'pass_complete':
      case 'pass_incomplete':
        // Pass plays: QB drops back then throws downfield
        return 42 + (Math.abs(lastPlay.yardsGained) % 5) * 3; // 42-54%
      case 'sack':
        return 55; // QB pushed back
      case 'scramble':
        return 40 + (lastPlay.yardsGained % 6) * 3; // 40-55%
      case 'kickoff':
      case 'punt':
      case 'field_goal':
      case 'extra_point':
      case 'touchback':
        return 50; // Centered for kicks
      default:
        return 50;
    }
  }, [lastPlay]);

  return (
    <div className="w-full px-2 py-2">
      <div
        className="field-container relative w-full h-[240px] sm:h-[320px] lg:h-[400px] xl:h-[440px] rounded-xl overflow-hidden border border-white/10"
        role="img"
        aria-label={`Football field. Ball at the ${ballPosition} yard line. ${down}${
          down === 1 ? 'st' : down === 2 ? 'nd' : down === 3 ? 'rd' : 'th'
        } and ${yardsToGo}.`}
      >
        {/* Perspective wrapper for 3D depth effect */}
        <div className="field-perspective absolute inset-0">
          {/* SVG field surface (grass, lines, end zones) */}
          <FieldSurface homeTeam={homeTeam} awayTeam={awayTeam} possession={possession} />

          {/* Down & distance overlay (yellow zone, LOS, first-down line) */}
          <div className="absolute inset-0">
            <DownDistanceOverlay
              ballLeftPercent={ballLeft}
              firstDownLeftPercent={firstDownLeft}
              down={down}
              yardsToGo={yardsToGo}
              isRedZone={isRedZone}
              isGoalLine={isGoalLine}
              possession={possession}
            />
          </div>

          {/* Drive trail */}
          <div className="absolute inset-0">
            <DriveTrail
              driveStartPercent={driveStartLeft}
              ballPercent={ballLeft}
              teamColor={possessingTeam.primaryColor}
              visible={showDriveTrail}
            />
          </div>

          {/* Ball marker (hides during PlayScene animation) */}
          <BallMarker
            leftPercent={ballLeft}
            topPercent={ballTopPercent}
            direction={ballDirection}
            isKicking={!!isKicking}
            hidden={isPlayAnimating}
          />

          {/* Play scene: player formations + animated ball trajectory */}
          <PlayScene
            ballLeftPercent={ballLeft}
            prevBallLeftPercent={prevBallLeft}
            possession={possession}
            offenseColor={possessingTeam.primaryColor}
            defenseColor={opposingTeam.primaryColor}
            lastPlay={lastPlay}
            playKey={playKey}
            onAnimating={handlePlayAnimating}
          />

          {/* Player name highlight */}
          <PlayerHighlight
            playerName={highlightPlayer.name}
            jerseyNumber={highlightPlayer.number}
            teamColor={possessingTeam.primaryColor}
            ballPercent={ballLeft}
            highlightKey={highlightKey}
          />
        </div>

        {/* Coin flip overlay — the toss winner receives, so it's the opposite of the kicking team */}
        <CoinFlip
          show={showCoinFlip}
          winningTeam={possession === 'home' ? awayTeam.abbreviation : homeTeam.abbreviation}
          onComplete={handleCoinFlipComplete}
        />

        {/* Celebration overlay (TD confetti, turnover shake, etc.) */}
        <CelebrationOverlay
          type={celebType}
          teamColor={possessingTeam.primaryColor}
          celebKey={celebKey}
        />
      </div>
    </div>
  );
}
