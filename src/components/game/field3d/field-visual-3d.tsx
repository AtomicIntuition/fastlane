'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import type { PlayResult, NarrativeSnapshot } from '@/lib/simulation/types';
import { CoinFlip } from '../field/coin-flip';
import { CelebrationOverlay } from '../field/celebration-overlay';
import { PlayCallOverlay } from '../field/play-call-overlay';
import { CrowdAtmosphere } from '../field/crowd-atmosphere';
import { FieldCommentaryOverlay } from '../field/field-commentary-overlay';
import { KickoffIntroOverlay } from '../field/kickoff-intro-overlay';
import { Minimap } from '../field/minimap';
import type { Phase } from '@/lib/animation/play-animation';
import {
  PRE_SNAP_MS,
  SNAP_MS,
  DEVELOPMENT_MS,
  RESULT_MS,
  POST_PLAY_MS,
  KICKOFF_PRE_SNAP_MS,
  KICKOFF_SNAP_MS,
  KICKOFF_RESULT_MS,
  KICKOFF_POST_PLAY_MS,
  getKickoffDevMs,
} from '@/lib/animation/play-animation';

// Dynamically import Canvas scene to avoid SSR issues with Three.js
const FieldScene = dynamic(() => import('./field-scene').then(m => ({ default: m.FieldScene })), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-[#1a2e1a] rounded-xl flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-gold/30 border-t-gold animate-spin" />
    </div>
  ),
});

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
  commentary?: { playByPlay: string; crowdReaction: string; excitement: number } | null;
}

/**
 * 3D Field Visual — orchestrator component.
 * Renders the Three.js Canvas scene with all 3D elements,
 * plus HTML overlays positioned absolutely over the canvas.
 * Drop-in replacement for FieldVisual with identical props.
 */
export function FieldVisual3D({
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
  narrativeContext,
  commentary,
}: FieldVisualProps) {
  // ── Coordinate conversion (same as original FieldVisual) ────

  const toAbsolutePercent = (pos: number, team: 'home' | 'away'): number => {
    return team === 'home' ? 100 - pos : pos;
  };

  let absoluteBallPct = toAbsolutePercent(ballPosition, possession);
  if (lastPlay?.isTouchdown && lastPlay?.scoring) {
    absoluteBallPct = lastPlay.scoring.team === 'home' ? 0 : 100;
  }

  const absoluteFirstDownPct = toAbsolutePercent(Math.min(firstDownLine, 100), possession);
  const absoluteDriveStartPct = toAbsolutePercent(driveStartPosition, possession);

  const endZoneWidth = 8.33;
  const fieldStart = endZoneWidth;
  const fieldWidth = 100 - endZoneWidth * 2;

  let ballLeft = fieldStart + (absoluteBallPct / 100) * fieldWidth;
  if (lastPlay?.isTouchdown) {
    if (absoluteBallPct >= 95) ballLeft = 96;
    else if (absoluteBallPct <= 5) ballLeft = 4;
  }

  const firstDownLeft = fieldStart + (absoluteFirstDownPct / 100) * fieldWidth;
  const driveStartLeft = fieldStart + (absoluteDriveStartPct / 100) * fieldWidth;

  // ── Play tracking ──────────────────────────────────────────

  const [playKey, setPlayKey] = useState(0);
  const [celebKey, setCelebKey] = useState(0);
  const prevPlayRef = useRef<PlayResult | null>(null);
  const [prevBallLeft, setPrevBallLeft] = useState(ballLeft);
  const [playPhase, setPlayPhase] = useState<Phase>('idle');
  const [isPlayAnimating, setIsPlayAnimating] = useState(false);

  useEffect(() => {
    setPrevBallLeft(ballLeft);
  }, [ballLeft]);

  // Detect new play
  useEffect(() => {
    if (!lastPlay || lastPlay === prevPlayRef.current) return;
    prevPlayRef.current = lastPlay;
    setPlayKey((k) => k + 1);

    if (lastPlay.isTouchdown || lastPlay.turnover || lastPlay.isSafety ||
        (lastPlay.type === 'field_goal' && lastPlay.scoring)) {
      setCelebKey((k) => k + 1);
    }
  }, [lastPlay]);

  // ── Phase state machine ────────────────────────────────────

  useEffect(() => {
    if (!lastPlay || playKey === 0) return;

    if (lastPlay.type === 'kneel' || lastPlay.type === 'spike' ||
        lastPlay.type === 'pregame' || lastPlay.type === 'coin_toss') return;

    const isKickoffPlay = lastPlay.type === 'kickoff';
    const preMs = isKickoffPlay ? KICKOFF_PRE_SNAP_MS : PRE_SNAP_MS;
    const snapMs = isKickoffPlay ? KICKOFF_SNAP_MS : SNAP_MS;
    const devMs = isKickoffPlay ? getKickoffDevMs(lastPlay) : DEVELOPMENT_MS;
    const resMs = isKickoffPlay ? KICKOFF_RESULT_MS : RESULT_MS;
    const postMs = isKickoffPlay ? KICKOFF_POST_PLAY_MS : POST_PLAY_MS;
    const totalMs = preMs + snapMs + devMs + resMs + postMs;

    setIsPlayAnimating(true);
    setPlayPhase('pre_snap');

    const t1 = setTimeout(() => setPlayPhase('snap'), preMs);
    const t2 = setTimeout(() => setPlayPhase('development'), preMs + snapMs);
    const t3 = setTimeout(() => setPlayPhase('result'), preMs + snapMs + devMs);
    const t4 = setTimeout(() => setPlayPhase('post_play'), preMs + snapMs + devMs + resMs);
    const t5 = setTimeout(() => {
      setPlayPhase('idle');
      setIsPlayAnimating(false);
    }, totalMs);

    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      clearTimeout(t4); clearTimeout(t5);
      setIsPlayAnimating(false);
    };
  }, [playKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Celebration type ──────────────────────────────────────

  const celebType = useMemo(() => {
    if (!lastPlay) return null;
    if (lastPlay.isTouchdown) return 'touchdown' as const;
    if (lastPlay.turnover) return 'turnover' as const;
    if (lastPlay.isSafety) return 'safety' as const;
    if (lastPlay.type === 'field_goal' && lastPlay.scoring) return 'field_goal' as const;
    return null;
  }, [lastPlay]);

  // ── Coin flip state ───────────────────────────────────────

  const [showCoinFlip, setShowCoinFlip] = useState(false);
  const coinFlipShownRef = useRef(false);
  const [showKickoffIntro, setShowKickoffIntro] = useState(false);
  const kickoffIntroShownRef = useRef(false);

  useEffect(() => {
    if (lastPlay?.type === 'coin_toss' && !coinFlipShownRef.current) {
      setShowCoinFlip(true);
      coinFlipShownRef.current = true;
    }
  }, [lastPlay]);

  const handleCoinFlipComplete = useCallback(() => {
    setShowCoinFlip(false);
    if (!kickoffIntroShownRef.current) {
      kickoffIntroShownRef.current = true;
      setTimeout(() => setShowKickoffIntro(true), 500);
    }
  }, []);

  const handleKickoffIntroComplete = useCallback(() => {
    setShowKickoffIntro(false);
  }, []);

  // ── Possessing team data ──────────────────────────────────

  const possessingTeam = possession === 'home' ? homeTeam : awayTeam;
  const opposingTeam = possession === 'home' ? awayTeam : homeTeam;
  const showDriveTrail = !isKickoff && !isPatAttempt && gameStatus === 'live';

  return (
    <div className="w-full h-full px-1.5 py-1">
      <div
        className="field-container relative w-full h-full rounded-xl overflow-hidden border border-white/10"
        role="img"
        aria-label={`Football field. Ball at the ${ballPosition} yard line. ${down}${
          down === 1 ? 'st' : down === 2 ? 'nd' : down === 3 ? 'rd' : 'th'
        } and ${yardsToGo}.`}
      >
        {/* Three.js Canvas scene */}
        <FieldScene
          ballLeft={ballLeft}
          prevBallLeft={prevBallLeft}
          firstDownLeft={firstDownLeft}
          driveStartLeft={driveStartLeft}
          possession={possession}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          offenseColor={possessingTeam.primaryColor}
          defenseColor={opposingTeam.primaryColor}
          lastPlay={lastPlay}
          playKey={playKey}
          phase={playPhase}
          isPlayAnimating={isPlayAnimating}
          showDriveTrail={showDriveTrail}
          isKickoff={isKickoff}
        />

        {/* HTML Overlays (positioned over canvas) */}
        <PlayCallOverlay
          formation={lastPlay?.formation ?? null}
          defensiveCall={lastPlay?.defensiveCall ?? null}
          playCall={lastPlay?.call ?? null}
          visible={playPhase === 'pre_snap'}
        />

        <CrowdAtmosphere
          crowdReaction={commentary?.crowdReaction ?? null}
          excitement={commentary?.excitement ?? 0}
        />

        <FieldCommentaryOverlay
          text={commentary?.playByPlay ?? null}
          lastPlay={lastPlay}
        />

        <CoinFlip
          show={showCoinFlip}
          winningTeam={possession === 'home' ? awayTeam.abbreviation : homeTeam.abbreviation}
          onComplete={handleCoinFlipComplete}
        />

        <KickoffIntroOverlay
          show={showKickoffIntro}
          awayTeam={awayTeam}
          homeTeam={homeTeam}
          onComplete={handleKickoffIntroComplete}
        />

        <CelebrationOverlay
          type={celebType}
          teamColor={possessingTeam.primaryColor}
          celebKey={celebKey}
        />
      </div>
    </div>
  );
}
