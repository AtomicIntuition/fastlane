'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import type { PlayResult, PlayType, Formation, DefensivePersonnel } from '@/lib/simulation/types';
import { OFFENSIVE_FORMATIONS, DEFENSIVE_FORMATIONS } from './formation-layouts';
import type { FormationPosition } from './formation-layouts';

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
  /** @deprecated No longer needed — HTML/CSS rendering is distortion-free */
  aspectRatio?: number;
}

// ── Timing ───────────────────────────────────────────────────
const PRE_SNAP_MS = 500;
const SNAP_MS = 150;
const DEVELOPMENT_MS = 1800;
const RESULT_MS = 600;
const POST_PLAY_MS = 400;
const TOTAL_MS = PRE_SNAP_MS + SNAP_MS + DEVELOPMENT_MS + RESULT_MS + POST_PLAY_MS;

type Phase = 'idle' | 'pre_snap' | 'snap' | 'development' | 'result' | 'post_play';

// ── Easing ───────────────────────────────────────────────────
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
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
}: PlaySceneProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const prevKeyRef = useRef(playKey);
  const animFrameRef = useRef(0);
  const [animProgress, setAnimProgress] = useState(0);
  const [ballPos, setBallPos] = useState({ x: 0, y: 50 });

  const fromToRef = useRef({ from: prevBallLeftPercent, to: ballLeftPercent });

  const onPhaseChangeRef = useRef(onPhaseChange);
  onPhaseChangeRef.current = onPhaseChange;

  const updatePhase = useCallback((newPhase: Phase) => {
    setPhase(newPhase);
    onPhaseChangeRef.current?.(newPhase);
  }, []);

  // ── Formation dots ─────────────────────────────────────────
  const formation = useMemo(() => {
    const losX = fromToRef.current.from;
    const playType = lastPlay?.type ?? null;
    return getFormationDots(
      losX, possession, playType,
      lastPlay?.formation ?? null,
      lastPlay?.defensiveCall?.personnel ?? null,
      lastPlay,
    );
  }, [possession, lastPlay, playKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Detect new play → start animation ──────────────────────
  const onAnimatingRef = useRef(onAnimating);
  onAnimatingRef.current = onAnimating;

  useEffect(() => {
    if (playKey === prevKeyRef.current || !lastPlay) return;
    prevKeyRef.current = playKey;

    if (
      lastPlay.type === 'kneel' || lastPlay.type === 'spike' ||
      lastPlay.type === 'pregame' || lastPlay.type === 'coin_toss'
    ) return;

    fromToRef.current = { from: prevBallLeftPercent, to: ballLeftPercent };
    const fromX = prevBallLeftPercent;
    const toX = ballLeftPercent;

    onAnimatingRef.current(true);
    updatePhase('pre_snap');
    setBallPos({ x: fromX, y: 50 });
    setAnimProgress(0);

    const t1 = setTimeout(() => updatePhase('snap'), PRE_SNAP_MS);
    const t2 = setTimeout(() => {
      updatePhase('development');
      startRaf(fromX, toX, lastPlay);
    }, PRE_SNAP_MS + SNAP_MS);
    const t3 = setTimeout(() => {
      updatePhase('result');
      cancelAnimationFrame(animFrameRef.current);
      setBallPos({ x: toX, y: 50 });
      setAnimProgress(1);
    }, PRE_SNAP_MS + SNAP_MS + DEVELOPMENT_MS);
    const t4 = setTimeout(() => updatePhase('post_play'), PRE_SNAP_MS + SNAP_MS + DEVELOPMENT_MS + RESULT_MS);
    const t5 = setTimeout(() => {
      updatePhase('idle');
      onAnimatingRef.current(false);
    }, TOTAL_MS);

    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      clearTimeout(t4); clearTimeout(t5);
      cancelAnimationFrame(animFrameRef.current);
      onAnimatingRef.current(false);
    };
  }, [playKey, lastPlay, prevBallLeftPercent, ballLeftPercent, updatePhase]);

  // ── RAF loop ───────────────────────────────────────────────
  function startRaf(fromX: number, toX: number, play: PlayResult) {
    const startTime = performance.now();
    function tick(now: number) {
      const t = Math.min((now - startTime) / DEVELOPMENT_MS, 1);
      setAnimProgress(t);
      setBallPos(calculateBallPosition(play, fromX, toX, t, possession));
      if (t < 1) animFrameRef.current = requestAnimationFrame(tick);
    }
    animFrameRef.current = requestAnimationFrame(tick);
  }

  // ── Render nothing when idle ───────────────────────────────
  if (phase === 'idle' || !lastPlay) return null;

  const fromX = fromToRef.current.from;
  const toX = fromToRef.current.to;
  const playType = lastPlay.type;
  const isSuccess = !isFailedPlay(lastPlay);
  const offDir = possession === 'away' ? -1 : 1;

  const opacity =
    phase === 'pre_snap' ? 0.85 :
    phase === 'snap' ? 0.9 :
    phase === 'development' ? 1 :
    phase === 'result' ? 0.9 : 0;

  const isRunPlay = playType === 'run' || playType === 'scramble' || playType === 'two_point';

  const isPassPlay = playType === 'pass_complete' || playType === 'pass_incomplete' ||
    lastPlay.call?.startsWith('pass_') || lastPlay.call?.startsWith('play_action') ||
    lastPlay.call === 'screen_pass' || lastPlay.call === 'pass_rpo';

  return (
    <div
      className="absolute inset-0 pointer-events-none z-10 overflow-hidden"
      style={{
        opacity,
        transition: phase === 'post_play' ? 'opacity 400ms ease-out' : 'opacity 200ms ease-in',
      }}
    >
      {/* ─── SVG layer for trajectory lines (lines don't distort) ─── */}
      {(phase === 'development' || phase === 'result') && (
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full"
        >
          {/* Route lines for pass plays */}
          {isPassPlay && (
            <RouteLines
              formation={formation}
              fromX={fromX}
              offDir={offDir}
              offenseColor={offenseColor}
              playCall={lastPlay.call}
              progress={animProgress}
            />
          )}

          {/* Play trajectory trail */}
          <PlayTrajectory
            playType={playType}
            fromX={fromX}
            toX={toX}
            possession={possession}
            progress={animProgress}
            success={isSuccess}
          />
        </svg>
      )}

      {/* ─── HTML layer: player dots (perfectly round, no distortion) ─── */}
      {formation.map((dot, i) => {
        const isQB = dot.role === 'QB';
        const isOffense = dot.team === 'offense';

        let x = clamp(dot.x, 1, 99);
        let y = clamp(dot.y, 3, 97);

        // Animate during play phases
        if ((phase === 'snap' || phase === 'development') && isOffense) {
          if (dot.role === 'OL') {
            x -= offDir * 1.0;
          } else if (isQB && !lastPlay.call?.startsWith('run_') && phase === 'development') {
            x += offDir * 2 * Math.min(animProgress * 2, 1);
          }
        }
        if (phase === 'development' && !isOffense) {
          const convergeFactor = Math.min(animProgress * 0.3, 0.15);
          x += (ballPos.x - x) * convergeFactor;
          y += (ballPos.y - y) * convergeFactor * 0.5;
        }

        const dotSize = isQB ? 12 : 9;

        return (
          <div
            key={i}
            className="absolute play-scene-dot"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              transform: 'translate(-50%, -50%)',
              zIndex: isOffense ? 3 : 1,
            }}
          >
            {/* Player dot — perfectly round */}
            <div
              className="rounded-full"
              style={{
                width: dotSize,
                height: dotSize,
                backgroundColor: isOffense ? offenseColor : defenseColor,
                opacity: isOffense ? 0.9 : 0.45,
                border: isOffense
                  ? '1.5px solid rgba(255,255,255,0.8)'
                  : '1px solid rgba(255,255,255,0.2)',
                boxShadow: isOffense
                  ? '0 0 4px rgba(0,0,0,0.4)'
                  : 'none',
              }}
            />
            {/* Position label */}
            {(isOffense || dot.isKeyPlayer) && (
              <div
                className="absolute left-1/2 whitespace-nowrap font-bold"
                style={{
                  transform: 'translateX(-50%)',
                  bottom: `${dotSize / 2 + 3}px`,
                  fontSize: '8px',
                  lineHeight: 1,
                  color: 'white',
                  opacity: dot.isKeyPlayer ? 0.9 : 0.5,
                  textShadow: '0 1px 3px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.6)',
                  letterSpacing: '0.03em',
                }}
              >
                {dot.isKeyPlayer && dot.number ? `#${dot.number}` : dot.role}
              </div>
            )}
          </div>
        );
      })}

      {/* ─── Ball carrier dot (runs/scrambles) ─── */}
      {phase === 'development' && isRunPlay && (
        <div
          className="absolute"
          style={{
            left: `${clamp(ballPos.x, 2, 98)}%`,
            top: `${clamp(ballPos.y, 5, 95)}%`,
            transform: 'translate(-50%, -50%)',
            zIndex: 5,
          }}
        >
          <div
            className="rounded-full"
            style={{
              width: 13,
              height: 13,
              backgroundColor: offenseColor,
              border: '2px solid white',
              opacity: 0.9,
              boxShadow: '0 0 8px rgba(255,255,255,0.3), 0 0 4px rgba(0,0,0,0.5)',
            }}
          />
        </div>
      )}

      {/* ─── Animated ball (passes, kicks) ─── */}
      {phase === 'development' && !isRunPlay && (
        <div
          className="absolute"
          style={{
            left: `${clamp(ballPos.x, 2, 98)}%`,
            top: `${clamp(ballPos.y, 5, 95)}%`,
            transform: 'translate(-50%, -50%)',
            zIndex: 6,
          }}
        >
          {/* Glow beneath */}
          <div
            className="absolute rounded-full"
            style={{
              width: 18,
              height: 14,
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'rgba(212, 175, 55, 0.3)',
              filter: 'blur(4px)',
            }}
          />
          {/* Ball shape */}
          <div
            style={{
              width: 12,
              height: 8,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #A0522D 0%, #8B4513 50%, #6B3410 100%)',
              border: '1px solid #5C2D06',
              boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
              position: 'relative',
            }}
          >
            {/* Lace */}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '20%',
                right: '20%',
                height: 1,
                background: 'rgba(255,255,255,0.6)',
                transform: 'translateY(-50%)',
              }}
            />
          </div>
        </div>
      )}

      {/* ─── Outcome markers ─── */}
      {(phase === 'result' || phase === 'post_play') && (
        <OutcomeMarker
          lastPlay={lastPlay}
          fromX={fromX}
          toX={toX}
          possession={possession}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// ROUTE LINES (SVG — lines don't distort meaningfully)
// ══════════════════════════════════════════════════════════════

function RouteLines({
  formation, fromX, offDir, offenseColor, playCall, progress,
}: {
  formation: PlayerDot[];
  fromX: number;
  offDir: number;
  offenseColor: string;
  playCall: string;
  progress: number;
}) {
  const receivers = formation.filter(
    d => d.team === 'offense' && (d.role === 'WR' || d.role === 'TE')
  );
  let routeDepth = 8;
  if (playCall?.includes('quick')) routeDepth = 4;
  else if (playCall?.includes('short') || playCall?.includes('screen')) routeDepth = 6;
  else if (playCall?.includes('medium')) routeDepth = 12;
  else if (playCall?.includes('deep')) routeDepth = 18;

  return (
    <g>
      {receivers.map((wr, i) => {
        const startX = clamp(wr.x, 1, 99);
        const startY = clamp(wr.y, 3, 97);
        const endX = startX - offDir * routeDepth * (0.8 + i * 0.15);
        const lateralBreak = (i % 2 === 0 ? -1 : 1) * 5;
        const midX = (startX + endX) / 2;
        const endY = startY + lateralBreak;
        const pathD = `M ${startX} ${startY} L ${midX} ${startY} L ${clamp(endX, 2, 98)} ${clamp(endY, 5, 95)}`;
        const isTargeted = i === 0;
        const routeOpacity = isTargeted ? 0.5 * progress : 0.2 * progress;
        return (
          <path
            key={i}
            d={pathD}
            stroke={offenseColor}
            strokeWidth={isTargeted ? '0.8' : '0.5'}
            fill="none"
            strokeDasharray="2 2"
            opacity={routeOpacity}
          />
        );
      })}
    </g>
  );
}

// ══════════════════════════════════════════════════════════════
// OUTCOME MARKERS (HTML — clean, undistorted text)
// ══════════════════════════════════════════════════════════════

function OutcomeMarker({
  lastPlay, fromX, toX, possession,
}: {
  lastPlay: PlayResult; fromX: number; toX: number;
  possession: 'home' | 'away';
}) {
  const offDir = possession === 'away' ? -1 : 1;

  let text = '';
  let color = '';
  let x = toX;
  let size: 'lg' | 'md' | 'sm' = 'md';
  let icon: 'x' | 'burst' | 'circle' | null = null;

  if (lastPlay.isTouchdown) {
    text = 'TOUCHDOWN!';
    color = '#22c55e';
    size = 'lg';
  } else if (lastPlay.type === 'pass_incomplete') {
    text = 'INCOMPLETE';
    color = '#ef4444';
    x = fromX - offDir * 10;
    icon = 'x';
  } else if (lastPlay.type === 'sack') {
    text = 'SACK';
    color = '#ef4444';
    icon = 'burst';
  } else if (lastPlay.turnover) {
    text = lastPlay.turnover.type === 'interception' ? 'INTERCEPTION!'
      : lastPlay.turnover.type === 'fumble' ? 'FUMBLE!' : 'TURNOVER!';
    color = '#f59e0b';
    size = 'lg';
  } else if (lastPlay.isSafety) {
    text = 'SAFETY!';
    color = '#ef4444';
    size = 'lg';
  } else if (lastPlay.type === 'field_goal' || lastPlay.type === 'extra_point') {
    const goalPostX = possession === 'away' ? 91.66 : 8.33;
    text = lastPlay.scoring ? 'GOOD!' : 'NO GOOD';
    color = lastPlay.scoring ? '#22c55e' : '#ef4444';
    x = goalPostX;
    icon = 'circle';
  } else if ((lastPlay.type === 'run' || lastPlay.type === 'scramble') && lastPlay.yardsGained > 15) {
    text = `+${lastPlay.yardsGained} YDS`;
    color = '#22c55e';
    size = 'sm';
  } else if (lastPlay.type === 'pass_complete' && lastPlay.yardsGained > 20) {
    text = `+${lastPlay.yardsGained} YDS`;
    color = '#3b82f6';
    size = 'sm';
  }

  if (!text) return null;

  const fontSize = size === 'lg' ? 18 : size === 'md' ? 14 : 12;

  return (
    <div
      className="outcome-marker-anim absolute"
      style={{
        left: `${clamp(x, 5, 95)}%`,
        top: '33%',
        transform: 'translate(-50%, -50%)',
        zIndex: 20,
        textAlign: 'center',
      }}
    >
      {/* Icon: X mark */}
      {icon === 'x' && (
        <div className="relative mx-auto mb-1" style={{ width: 16, height: 16 }}>
          <div
            className="absolute rounded-full"
            style={{
              top: '50%', left: '50%',
              width: 14, height: 2,
              background: color,
              transform: 'translate(-50%, -50%) rotate(45deg)',
              borderRadius: 1,
            }}
          />
          <div
            className="absolute rounded-full"
            style={{
              top: '50%', left: '50%',
              width: 14, height: 2,
              background: color,
              transform: 'translate(-50%, -50%) rotate(-45deg)',
              borderRadius: 1,
            }}
          />
        </div>
      )}

      {/* Icon: Burst (sack) */}
      {icon === 'burst' && (
        <div className="relative mx-auto mb-1" style={{ width: 20, height: 20 }}>
          {Array.from({ length: 8 }, (_, i) => (
            <div
              key={i}
              className="absolute"
              style={{
                top: '50%', left: '50%',
                width: 2, height: 10,
                background: color,
                borderRadius: 1,
                transform: `translate(-50%, -50%) rotate(${i * 45}deg)`,
              }}
            />
          ))}
        </div>
      )}

      {/* Icon: Circle glow (field goal) */}
      {icon === 'circle' && (
        <div
          className="mx-auto mb-1 rounded-full"
          style={{
            width: 20, height: 20,
            backgroundColor: color,
            opacity: 0.3,
          }}
        />
      )}

      {/* Text label */}
      <div
        className="font-black tracking-wider whitespace-nowrap"
        style={{
          color,
          fontSize,
          textShadow: `0 2px 6px rgba(0,0,0,0.9), 0 0 12px rgba(0,0,0,0.5), 0 0 20px ${color}40`,
          letterSpacing: '0.08em',
        }}
      >
        {text}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// FORMATION GENERATION
// ══════════════════════════════════════════════════════════════

interface PlayerDot {
  x: number;
  y: number;
  role: string;
  team: 'offense' | 'defense';
  isKeyPlayer?: boolean;
  number?: number;
}

function getFormationDots(
  losX: number,
  possession: 'home' | 'away',
  playType: PlayType | null,
  formationType: Formation | null,
  defensivePersonnel: DefensivePersonnel | null,
  lastPlay: PlayResult | null,
): PlayerDot[] {
  const offDir = possession === 'away' ? -1 : 1;

  if (playType === 'punt') return getPuntFormation(losX, offDir);
  if (playType === 'kickoff') return getKickoffFormation(losX, offDir);
  if (playType === 'field_goal' || playType === 'extra_point') {
    return getFieldGoalFormation(losX, offDir);
  }

  const offenseLayout = formationType
    ? OFFENSIVE_FORMATIONS[formationType]
    : OFFENSIVE_FORMATIONS.shotgun;
  const defenseLayout = defensivePersonnel
    ? DEFENSIVE_FORMATIONS[defensivePersonnel]
    : DEFENSIVE_FORMATIONS.base_4_3;

  const offense = convertLayout(offenseLayout, losX, offDir, 'offense', lastPlay);
  const defense = convertLayout(defenseLayout, losX, offDir, 'defense', lastPlay);
  return [...offense, ...defense];
}

function convertLayout(
  layout: FormationPosition[], losX: number, offDir: number,
  team: 'offense' | 'defense', lastPlay: PlayResult | null,
): PlayerDot[] {
  let receiverMarked = false;
  let defenderMarked = false;

  return layout.map((pos) => {
    const x = losX + offDir * pos.x;
    let isKeyPlayer = false;
    let number: number | undefined;

    if (lastPlay && team === 'offense') {
      if (pos.role === 'QB' && lastPlay.passer) {
        isKeyPlayer = true;
        number = lastPlay.passer.number;
      } else if ((pos.role === 'RB' || pos.role === 'FB') && lastPlay.rusher) {
        isKeyPlayer = true;
        number = lastPlay.rusher.number;
      } else if (pos.role === 'WR' && lastPlay.receiver && !receiverMarked) {
        isKeyPlayer = true;
        number = lastPlay.receiver.number;
        receiverMarked = true;
      }
    }
    if (lastPlay && team === 'defense' && lastPlay.defender && !defenderMarked) {
      if (pos.role === 'LB' || pos.role === 'CB' || pos.role === 'S') {
        isKeyPlayer = true;
        number = lastPlay.defender.number;
        defenderMarked = true;
      }
    }

    return { x, y: pos.y, role: pos.role, team, isKeyPlayer, number };
  });
}

function getPuntFormation(losX: number, offDir: number): PlayerDot[] {
  return [
    { x: losX, y: 35, role: 'OL', team: 'offense' },
    { x: losX, y: 42, role: 'OL', team: 'offense' },
    { x: losX, y: 48, role: 'OL', team: 'offense' },
    { x: losX, y: 52, role: 'OL', team: 'offense' },
    { x: losX, y: 58, role: 'OL', team: 'offense' },
    { x: losX, y: 65, role: 'OL', team: 'offense' },
    { x: losX + offDir * 1, y: 30, role: 'WG', team: 'offense' },
    { x: losX + offDir * 1, y: 70, role: 'WG', team: 'offense' },
    { x: losX + offDir * 0.5, y: 10, role: 'GN', team: 'offense' },
    { x: losX + offDir * 0.5, y: 90, role: 'GN', team: 'offense' },
    { x: losX + offDir * 12, y: 50, role: 'P', team: 'offense' },
    { x: losX - offDir * 1, y: 38, role: 'DL', team: 'defense' },
    { x: losX - offDir * 1, y: 45, role: 'DL', team: 'defense' },
    { x: losX - offDir * 1, y: 55, role: 'DL', team: 'defense' },
    { x: losX - offDir * 1, y: 62, role: 'DL', team: 'defense' },
    { x: losX - offDir * 5, y: 35, role: 'LB', team: 'defense' },
    { x: losX - offDir * 5, y: 50, role: 'LB', team: 'defense' },
    { x: losX - offDir * 5, y: 65, role: 'LB', team: 'defense' },
    { x: losX - offDir * 12, y: 30, role: 'CB', team: 'defense' },
    { x: losX - offDir * 12, y: 70, role: 'CB', team: 'defense' },
    { x: losX - offDir * 20, y: 50, role: 'PR', team: 'defense' },
    { x: losX - offDir * 18, y: 40, role: 'S', team: 'defense' },
  ];
}

function getKickoffFormation(losX: number, offDir: number): PlayerDot[] {
  return [
    { x: losX + offDir * 2, y: 50, role: 'K', team: 'offense' },
    { x: losX, y: 10, role: 'CV', team: 'offense' },
    { x: losX, y: 20, role: 'CV', team: 'offense' },
    { x: losX, y: 30, role: 'CV', team: 'offense' },
    { x: losX, y: 38, role: 'CV', team: 'offense' },
    { x: losX, y: 45, role: 'CV', team: 'offense' },
    { x: losX, y: 55, role: 'CV', team: 'offense' },
    { x: losX, y: 62, role: 'CV', team: 'offense' },
    { x: losX, y: 70, role: 'CV', team: 'offense' },
    { x: losX, y: 80, role: 'CV', team: 'offense' },
    { x: losX, y: 90, role: 'CV', team: 'offense' },
    { x: losX - offDir * 15, y: 35, role: 'BK', team: 'defense' },
    { x: losX - offDir * 15, y: 45, role: 'BK', team: 'defense' },
    { x: losX - offDir * 15, y: 55, role: 'BK', team: 'defense' },
    { x: losX - offDir * 15, y: 65, role: 'BK', team: 'defense' },
    { x: losX - offDir * 18, y: 30, role: 'BK', team: 'defense' },
    { x: losX - offDir * 18, y: 42, role: 'BK', team: 'defense' },
    { x: losX - offDir * 18, y: 58, role: 'BK', team: 'defense' },
    { x: losX - offDir * 18, y: 70, role: 'BK', team: 'defense' },
    { x: losX - offDir * 22, y: 40, role: 'BK', team: 'defense' },
    { x: losX - offDir * 22, y: 60, role: 'BK', team: 'defense' },
    { x: losX - offDir * 30, y: 50, role: 'KR', team: 'defense' },
  ];
}

function getFieldGoalFormation(losX: number, offDir: number): PlayerDot[] {
  return [
    { x: losX, y: 40, role: 'OL', team: 'offense' },
    { x: losX, y: 44, role: 'OL', team: 'offense' },
    { x: losX, y: 48, role: 'OL', team: 'offense' },
    { x: losX, y: 50, role: 'OL', team: 'offense' },
    { x: losX, y: 52, role: 'OL', team: 'offense' },
    { x: losX, y: 56, role: 'OL', team: 'offense' },
    { x: losX, y: 60, role: 'OL', team: 'offense' },
    { x: losX + offDir * 0.5, y: 36, role: 'WG', team: 'offense' },
    { x: losX + offDir * 0.5, y: 64, role: 'WG', team: 'offense' },
    { x: losX + offDir * 6, y: 50, role: 'H', team: 'offense' },
    { x: losX + offDir * 9, y: 50, role: 'K', team: 'offense' },
    { x: losX - offDir * 1, y: 40, role: 'DL', team: 'defense' },
    { x: losX - offDir * 1, y: 44, role: 'DL', team: 'defense' },
    { x: losX - offDir * 1, y: 48, role: 'DL', team: 'defense' },
    { x: losX - offDir * 1, y: 52, role: 'DL', team: 'defense' },
    { x: losX - offDir * 1, y: 56, role: 'DL', team: 'defense' },
    { x: losX - offDir * 1, y: 60, role: 'DL', team: 'defense' },
    { x: losX - offDir * 3, y: 35, role: 'LB', team: 'defense' },
    { x: losX - offDir * 3, y: 50, role: 'LB', team: 'defense' },
    { x: losX - offDir * 3, y: 65, role: 'LB', team: 'defense' },
    { x: losX - offDir * 8, y: 30, role: 'CB', team: 'defense' },
    { x: losX - offDir * 8, y: 70, role: 'CB', team: 'defense' },
  ];
}

// ══════════════════════════════════════════════════════════════
// BALL TRAJECTORY
// ══════════════════════════════════════════════════════════════

function calculateBallPosition(
  play: PlayResult, fromX: number, toX: number, t: number,
  possession: 'home' | 'away',
): { x: number; y: number } {
  const offDir = possession === 'away' ? -1 : 1;

  switch (play.type) {
    case 'run': case 'scramble': case 'two_point': {
      const eased = easeOutCubic(t);
      const x = fromX + (toX - fromX) * eased;
      const weaveAmt = play.type === 'scramble' ? 5 : 3;
      const weave = Math.sin(t * Math.PI * 3) * weaveAmt * (1 - t);
      return { x, y: 50 + weave };
    }
    case 'pass_complete': {
      if (t < 0.15) {
        return { x: fromX + offDir * 3 * easeOutCubic(t / 0.15), y: 50 };
      } else if (t < 0.4) {
        const qbX = fromX + offDir * 3;
        return { x: qbX + Math.sin((t - 0.15) * 12) * 0.5, y: 50 };
      } else if (t < 0.85) {
        const throwT = easeInOutQuad((t - 0.4) / 0.45);
        const qbX = fromX + offDir * 3;
        const dist = Math.abs(toX - qbX);
        const arcHeight = Math.min(dist * 0.5, 25);
        const x = qbX + (toX - qbX) * throwT;
        const y = 50 - arcHeight * Math.sin(throwT * Math.PI);
        const lateral = play.yardsGained > 15
          ? Math.sin(throwT * Math.PI * 0.5) * 8
          : Math.sin(throwT * Math.PI * 0.5) * 3;
        return { x, y: y + lateral };
      } else {
        return { x: toX, y: 50 };
      }
    }
    case 'pass_incomplete': {
      if (t < 0.15) return { x: fromX + offDir * 3 * easeOutCubic(t / 0.15), y: 50 };
      if (t < 0.4) return { x: fromX + offDir * 3, y: 50 };
      if (t < 0.7) {
        const throwT = (t - 0.4) / 0.3;
        const qbX = fromX + offDir * 3;
        const targetX = fromX - offDir * 12;
        const dist = Math.abs(targetX - qbX);
        const arcHeight = Math.min(dist * 0.4, 18);
        return {
          x: qbX + (targetX - qbX) * easeInOutQuad(throwT),
          y: 50 - arcHeight * Math.sin(throwT * Math.PI),
        };
      }
      const dropT = (t - 0.7) / 0.3;
      const qbX = fromX + offDir * 3;
      const targetX = fromX - offDir * 12;
      const endX = qbX + (targetX - qbX) * 0.9;
      return { x: endX + (targetX - endX) * dropT * 0.3, y: 50 + dropT * 15 };
    }
    case 'sack': {
      if (t < 0.2) return { x: fromX + offDir * 2 * easeOutCubic(t / 0.2), y: 50 };
      if (t < 0.5) return { x: fromX + offDir * 2 + Math.sin((t - 0.2) * 15) * 0.8, y: 50 };
      const sackT = easeOutCubic((t - 0.5) / 0.5);
      const qbX = fromX + offDir * 2;
      const x = qbX + (toX - qbX) * sackT;
      const jolt = t > 0.75 ? Math.sin((t - 0.75) * 30) * 1.5 * (1 - t) : 0;
      return { x: x + jolt, y: 50 + jolt * 0.5 };
    }
    case 'punt': {
      const eased = easeInOutQuad(t);
      const dist = Math.abs(toX - fromX);
      return { x: fromX + (toX - fromX) * eased, y: 50 - Math.min(dist * 0.9, 38) * Math.sin(t * Math.PI) };
    }
    case 'kickoff': {
      const eased = easeInOutQuad(t);
      const dist = Math.abs(toX - fromX);
      return { x: fromX + (toX - fromX) * eased, y: 50 - Math.min(dist * 0.7, 35) * Math.sin(t * Math.PI) };
    }
    case 'field_goal': case 'extra_point': {
      const goalPostX = possession === 'away' ? 91.66 : 8.33;
      const eased = easeInOutQuad(t);
      const arcHeight = play.type === 'extra_point' ? 20 : 28;
      return { x: fromX + (goalPostX - fromX) * eased, y: 50 - arcHeight * Math.sin(t * Math.PI) };
    }
    case 'touchback': return { x: toX, y: 50 };
    default: return { x: fromX + (toX - fromX) * easeOutCubic(t), y: 50 };
  }
}

// ══════════════════════════════════════════════════════════════
// PLAY TRAJECTORY TRAIL (SVG)
// ══════════════════════════════════════════════════════════════

function PlayTrajectory({
  playType, fromX, toX, possession, progress, success,
}: {
  playType: PlayType; fromX: number; toX: number;
  possession: 'home' | 'away'; progress: number; success: boolean;
}) {
  const offDir = possession === 'away' ? -1 : 1;

  switch (playType) {
    case 'run': case 'scramble': case 'two_point': {
      const currentX = fromX + (toX - fromX) * Math.min(progress, 1);
      if (Math.abs(currentX - fromX) < 0.3) return null;
      const color = playType === 'scramble' ? '#4ade80' : '#22c55e';
      return (
        <g>
          <line x1={fromX} y1={50} x2={currentX} y2={50}
            stroke={color} strokeWidth="2" strokeLinecap="round" opacity="0.6" />
          {progress > 0.3 && (
            <polygon
              points={toX > fromX
                ? `${currentX},50 ${currentX - 2},47 ${currentX - 2},53`
                : `${currentX},50 ${currentX + 2},47 ${currentX + 2},53`}
              fill={color} opacity="0.7" />
          )}
        </g>
      );
    }
    case 'pass_complete': case 'pass_incomplete': {
      const color = playType === 'pass_complete' ? '#3b82f6' : '#ef4444';
      const qbX = fromX + offDir * 3;
      const targetX = playType === 'pass_complete' ? toX : fromX - offDir * 12;
      const dist = Math.abs(targetX - qbX);
      const arcHeight = Math.min(dist * 0.5, 25);
      const midX = (qbX + targetX) / 2;
      return (
        <g>
          <path d={`M ${qbX} 50 Q ${midX} ${50 - arcHeight} ${targetX} 50`}
            stroke={color} strokeWidth="1.5" fill="none"
            strokeDasharray="3 3" strokeLinecap="round" opacity="0.5" />
          {progress > 0.7 && playType === 'pass_complete' && (
            <circle cx={toX} cy={50} r="1.5" fill={color} opacity="0.7" />
          )}
        </g>
      );
    }
    case 'sack': {
      const currentX = fromX + (toX - fromX) * Math.min(progress, 1);
      return <line x1={fromX} y1={50} x2={currentX} y2={50}
        stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" strokeDasharray="2 2" />;
    }
    case 'punt': case 'kickoff': {
      const dist = Math.abs(toX - fromX);
      const arcH = playType === 'punt' ? Math.min(dist * 0.9, 38) : Math.min(dist * 0.7, 35);
      const midX = (fromX + toX) / 2;
      return <path d={`M ${fromX} 50 Q ${midX} ${50 - arcH} ${toX} 50`}
        stroke="#fbbf24" strokeWidth="1.2" fill="none" strokeDasharray="3 4" opacity="0.4" />;
    }
    case 'field_goal': case 'extra_point': {
      const goalPostX = possession === 'away' ? 91.66 : 8.33;
      const arcH = playType === 'extra_point' ? 20 : 28;
      const midX = (fromX + goalPostX) / 2;
      const color = success ? '#22c55e' : '#ef4444';
      return (
        <g>
          <path d={`M ${fromX} 50 Q ${midX} ${50 - arcH} ${goalPostX} 50`}
            stroke={color} strokeWidth="1.2" fill="none" strokeDasharray="3 4" opacity="0.5" />
          <line x1={goalPostX} y1={25} x2={goalPostX} y2={75} stroke="#fbbf24" strokeWidth="0.6" opacity="0.3" />
          <line x1={goalPostX - 3} y1={25} x2={goalPostX} y2={25} stroke="#fbbf24" strokeWidth="0.6" opacity="0.3" />
          <line x1={goalPostX} y1={25} x2={goalPostX + 3} y2={25} stroke="#fbbf24" strokeWidth="0.6" opacity="0.3" />
        </g>
      );
    }
    default: return null;
  }
}

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

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
