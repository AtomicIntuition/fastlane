'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import type { PlayResult, PlayType } from '@/lib/simulation/types';

interface PlaySceneProps {
  /** Final ball position (field CSS %) */
  ballLeftPercent: number;
  /** Ball position before this play (field CSS %) */
  prevBallLeftPercent: number;
  /** Which team has the ball */
  possession: 'home' | 'away';
  /** Offense team primary color */
  offenseColor: string;
  /** Defense team primary color */
  defenseColor: string;
  /** The last play result */
  lastPlay: PlayResult | null;
  /** Unique key that increments on each new play */
  playKey: number;
  /** Callback: true when animation is running, false when done */
  onAnimating: (animating: boolean) => void;
}

// ── Timing ──────────────────────────────────────────────────
const FORMATION_MS = 350;   // Dots appear
const ANIMATE_MS = 1400;    // Ball moves
const SETTLE_MS = 600;      // Outcome marker shows
const FADE_MS = 350;        // Everything fades
const TOTAL_MS = FORMATION_MS + ANIMATE_MS + SETTLE_MS + FADE_MS;

type Phase = 'idle' | 'formation' | 'animate' | 'settle' | 'fade';

// ── Easing helpers ──────────────────────────────────────────
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// ── Main component ──────────────────────────────────────────
export function PlayScene({
  ballLeftPercent,
  prevBallLeftPercent,
  possession,
  offenseColor,
  defenseColor,
  lastPlay,
  playKey,
  onAnimating,
}: PlaySceneProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const prevKeyRef = useRef(playKey);
  const animFrameRef = useRef(0);
  const [animProgress, setAnimProgress] = useState(0);
  const [ballPos, setBallPos] = useState({ x: 0, y: 50 });

  // Capture from/to at the moment we detect a new play
  const fromToRef = useRef({ from: prevBallLeftPercent, to: ballLeftPercent });

  // ── Formation dots ──────────────────────────────────────
  const formation = useMemo(() => {
    const losX = fromToRef.current.from;
    const playType = lastPlay?.type ?? null;
    return getFormationDots(losX, possession, playType);
  }, [possession, lastPlay, playKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Detect new play → start animation ───────────────────
  const onAnimatingRef = useRef(onAnimating);
  onAnimatingRef.current = onAnimating;

  useEffect(() => {
    if (playKey === prevKeyRef.current || !lastPlay) return;
    prevKeyRef.current = playKey;

    // Skip non-visual plays
    if (
      lastPlay.type === 'kneel' ||
      lastPlay.type === 'spike' ||
      lastPlay.type === 'pregame' ||
      lastPlay.type === 'coin_toss'
    ) {
      return;
    }

    // Capture positions right now
    fromToRef.current = { from: prevBallLeftPercent, to: ballLeftPercent };
    const fromX = prevBallLeftPercent;
    const toX = ballLeftPercent;

    onAnimatingRef.current(true);
    setPhase('formation');
    setBallPos({ x: fromX, y: 50 });
    setAnimProgress(0);

    // Phase timers
    const t1 = setTimeout(() => {
      setPhase('animate');
      startRaf(fromX, toX, lastPlay);
    }, FORMATION_MS);

    const t2 = setTimeout(() => {
      setPhase('settle');
      cancelAnimationFrame(animFrameRef.current);
      setBallPos({ x: toX, y: 50 });
      setAnimProgress(1);
    }, FORMATION_MS + ANIMATE_MS);

    const t3 = setTimeout(() => setPhase('fade'), FORMATION_MS + ANIMATE_MS + SETTLE_MS);

    const t4 = setTimeout(() => {
      setPhase('idle');
      onAnimatingRef.current(false);
    }, TOTAL_MS);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      cancelAnimationFrame(animFrameRef.current);
      onAnimatingRef.current(false);
    };
  }, [playKey, lastPlay, prevBallLeftPercent, ballLeftPercent]);

  // ── RAF loop ─────────────────────────────────────────────
  function startRaf(fromX: number, toX: number, play: PlayResult) {
    const startTime = performance.now();

    function tick(now: number) {
      const t = Math.min((now - startTime) / ANIMATE_MS, 1);
      setAnimProgress(t);
      const pos = calculateBallPosition(play, fromX, toX, t, possession);
      setBallPos(pos);
      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(tick);
      }
    }

    animFrameRef.current = requestAnimationFrame(tick);
  }

  // ── Render nothing when idle ─────────────────────────────
  if (phase === 'idle' || !lastPlay) return null;

  const fromX = fromToRef.current.from;
  const toX = fromToRef.current.to;
  const playType = lastPlay.type;
  const isSuccess = !isFailedPlay(lastPlay);

  const opacity =
    phase === 'formation' ? 0.85 :
    phase === 'animate' ? 1 :
    phase === 'settle' ? 0.9 :
    0;

  return (
    <div
      className="absolute inset-0 pointer-events-none z-10 overflow-hidden"
      style={{
        opacity,
        transition: phase === 'fade' ? 'opacity 350ms ease-out' : 'opacity 200ms ease-in',
      }}
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="w-full h-full"
      >
        {/* ─── Player formation dots ─── */}
        {formation.map((dot, i) => (
          <circle
            key={i}
            cx={clamp(dot.x, 1, 99)}
            cy={clamp(dot.y, 3, 97)}
            r={dot.role === 'qb' ? 1.4 : 1.1}
            fill={dot.team === 'offense' ? offenseColor : defenseColor}
            opacity={dot.team === 'offense' ? 0.8 : 0.5}
            stroke={dot.team === 'offense' ? 'white' : 'rgba(255,255,255,0.2)'}
            strokeWidth="0.3"
            className="play-scene-dot"
          />
        ))}

        {/* ─── Play trajectory trail ─── */}
        {(phase === 'animate' || phase === 'settle') && (
          <PlayTrajectory
            playType={playType}
            fromX={fromX}
            toX={toX}
            possession={possession}
            progress={animProgress}
            success={isSuccess}
          />
        )}

        {/* ─── Animated ball (brown ellipse following trajectory) ─── */}
        {phase === 'animate' && (
          <g>
            {/* Glow */}
            <ellipse
              cx={clamp(ballPos.x, 2, 98)}
              cy={clamp(ballPos.y, 5, 95)}
              rx="2.5"
              ry="1.8"
              fill="rgba(212, 175, 55, 0.35)"
            />
            {/* Ball body */}
            <ellipse
              cx={clamp(ballPos.x, 2, 98)}
              cy={clamp(ballPos.y, 5, 95)}
              rx="1.6"
              ry="1"
              fill="#8B4513"
              stroke="#5C2D06"
              strokeWidth="0.3"
            />
            {/* Lace */}
            <line
              x1={clamp(ballPos.x, 2, 98) - 0.8}
              y1={clamp(ballPos.y, 5, 95)}
              x2={clamp(ballPos.x, 2, 98) + 0.8}
              y2={clamp(ballPos.y, 5, 95)}
              stroke="white"
              strokeWidth="0.25"
              opacity="0.7"
            />
          </g>
        )}

        {/* ─── Ball carrier dot (highlighted during run/scramble) ─── */}
        {phase === 'animate' &&
          (playType === 'run' || playType === 'scramble' || playType === 'two_point') && (
          <circle
            cx={clamp(ballPos.x, 2, 98)}
            cy={clamp(ballPos.y, 5, 95)}
            r="1.6"
            fill={offenseColor}
            stroke="white"
            strokeWidth="0.4"
            opacity="0.9"
          />
        )}

        {/* ─── Outcome markers ─── */}
        {(phase === 'settle' || phase === 'fade') && (
          <OutcomeMarker
            lastPlay={lastPlay}
            fromX={fromX}
            toX={toX}
            possession={possession}
          />
        )}
      </svg>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// FORMATION GENERATION
// ════════════════════════════════════════════════════════════

interface PlayerDot {
  x: number;
  y: number;
  role: string;
  team: 'offense' | 'defense';
}

function getFormationDots(
  losX: number,
  possession: 'home' | 'away',
  playType: PlayType | null,
): PlayerDot[] {
  // Offense goes toward their scoring end zone
  // 'away' goes right (positive x), so "behind LOS" is negative x offset
  // 'home' goes left (negative x), so "behind LOS" is positive x offset
  const offDir = possession === 'away' ? -1 : 1; // multiplier for "behind LOS"

  if (playType === 'punt') {
    return getPuntFormation(losX, offDir);
  }
  if (playType === 'kickoff') {
    return getKickoffFormation(losX, offDir);
  }
  if (playType === 'field_goal' || playType === 'extra_point') {
    return getFieldGoalFormation(losX, offDir);
  }

  return getStandardFormation(losX, offDir);
}

function getStandardFormation(losX: number, offDir: number): PlayerDot[] {
  const offense: PlayerDot[] = [
    // Offensive Line (5 at the LOS)
    { x: losX, y: 42, role: 'ol', team: 'offense' },
    { x: losX, y: 46, role: 'ol', team: 'offense' },
    { x: losX, y: 50, role: 'ol', team: 'offense' },
    { x: losX, y: 54, role: 'ol', team: 'offense' },
    { x: losX, y: 58, role: 'ol', team: 'offense' },
    // QB (shotgun, 3 units back)
    { x: losX + offDir * 3, y: 50, role: 'qb', team: 'offense' },
    // RB (behind QB)
    { x: losX + offDir * 5, y: 53, role: 'rb', team: 'offense' },
    // TE (just outside OL)
    { x: losX + offDir * 0.3, y: 62, role: 'te', team: 'offense' },
    // Wide Receivers (split wide)
    { x: losX + offDir * 0.5, y: 12, role: 'wr', team: 'offense' },
    { x: losX + offDir * 0.5, y: 88, role: 'wr', team: 'offense' },
    // Slot WR
    { x: losX + offDir * 0.3, y: 28, role: 'slot', team: 'offense' },
  ];

  const defense: PlayerDot[] = [
    // Defensive Line (4)
    { x: losX - offDir * 1.5, y: 44, role: 'dl', team: 'defense' },
    { x: losX - offDir * 1.5, y: 48, role: 'dl', team: 'defense' },
    { x: losX - offDir * 1.5, y: 52, role: 'dl', team: 'defense' },
    { x: losX - offDir * 1.5, y: 56, role: 'dl', team: 'defense' },
    // Linebackers (3)
    { x: losX - offDir * 5, y: 38, role: 'lb', team: 'defense' },
    { x: losX - offDir * 5, y: 50, role: 'lb', team: 'defense' },
    { x: losX - offDir * 5, y: 62, role: 'lb', team: 'defense' },
    // Cornerbacks (2 — covering WRs)
    { x: losX - offDir * 7, y: 14, role: 'cb', team: 'defense' },
    { x: losX - offDir * 7, y: 86, role: 'cb', team: 'defense' },
    // Safeties (2)
    { x: losX - offDir * 14, y: 42, role: 'fs', team: 'defense' },
    { x: losX - offDir * 14, y: 58, role: 'ss', team: 'defense' },
  ];

  return [...offense, ...defense];
}

function getPuntFormation(losX: number, offDir: number): PlayerDot[] {
  const offense: PlayerDot[] = [
    // Punt line (spread across)
    { x: losX, y: 35, role: 'ol', team: 'offense' },
    { x: losX, y: 42, role: 'ol', team: 'offense' },
    { x: losX, y: 48, role: 'ol', team: 'offense' },
    { x: losX, y: 52, role: 'ol', team: 'offense' },
    { x: losX, y: 58, role: 'ol', team: 'offense' },
    { x: losX, y: 65, role: 'ol', team: 'offense' },
    // Wings
    { x: losX + offDir * 1, y: 30, role: 'wing', team: 'offense' },
    { x: losX + offDir * 1, y: 70, role: 'wing', team: 'offense' },
    // Gunners (split wide)
    { x: losX + offDir * 0.5, y: 10, role: 'gunner', team: 'offense' },
    { x: losX + offDir * 0.5, y: 90, role: 'gunner', team: 'offense' },
    // Punter (15 yards back)
    { x: losX + offDir * 12, y: 50, role: 'punter', team: 'offense' },
  ];

  const defense: PlayerDot[] = [
    // Punt rush/return
    { x: losX - offDir * 1, y: 38, role: 'dl', team: 'defense' },
    { x: losX - offDir * 1, y: 45, role: 'dl', team: 'defense' },
    { x: losX - offDir * 1, y: 55, role: 'dl', team: 'defense' },
    { x: losX - offDir * 1, y: 62, role: 'dl', team: 'defense' },
    { x: losX - offDir * 5, y: 35, role: 'lb', team: 'defense' },
    { x: losX - offDir * 5, y: 50, role: 'lb', team: 'defense' },
    { x: losX - offDir * 5, y: 65, role: 'lb', team: 'defense' },
    { x: losX - offDir * 12, y: 30, role: 'cb', team: 'defense' },
    { x: losX - offDir * 12, y: 70, role: 'cb', team: 'defense' },
    { x: losX - offDir * 20, y: 50, role: 'returner', team: 'defense' },
    { x: losX - offDir * 18, y: 40, role: 'ss', team: 'defense' },
  ];

  return [...offense, ...defense];
}

function getKickoffFormation(losX: number, offDir: number): PlayerDot[] {
  const offense: PlayerDot[] = [
    // Kicker
    { x: losX + offDir * 2, y: 50, role: 'kicker', team: 'offense' },
    // Coverage team (spread across)
    { x: losX, y: 10, role: 'cover', team: 'offense' },
    { x: losX, y: 20, role: 'cover', team: 'offense' },
    { x: losX, y: 30, role: 'cover', team: 'offense' },
    { x: losX, y: 38, role: 'cover', team: 'offense' },
    { x: losX, y: 45, role: 'cover', team: 'offense' },
    { x: losX, y: 55, role: 'cover', team: 'offense' },
    { x: losX, y: 62, role: 'cover', team: 'offense' },
    { x: losX, y: 70, role: 'cover', team: 'offense' },
    { x: losX, y: 80, role: 'cover', team: 'offense' },
    { x: losX, y: 90, role: 'cover', team: 'offense' },
  ];

  const defense: PlayerDot[] = [
    // Return team — blockers in a wedge
    { x: losX - offDir * 15, y: 35, role: 'block', team: 'defense' },
    { x: losX - offDir * 15, y: 45, role: 'block', team: 'defense' },
    { x: losX - offDir * 15, y: 55, role: 'block', team: 'defense' },
    { x: losX - offDir * 15, y: 65, role: 'block', team: 'defense' },
    { x: losX - offDir * 18, y: 30, role: 'block', team: 'defense' },
    { x: losX - offDir * 18, y: 42, role: 'block', team: 'defense' },
    { x: losX - offDir * 18, y: 58, role: 'block', team: 'defense' },
    { x: losX - offDir * 18, y: 70, role: 'block', team: 'defense' },
    { x: losX - offDir * 22, y: 40, role: 'block', team: 'defense' },
    { x: losX - offDir * 22, y: 60, role: 'block', team: 'defense' },
    // Returner (deep)
    { x: losX - offDir * 30, y: 50, role: 'returner', team: 'defense' },
  ];

  return [...offense, ...defense];
}

function getFieldGoalFormation(losX: number, offDir: number): PlayerDot[] {
  const offense: PlayerDot[] = [
    // FG line (tight)
    { x: losX, y: 40, role: 'ol', team: 'offense' },
    { x: losX, y: 44, role: 'ol', team: 'offense' },
    { x: losX, y: 48, role: 'ol', team: 'offense' },
    { x: losX, y: 50, role: 'ol', team: 'offense' },
    { x: losX, y: 52, role: 'ol', team: 'offense' },
    { x: losX, y: 56, role: 'ol', team: 'offense' },
    { x: losX, y: 60, role: 'ol', team: 'offense' },
    // Wings
    { x: losX + offDir * 0.5, y: 36, role: 'wing', team: 'offense' },
    { x: losX + offDir * 0.5, y: 64, role: 'wing', team: 'offense' },
    // Holder (7 yards back)
    { x: losX + offDir * 6, y: 50, role: 'holder', team: 'offense' },
    // Kicker (behind holder)
    { x: losX + offDir * 9, y: 50, role: 'kicker', team: 'offense' },
  ];

  const defense: PlayerDot[] = [
    // FG rush
    { x: losX - offDir * 1, y: 40, role: 'dl', team: 'defense' },
    { x: losX - offDir * 1, y: 44, role: 'dl', team: 'defense' },
    { x: losX - offDir * 1, y: 48, role: 'dl', team: 'defense' },
    { x: losX - offDir * 1, y: 52, role: 'dl', team: 'defense' },
    { x: losX - offDir * 1, y: 56, role: 'dl', team: 'defense' },
    { x: losX - offDir * 1, y: 60, role: 'dl', team: 'defense' },
    { x: losX - offDir * 3, y: 35, role: 'lb', team: 'defense' },
    { x: losX - offDir * 3, y: 50, role: 'lb', team: 'defense' },
    { x: losX - offDir * 3, y: 65, role: 'lb', team: 'defense' },
    { x: losX - offDir * 8, y: 30, role: 'cb', team: 'defense' },
    { x: losX - offDir * 8, y: 70, role: 'cb', team: 'defense' },
  ];

  return [...offense, ...defense];
}

// ════════════════════════════════════════════════════════════
// BALL TRAJECTORY CALCULATION
// ════════════════════════════════════════════════════════════

function calculateBallPosition(
  play: PlayResult,
  fromX: number,
  toX: number,
  t: number,
  possession: 'home' | 'away',
): { x: number; y: number } {
  const offDir = possession === 'away' ? -1 : 1;

  switch (play.type) {
    case 'run':
    case 'scramble':
    case 'two_point': {
      // Forward movement with lateral weaving
      const eased = easeOutCubic(t);
      const x = fromX + (toX - fromX) * eased;
      const weaveAmt = play.type === 'scramble' ? 5 : 3;
      const weave = Math.sin(t * Math.PI * 3) * weaveAmt * (1 - t); // weave dampens
      return { x, y: 50 + weave };
    }

    case 'pass_complete': {
      // Phase 1 (0→0.2): QB drops back
      // Phase 2 (0.2→0.85): Ball arcs to receiver
      // Phase 3 (0.85→1): Receiver runs after catch
      if (t < 0.2) {
        const dropT = easeOutCubic(t / 0.2);
        const qbX = fromX + offDir * 3 * dropT;
        return { x: qbX, y: 50 };
      } else if (t < 0.85) {
        const throwT = easeInOutQuad((t - 0.2) / 0.65);
        const qbX = fromX + offDir * 3;
        const dist = Math.abs(toX - qbX);
        const arcHeight = Math.min(dist * 0.5, 25);
        const x = qbX + (toX - qbX) * throwT;
        const y = 50 - arcHeight * Math.sin(throwT * Math.PI);
        // Lateral drift for sideline throws
        const lateral =
          play.yardsGained > 15
            ? Math.sin(throwT * Math.PI * 0.5) * 8
            : Math.sin(throwT * Math.PI * 0.5) * 3;
        return { x, y: y + lateral };
      } else {
        // Ball at receiver, slight YAC movement
        const yacT = easeOutCubic((t - 0.85) / 0.15);
        const yacExtra = (toX - fromX) * 0.05 * yacT; // tiny extra yards
        return { x: toX + yacExtra * 0, y: 50 }; // settle to center
      }
    }

    case 'pass_incomplete': {
      // Phase 1 (0→0.2): QB drops back
      // Phase 2 (0.2→0.7): Ball arcs toward target
      // Phase 3 (0.7→1): Ball falls incomplete
      if (t < 0.2) {
        const dropT = easeOutCubic(t / 0.2);
        return { x: fromX + offDir * 3 * dropT, y: 50 };
      } else if (t < 0.7) {
        const throwT = (t - 0.2) / 0.5;
        const qbX = fromX + offDir * 3;
        // Aim toward where the pass was going (use a projected target)
        const targetX = fromX - offDir * 12; // ~12 yards downfield
        const dist = Math.abs(targetX - qbX);
        const arcHeight = Math.min(dist * 0.4, 18);
        const x = qbX + (targetX - qbX) * easeInOutQuad(throwT);
        const y = 50 - arcHeight * Math.sin(throwT * Math.PI);
        return { x, y };
      } else {
        // Ball drops to the ground
        const dropT = (t - 0.7) / 0.3;
        const qbX = fromX + offDir * 3;
        const targetX = fromX - offDir * 12;
        const endX = qbX + (targetX - qbX) * 0.9; // almost at target
        const dropY = 50 + dropT * 15; // falls below centerline
        return { x: endX + (targetX - endX) * dropT * 0.3, y: dropY };
      }
    }

    case 'sack': {
      // Phase 1 (0→0.3): QB drops back
      // Phase 2 (0.3→0.7): Defender closes
      // Phase 3 (0.7→1): Impact, ball jolts
      if (t < 0.3) {
        const dropT = easeOutCubic(t / 0.3);
        return { x: fromX + offDir * 2 * dropT, y: 50 };
      } else {
        const sackT = easeOutCubic((t - 0.3) / 0.7);
        const qbX = fromX + offDir * 2;
        const x = qbX + (toX - qbX) * sackT;
        // Jolt effect at impact
        const jolt = t > 0.65 ? Math.sin((t - 0.65) * 30) * 1.5 * (1 - t) : 0;
        return { x: x + jolt, y: 50 + jolt * 0.5 };
      }
    }

    case 'punt': {
      // High arcing kick
      const eased = easeInOutQuad(t);
      const x = fromX + (toX - fromX) * eased;
      const dist = Math.abs(toX - fromX);
      const arcHeight = Math.min(dist * 0.9, 38);
      const y = 50 - arcHeight * Math.sin(t * Math.PI);
      return { x, y };
    }

    case 'kickoff': {
      // Very high arc
      const eased = easeInOutQuad(t);
      const x = fromX + (toX - fromX) * eased;
      const dist = Math.abs(toX - fromX);
      const arcHeight = Math.min(dist * 0.7, 35);
      const y = 50 - arcHeight * Math.sin(t * Math.PI);
      return { x, y };
    }

    case 'field_goal':
    case 'extra_point': {
      // Arc toward goal posts
      const goalPostX = possession === 'away' ? 91.66 : 8.33;
      const eased = easeInOutQuad(t);
      const x = fromX + (goalPostX - fromX) * eased;
      const arcHeight = play.type === 'extra_point' ? 20 : 28;
      const y = 50 - arcHeight * Math.sin(t * Math.PI);
      return { x, y };
    }

    case 'touchback': {
      return { x: toX, y: 50 };
    }

    default: {
      const eased = easeOutCubic(t);
      return { x: fromX + (toX - fromX) * eased, y: 50 };
    }
  }
}

// ════════════════════════════════════════════════════════════
// PLAY TRAJECTORY TRAIL
// ════════════════════════════════════════════════════════════

function PlayTrajectory({
  playType,
  fromX,
  toX,
  possession,
  progress,
  success,
}: {
  playType: PlayType;
  fromX: number;
  toX: number;
  possession: 'home' | 'away';
  progress: number;
  success: boolean;
}) {
  const offDir = possession === 'away' ? -1 : 1;

  switch (playType) {
    case 'run':
    case 'scramble':
    case 'two_point': {
      // Green trail showing run path
      const currentX = fromX + (toX - fromX) * Math.min(progress, 1);
      if (Math.abs(currentX - fromX) < 0.3) return null;
      const color = playType === 'scramble' ? '#4ade80' : '#22c55e';
      return (
        <g>
          <line
            x1={fromX} y1={50}
            x2={currentX} y2={50}
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.6"
          />
          {/* Arrow head */}
          {progress > 0.3 && (
            <polygon
              points={
                toX > fromX
                  ? `${currentX},50 ${currentX - 2},47 ${currentX - 2},53`
                  : `${currentX},50 ${currentX + 2},47 ${currentX + 2},53`
              }
              fill={color}
              opacity="0.7"
            />
          )}
        </g>
      );
    }

    case 'pass_complete':
    case 'pass_incomplete': {
      const color = playType === 'pass_complete' ? '#3b82f6' : '#ef4444';
      const qbX = fromX + offDir * 3;
      const targetX = playType === 'pass_complete'
        ? toX
        : fromX - offDir * 12;
      const dist = Math.abs(targetX - qbX);
      const arcHeight = Math.min(dist * 0.5, 25);
      const midX = (qbX + targetX) / 2;

      return (
        <g>
          {/* Dashed arc trail */}
          <path
            d={`M ${qbX} 50 Q ${midX} ${50 - arcHeight} ${targetX} 50`}
            stroke={color}
            strokeWidth="1.5"
            fill="none"
            strokeDasharray="3 3"
            strokeLinecap="round"
            opacity="0.5"
          />
          {/* Completion dot or incomplete X at target */}
          {progress > 0.7 && playType === 'pass_complete' && (
            <circle cx={toX} cy={50} r="1.5" fill={color} opacity="0.7" />
          )}
        </g>
      );
    }

    case 'sack': {
      const currentX = fromX + (toX - fromX) * Math.min(progress, 1);
      return (
        <line
          x1={fromX} y1={50}
          x2={currentX} y2={50}
          stroke="#ef4444"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.5"
          strokeDasharray="2 2"
        />
      );
    }

    case 'punt':
    case 'kickoff': {
      const dist = Math.abs(toX - fromX);
      const arcHeight = playType === 'punt'
        ? Math.min(dist * 0.9, 38)
        : Math.min(dist * 0.7, 35);
      const midX = (fromX + toX) / 2;
      return (
        <path
          d={`M ${fromX} 50 Q ${midX} ${50 - arcHeight} ${toX} 50`}
          stroke="#fbbf24"
          strokeWidth="1.2"
          fill="none"
          strokeDasharray="3 4"
          strokeLinecap="round"
          opacity="0.4"
        />
      );
    }

    case 'field_goal':
    case 'extra_point': {
      const goalPostX = possession === 'away' ? 91.66 : 8.33;
      const arcHeight = playType === 'extra_point' ? 20 : 28;
      const midX = (fromX + goalPostX) / 2;
      const color = success ? '#22c55e' : '#ef4444';
      return (
        <g>
          <path
            d={`M ${fromX} 50 Q ${midX} ${50 - arcHeight} ${goalPostX} 50`}
            stroke={color}
            strokeWidth="1.2"
            fill="none"
            strokeDasharray="3 4"
            strokeLinecap="round"
            opacity="0.5"
          />
          {/* Goal posts */}
          <line
            x1={goalPostX} y1={25} x2={goalPostX} y2={75}
            stroke="#fbbf24" strokeWidth="0.6" opacity="0.3"
          />
          <line
            x1={goalPostX - 3} y1={25} x2={goalPostX} y2={25}
            stroke="#fbbf24" strokeWidth="0.6" opacity="0.3"
          />
          <line
            x1={goalPostX} y1={25} x2={goalPostX + 3} y2={25}
            stroke="#fbbf24" strokeWidth="0.6" opacity="0.3"
          />
        </g>
      );
    }

    default:
      return null;
  }
}

// ════════════════════════════════════════════════════════════
// OUTCOME MARKERS
// ════════════════════════════════════════════════════════════

function OutcomeMarker({
  lastPlay,
  fromX,
  toX,
  possession,
}: {
  lastPlay: PlayResult;
  fromX: number;
  toX: number;
  possession: 'home' | 'away';
}) {
  const offDir = possession === 'away' ? -1 : 1;

  switch (lastPlay.type) {
    case 'pass_incomplete': {
      const dropX = fromX - offDir * 10;
      return (
        <g className="outcome-marker-anim">
          {/* Red X */}
          <line
            x1={dropX - 3} y1={47}
            x2={dropX + 3} y2={53}
            stroke="#ef4444" strokeWidth="2" strokeLinecap="round"
          />
          <line
            x1={dropX + 3} y1={47}
            x2={dropX - 3} y2={53}
            stroke="#ef4444" strokeWidth="2" strokeLinecap="round"
          />
          {/* Label */}
          <text
            x={dropX} y={40}
            textAnchor="middle"
            fill="#ef4444"
            fontSize="3.5"
            fontWeight="bold"
            fontFamily="system-ui"
          >
            INCOMPLETE
          </text>
        </g>
      );
    }

    case 'field_goal':
    case 'extra_point': {
      const goalPostX = possession === 'away' ? 91.66 : 8.33;
      if (lastPlay.scoring) {
        return (
          <g className="outcome-marker-anim">
            <circle
              cx={goalPostX} cy={50} r={4}
              fill="#22c55e" opacity="0.3"
            />
            <text
              x={goalPostX} y={18}
              textAnchor="middle"
              fill="#22c55e"
              fontSize="4"
              fontWeight="bold"
              fontFamily="system-ui"
            >
              GOOD!
            </text>
          </g>
        );
      } else {
        return (
          <g className="outcome-marker-anim">
            <circle
              cx={goalPostX} cy={50} r={3}
              fill="#ef4444" opacity="0.3"
            />
            <text
              x={goalPostX} y={18}
              textAnchor="middle"
              fill="#ef4444"
              fontSize="4"
              fontWeight="bold"
              fontFamily="system-ui"
            >
              NO GOOD
            </text>
          </g>
        );
      }
    }

    case 'sack': {
      return (
        <g className="outcome-marker-anim">
          {/* Impact burst */}
          {Array.from({ length: 8 }, (_, i) => {
            const angle = (i * 45 * Math.PI) / 180;
            return (
              <line
                key={i}
                x1={toX + Math.cos(angle) * 1.5}
                y1={50 + Math.sin(angle) * 1.5}
                x2={toX + Math.cos(angle) * 4.5}
                y2={50 + Math.sin(angle) * 4.5}
                stroke="#ef4444"
                strokeWidth="1.2"
                strokeLinecap="round"
                opacity="0.7"
              />
            );
          })}
          <text
            x={toX} y={40}
            textAnchor="middle"
            fill="#ef4444"
            fontSize="3.5"
            fontWeight="bold"
            fontFamily="system-ui"
          >
            SACK
          </text>
        </g>
      );
    }

    default: {
      // Big play yardage callouts
      if (lastPlay.isTouchdown) {
        return (
          <g className="outcome-marker-anim">
            <text
              x={toX} y={38}
              textAnchor="middle"
              fill="#22c55e"
              fontSize="5"
              fontWeight="bold"
              fontFamily="system-ui"
            >
              TOUCHDOWN!
            </text>
          </g>
        );
      }

      if (lastPlay.turnover) {
        const label =
          lastPlay.turnover.type === 'interception' ? 'INTERCEPTION!' :
          lastPlay.turnover.type === 'fumble' ? 'FUMBLE!' :
          'TURNOVER!';
        return (
          <g className="outcome-marker-anim">
            <text
              x={toX} y={38}
              textAnchor="middle"
              fill="#f59e0b"
              fontSize="4"
              fontWeight="bold"
              fontFamily="system-ui"
            >
              {label}
            </text>
          </g>
        );
      }

      if (lastPlay.isSafety) {
        return (
          <g className="outcome-marker-anim">
            <text
              x={toX} y={38}
              textAnchor="middle"
              fill="#ef4444"
              fontSize="4"
              fontWeight="bold"
              fontFamily="system-ui"
            >
              SAFETY!
            </text>
          </g>
        );
      }

      // Big gain callout
      if (
        (lastPlay.type === 'run' || lastPlay.type === 'scramble') &&
        lastPlay.yardsGained > 15
      ) {
        return (
          <g className="outcome-marker-anim">
            <text
              x={toX} y={40}
              textAnchor="middle"
              fill="#22c55e"
              fontSize="3.5"
              fontWeight="bold"
              fontFamily="system-ui"
              opacity="0.8"
            >
              +{lastPlay.yardsGained} YDS
            </text>
          </g>
        );
      }

      if (lastPlay.type === 'pass_complete' && lastPlay.yardsGained > 20) {
        return (
          <g className="outcome-marker-anim">
            <text
              x={toX} y={40}
              textAnchor="middle"
              fill="#3b82f6"
              fontSize="3.5"
              fontWeight="bold"
              fontFamily="system-ui"
              opacity="0.8"
            >
              +{lastPlay.yardsGained} YDS
            </text>
          </g>
        );
      }

      return null;
    }
  }
}

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════

function isFailedPlay(play: PlayResult): boolean {
  if (play.type === 'pass_incomplete') return true;
  if (play.type === 'sack') return true;
  if (play.type === 'field_goal' && !play.scoring) return true;
  if (play.type === 'extra_point' && !play.scoring) return true;
  if (play.turnover) return true;
  return false;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}
