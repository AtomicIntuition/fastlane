'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { PlayResult } from '@/lib/simulation/types';
import { canFlipLogo } from '@/lib/utils/team-logos';
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
  KICKOFF_PHASE_END,
  getKickoffDevMs,
  PUNT_PRE_SNAP_MS,
  PUNT_SNAP_MS,
  PUNT_RESULT_MS,
  PUNT_POST_PLAY_MS,
  getPuntDevMs,
} from './play-timing';
import type { Phase } from './play-timing';
import { yardsToPercent } from './yard-grid';

// Extracted modules
import {
  calculateBallPosition,
  calculateQBPosition,
  calculateSimpleBallX,
  isSplitPlay,
  showTravelingBall,
  getKickoffLandingX,
} from './play-animation-math';
import {
  BALL_SIZE,
  clamp,
  isFailedPlay,
  LogoImg,
  ImpactBurst,
  TurnoverShock,
  TouchdownBurst,
  SpiralLines,
  KickAltitudeGhost,
  DecorativeArc,
  OutcomeMarker,
} from './play-effects';
import { KickoffScene } from './kickoff-scene';
import { PuntScene } from './punt-scene';

// Re-export Phase for consumers
export type { Phase };
// Re-export timing constants for PlayersOverlay compatibility
export {
  PRE_SNAP_MS,
  SNAP_MS,
  DEVELOPMENT_MS,
  RESULT_MS,
  POST_PLAY_MS,
  KICKOFF_PHASE_END,
  getKickoffDevMs,
};

interface PlaySceneProps {
  ballLeftPercent: number;
  prevBallLeftPercent: number;
  possession: 'home' | 'away';
  offenseColor: string;
  defenseColor: string;
  lastPlay: PlayResult | null;
  playKey: number;
  onAnimating: (animating: boolean) => void;
  onPhaseChange?: (phase: Phase) => void;
  teamAbbreviation: string;
  opposingTeamAbbreviation: string;
  teamColor: string;
  teamSecondaryColor: string;
  isKickoff: boolean;
  isPatAttempt: boolean;
}

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════

export function PlayScene({
  ballLeftPercent,
  prevBallLeftPercent,
  possession,
  offenseColor,
  defenseColor,
  lastPlay,
  playKey,
  onAnimating,
  onPhaseChange,
  teamAbbreviation,
  opposingTeamAbbreviation,
  teamColor,
  teamSecondaryColor,
  isKickoff,
  isPatAttempt,
}: PlaySceneProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const prevKeyRef = useRef(playKey);
  const animFrameRef = useRef(0);
  const [animProgress, setAnimProgress] = useState(0);
  const [ballX, setBallX] = useState(ballLeftPercent);
  const [qbX, setQbX] = useState(ballLeftPercent);

  const fromToRef = useRef({ from: prevBallLeftPercent, to: ballLeftPercent });

  const onPhaseChangeRef = useRef(onPhaseChange);
  onPhaseChangeRef.current = onPhaseChange;

  const updatePhase = useCallback((newPhase: Phase) => {
    setPhase(newPhase);
    onPhaseChangeRef.current?.(newPhase);
  }, []);

  // ── Detect new play -> start animation ──────────────────────
  const onAnimatingRef = useRef(onAnimating);
  onAnimatingRef.current = onAnimating;

  useEffect(() => {
    if (playKey === prevKeyRef.current || !lastPlay) return;
    prevKeyRef.current = playKey;

    if (
      lastPlay.type === 'kneel' || lastPlay.type === 'spike' ||
      lastPlay.type === 'pregame' || lastPlay.type === 'coin_toss'
    ) return;

    // Compute correct origin for kick plays
    let fromX: number;
    if (lastPlay.type === 'extra_point') {
      const goalPostX = possession === 'away' ? 91.66 : 8.33;
      fromX = goalPostX + (goalPostX < 50 ? 12.5 : -12.5);
    } else {
      fromX = prevBallLeftPercent;
    }
    const toX = ballLeftPercent;
    fromToRef.current = { from: fromX, to: toX };

    // Use play-type-specific timing
    const isKickoffPlay = lastPlay.type === 'kickoff';
    const isPuntPlay = lastPlay.type === 'punt';
    const preMs = isKickoffPlay ? KICKOFF_PRE_SNAP_MS : isPuntPlay ? PUNT_PRE_SNAP_MS : PRE_SNAP_MS;
    const snapMs = isKickoffPlay ? KICKOFF_SNAP_MS : isPuntPlay ? PUNT_SNAP_MS : SNAP_MS;
    const devMs = isKickoffPlay ? getKickoffDevMs(lastPlay) : isPuntPlay ? getPuntDevMs(lastPlay) : DEVELOPMENT_MS;
    const resMs = isKickoffPlay ? KICKOFF_RESULT_MS : isPuntPlay ? PUNT_RESULT_MS : RESULT_MS;
    const postMs = isKickoffPlay ? KICKOFF_POST_PLAY_MS : isPuntPlay ? PUNT_POST_PLAY_MS : POST_PLAY_MS;
    const totalMs = preMs + snapMs + devMs + resMs + postMs;

    onAnimatingRef.current(true);
    updatePhase('pre_snap');
    setBallX(fromX);
    setQbX(fromX);
    setAnimProgress(0);

    const t1 = setTimeout(() => updatePhase('snap'), preMs);
    const t2 = setTimeout(() => {
      updatePhase('development');
      startRaf(fromX, toX, lastPlay, devMs);
    }, preMs + snapMs);
    const t3 = setTimeout(() => {
      updatePhase('result');
      cancelAnimationFrame(animFrameRef.current);
      if (isSplitPlay(lastPlay.type)) {
        setBallX(calculateBallPosition(lastPlay, fromX, toX, 1, possession));
        setQbX(calculateQBPosition(lastPlay, fromX, toX, 1, possession));
      } else {
        setBallX(toX);
        setQbX(toX);
      }
      setAnimProgress(1);
    }, preMs + snapMs + devMs);
    const t4 = setTimeout(() => updatePhase('post_play'), preMs + snapMs + devMs + resMs);
    const t5 = setTimeout(() => {
      updatePhase('idle');
      onAnimatingRef.current(false);
    }, totalMs);

    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      clearTimeout(t4); clearTimeout(t5);
      cancelAnimationFrame(animFrameRef.current);
      onAnimatingRef.current(false);
    };
  }, [playKey, lastPlay, prevBallLeftPercent, ballLeftPercent, updatePhase, possession]);

  // ── RAF loop ───────────────────────────────────────────────
  function startRaf(fromX: number, toX: number, play: PlayResult, durationMs: number) {
    const split = isSplitPlay(play.type);
    const startTime = performance.now();
    function tick(now: number) {
      const t = Math.min((now - startTime) / durationMs, 1);
      setAnimProgress(t);
      if (split) {
        setBallX(calculateBallPosition(play, fromX, toX, t, possession));
        setQbX(calculateQBPosition(play, fromX, toX, t, possession));
      } else {
        const x = calculateSimpleBallX(play, fromX, toX, t, possession);
        setBallX(x);
        setQbX(x);
      }
      if (t < 1) animFrameRef.current = requestAnimationFrame(tick);
    }
    animFrameRef.current = requestAnimationFrame(tick);
  }

  // ── Determine which team logo to show ──────────────────────
  // After a turnover, swap the logo. For kickoffs, show kicking team.
  const isPostTurnover = lastPlay?.turnover != null;
  const activeLogo = isPostTurnover ? opposingTeamAbbreviation : teamAbbreviation;
  const activeColor = isPostTurnover ? defenseColor : teamColor;

  // Home team logos face left (toward opponent) — flip when home has the ball,
  // but only if the team's logo doesn't contain text/letters.
  const wantsFlip = (possession === 'home' && !isPostTurnover) || (possession === 'away' && isPostTurnover);
  const flipLogo = wantsFlip && canFlipLogo(activeLogo);

  // ── Determine visual effects for current play ──────────────
  const playType = lastPlay?.type ?? null;
  const isPlaying = phase !== 'idle';
  const inDev = phase === 'development';
  const inResult = phase === 'result' || phase === 'post_play';

  const isRun = playType === 'run' || playType === 'scramble' || playType === 'two_point';
  const isPass = playType === 'pass_complete' || playType === 'pass_incomplete';
  const isSack = playType === 'sack';
  const isKick = playType === 'punt' || playType === 'kickoff' || playType === 'field_goal' || playType === 'extra_point';
  const isTurnover = lastPlay?.turnover != null;
  const isTD = lastPlay?.isTouchdown ?? false;
  const isBigPlay = (lastPlay?.yardsGained ?? 0) > 20 || isTD;
  const isDeepPass = isPass && (lastPlay?.yardsGained ?? 0) > 20;

  // ── Logo Ball is ALWAYS visible ────────────────────────────
  // During idle: shows at ball position with gentle breathe animation
  // During play: QB logo follows qbX, traveling ball follows ballX

  const displayQbX = isPlaying ? qbX : ballLeftPercent;
  const displayBallX = isPlaying ? ballX : ballLeftPercent;
  const isKickoffPlay = playType === 'kickoff';
  const split = isSplitPlay(playType ?? undefined);
  const showBallDot = isPlaying && split && (inDev || inResult) && showTravelingBall(playType ?? undefined, animProgress, lastPlay);

  // ── Kickoff scene data ──────────────────────────────────────
  // IMPORTANT: gameState is captured AFTER the kickoff is resolved, so
  // possession is already flipped to the RECEIVING team by the time we see it.
  // Therefore: teamAbbreviation = receiver, opposingTeamAbbreviation = kicker.
  // The kicking team is the OPPOSITE of current possession.
  const kickingTeam = possession === 'home' ? 'away' : 'home';
  const kickoffLandingX = (isKickoffPlay && lastPlay)
    ? getKickoffLandingX(lastPlay, fromToRef.current.from, kickingTeam)
    : 0;
  const kickoffIsTouchback = isKickoffPlay && (lastPlay?.yardsGained === 0);
  // Home kicks right-to-left (faces right, no flip), Away kicks left-to-right (faces left, flip)
  // Skip flip for teams with text/letter logos.
  const kickerFlip = kickingTeam === 'away' && canFlipLogo(opposingTeamAbbreviation);
  const receiverFlip = possession === 'away' && canFlipLogo(teamAbbreviation);

  // ── Punt scene data ───────────────────────────────────────
  // Same as kickoff: possession has already flipped to the receiving team.
  // opposingTeamAbbreviation = punting team, teamAbbreviation = receiving team.
  const isPuntPlay = playType === 'punt';
  const puntingTeam = possession === 'home' ? 'away' : 'home';
  const punterFlip = puntingTeam === 'away' && canFlipLogo(opposingTeamAbbreviation);
  const puntReceiverFlip = possession === 'away' && canFlipLogo(teamAbbreviation);
  const puntIsTouchback = isPuntPlay && (lastPlay?.yardsGained === 0);
  const puntIsFairCatch = isPuntPlay && (lastPlay?.description || '').toLowerCase().includes('fair catch');

  return (
    <div className="absolute inset-0 pointer-events-none z-[15] overflow-hidden">
      {/* --- Speed Trail (runs/scrambles) --- */}
      {isPlaying && inDev && isRun && animProgress > 0.1 && (
        <>
          {[0.06, 0.12, 0.18, 0.24, 0.30, 0.36].map((offset, i) => {
            const trailT = Math.max(0, animProgress - offset);
            const trailX = calculateBallPosition(lastPlay!, fromToRef.current.from, fromToRef.current.to, trailT, possession);
            return (
              <div
                key={i}
                className="absolute rounded-full"
                style={{
                  left: `${clamp(trailX, 2, 98)}%`,
                  top: '50%',
                  width: BALL_SIZE * (0.6 - i * 0.08),
                  height: BALL_SIZE * (0.6 - i * 0.08),
                  transform: 'translate(-50%, -50%)',
                  backgroundColor: activeColor,
                  opacity: 0.35 - i * 0.05,
                  borderRadius: '50%',
                  animation: 'speed-trail-fade 0.4s ease-out forwards',
                }}
              />
            );
          })}
        </>
      )}

      {/* --- Decorative Pass/Kick Arc (SVG) --- */}
      {isPlaying && (inDev || inResult) && (isPass || isKick) && (
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full"
        >
          <DecorativeArc
            fromX={fromToRef.current.from}
            toX={fromToRef.current.to}
            playType={playType!}
            isSuccess={!isFailedPlay(lastPlay!)}
            progress={animProgress}
          />
        </svg>
      )}

      {/* --- Impact Burst (sacks, TFL) --- */}
      {isPlaying && inResult && isSack && (
        <ImpactBurst x={fromToRef.current.to} />
      )}

      {/* --- Turnover Shock Rings --- */}
      {isPlaying && inResult && isTurnover && (
        <TurnoverShock x={fromToRef.current.to} />
      )}

      {/* --- Touchdown Burst --- */}
      {isPlaying && inResult && isTD && (
        <TouchdownBurst x={fromToRef.current.to} teamColor={activeColor} />
      )}

      {/* --- Deep Pass Spiral Lines --- */}
      {isPlaying && inDev && isDeepPass && animProgress > 0.3 && (
        <SpiralLines x={displayBallX} />
      )}

      {/* --- Kick Altitude Ghost (FG/XP only, not kickoff/punt) --- */}
      {isPlaying && inDev && isKick && !isKickoffPlay && !isPuntPlay && (
        <KickAltitudeGhost
          x={displayBallX}
          progress={animProgress}
          abbrev={activeLogo}
          borderColor={activeColor}
          flipLogo={flipLogo}
        />
      )}

      {/* --- Kickoff Scene (two-logo cinematic) --- */}
      {/* Note: possession is already flipped to receiver, so opposingTeam = kicker */}
      {isKickoffPlay && isPlaying && lastPlay && (
        <KickoffScene
          kickerAbbrev={opposingTeamAbbreviation}
          kickerColor={defenseColor}
          receiverAbbrev={teamAbbreviation}
          receiverColor={teamColor}
          fromX={fromToRef.current.from}
          toX={fromToRef.current.to}
          landingX={kickoffLandingX}
          animProgress={animProgress}
          phase={phase}
          isTouchback={kickoffIsTouchback}
          isTD={isTD}
          playKey={playKey}
          flipKicker={kickerFlip}
          flipReceiver={receiverFlip}
        />
      )}

      {/* --- Punt Scene (two-logo, punter + returner) --- */}
      {isPuntPlay && isPlaying && lastPlay && (
        <PuntScene
          punterAbbrev={opposingTeamAbbreviation}
          punterColor={defenseColor}
          receiverAbbrev={teamAbbreviation}
          receiverColor={teamColor}
          fromX={fromToRef.current.from}
          toX={fromToRef.current.to}
          animProgress={animProgress}
          phase={phase}
          isTouchback={puntIsTouchback}
          isFairCatch={puntIsFairCatch}
          isTD={isTD}
          playKey={playKey}
          flipPunter={punterFlip}
          flipReceiver={puntReceiverFlip}
        />
      )}

      {/* --- Scrimmage Travel Line --- */}
      {isPlaying && (inDev || inResult) && !isKickoffPlay && !isPuntPlay && split && (
        (() => {
          const from = fromToRef.current.from;
          const to = fromToRef.current.to;
          const lineLeft = Math.min(from, to);
          const lineWidth = Math.abs(to - from);
          return (
            <div
              style={{
                position: 'absolute',
                left: `${lineLeft}%`,
                width: `${lineWidth}%`,
                top: '50%',
                height: 0,
                borderTop: '1.5px dashed rgba(255, 255, 255, 0.12)',
                zIndex: 10,
                pointerEvents: 'none',
              }}
            />
          );
        })()
      )}

      {/* --- Traveling Ball (football emoji, separates from QB) --- */}
      {showBallDot && (
        <div
          style={{
            position: 'absolute',
            left: `${clamp(displayBallX, 2, 98)}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 21,
            pointerEvents: 'none',
            fontSize: 16,
            lineHeight: 1,
            filter: 'drop-shadow(0 0 6px rgba(212, 175, 55, 0.5))',
          }}
        >
          {'\u{1F3C8}'}
        </div>
      )}

      {/* --- Logo Ball (hidden during kickoff/punt animation) --- */}
      {!(isKickoffPlay && isPlaying) && !(isPuntPlay && isPlaying) && (
        <div
          className={!isPlaying ? 'logo-ball-breathe' : ''}
          style={{
            position: 'absolute',
            left: `${clamp(displayQbX, 2, 98)}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 20,
            transition: !isPlaying
              ? 'left 600ms cubic-bezier(0.34, 1.56, 0.64, 1)'
              : undefined,
          }}
        >
          {/* Big play glow ring */}
          {isPlaying && isBigPlay && inDev && (
            <div
              className="absolute rounded-full"
              style={{
                width: BALL_SIZE + 20,
                height: BALL_SIZE + 20,
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                animation: 'big-play-glow 0.8s ease-in-out infinite',
                boxShadow: `0 0 20px ${isTD ? '#22c55e' : '#d4af37'}, 0 0 40px ${isTD ? '#22c55e50' : '#d4af3750'}`,
                borderRadius: '50%',
              }}
            />
          )}

          {/* Outer glow */}
          <div
            className="absolute rounded-full"
            style={{
              width: BALL_SIZE + 10,
              height: BALL_SIZE + 10,
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: `radial-gradient(circle, ${activeColor}40 0%, transparent 70%)`,
              opacity: isPlaying ? 0.8 : 0.5,
            }}
          />

          {/* Main ball circle with logo */}
          <div
            style={{
              width: BALL_SIZE,
              height: BALL_SIZE,
              borderRadius: '50%',
              border: `3px solid ${activeColor}`,
              backgroundColor: '#111827',
              boxShadow: `0 0 12px ${activeColor}60, 0 2px 8px rgba(0,0,0,0.8)`,
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <LogoImg
              abbrev={activeLogo}
              size={BALL_SIZE - 10}
              flip={flipLogo}
            />
          </div>
        </div>
      )}

      {/* --- Outcome markers --- */}
      {isPlaying && inResult && lastPlay && (
        <OutcomeMarker
          lastPlay={lastPlay}
          fromX={fromToRef.current.from}
          toX={fromToRef.current.to}
          possession={possession}
        />
      )}
    </div>
  );
}
