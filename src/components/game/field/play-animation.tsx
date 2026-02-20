'use client';

import { useEffect, useState, useRef } from 'react';
import type { PlayType } from '@/lib/simulation/types';

interface PlayAnimationProps {
  /** The type of the last resolved play */
  playType: PlayType | null;
  /** Absolute field % where the play started (LOS) */
  fromPercent: number;
  /** Absolute field % where the play ended */
  toPercent: number;
  /** Was the play successful (completion, positive yards, FG made, etc.) */
  success: boolean;
  /** Unique key to trigger re-animation on new plays */
  playKey: number;
}

type AnimPhase = 'idle' | 'enter' | 'active' | 'exit';

/**
 * Animated SVG overlays that fire for ~1.5s after each play resolves.
 * Uses stroke-dasharray/dashoffset for drawing effects.
 */
export function PlayAnimation({
  playType,
  fromPercent,
  toPercent,
  success,
  playKey,
}: PlayAnimationProps) {
  const [phase, setPhase] = useState<AnimPhase>('idle');
  const prevKeyRef = useRef(playKey);

  useEffect(() => {
    if (playKey === prevKeyRef.current || !playType) return;
    prevKeyRef.current = playKey;

    // Skip animation for non-visual plays
    if (playType === 'kneel' || playType === 'spike') {
      return;
    }

    setPhase('enter');
    const enterTimer = setTimeout(() => setPhase('active'), 200);
    const exitTimer = setTimeout(() => setPhase('exit'), 1200);
    const idleTimer = setTimeout(() => setPhase('idle'), 1500);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(exitTimer);
      clearTimeout(idleTimer);
    };
  }, [playKey, playType]);

  if (phase === 'idle' || !playType) return null;

  const opacity = phase === 'enter' ? 0.7 : phase === 'active' ? 1 : 0;

  return (
    <div
      className="absolute inset-0 pointer-events-none z-10 overflow-hidden"
      style={{
        opacity,
        transition: phase === 'enter' ? 'opacity 200ms ease-in' : 'opacity 300ms ease-out',
      }}
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="w-full h-full"
      >
        {playType === 'run' && (
          <RunAnimation from={fromPercent} to={toPercent} />
        )}
        {playType === 'scramble' && (
          <ScrambleAnimation from={fromPercent} to={toPercent} />
        )}
        {playType === 'pass_complete' && (
          <PassArcAnimation from={fromPercent} to={toPercent} complete />
        )}
        {playType === 'pass_incomplete' && (
          <PassArcAnimation from={fromPercent} to={toPercent} complete={false} />
        )}
        {playType === 'sack' && (
          <SackBurst at={fromPercent} />
        )}
        {(playType === 'punt' || playType === 'kickoff') && (
          <KickArcAnimation from={fromPercent} to={toPercent} />
        )}
        {playType === 'field_goal' && (
          <FieldGoalAnimation from={fromPercent} success={success} />
        )}
        {playType === 'extra_point' && (
          <FieldGoalAnimation from={fromPercent} success={success} small />
        )}
        {playType === 'touchback' && (
          <TouchbackMarker />
        )}
        {playType === 'two_point' && (
          <RunAnimation from={fromPercent} to={toPercent} />
        )}
      </svg>
    </div>
  );
}

// ── Run: solid directional arrow ──────────────────────────

function RunAnimation({ from, to }: { from: number; to: number }) {
  const minX = Math.min(from, to);
  const maxX = Math.max(from, to);
  const goingRight = to >= from;
  const arrowTip = goingRight ? maxX : minX;
  const arrowBase = goingRight ? minX : maxX;

  return (
    <g className="arrow-draw-anim">
      {/* Trail line */}
      <line
        x1={arrowBase}
        y1="50"
        x2={arrowTip}
        y2="50"
        stroke="#22c55e"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.8"
      />
      {/* Arrowhead */}
      <polygon
        points={
          goingRight
            ? `${arrowTip},50 ${arrowTip - 3},46 ${arrowTip - 3},54`
            : `${arrowTip},50 ${arrowTip + 3},46 ${arrowTip + 3},54`
        }
        fill="#22c55e"
        opacity="0.9"
      />
    </g>
  );
}

// ── Scramble: zigzag path ─────────────────────────────────

function ScrambleAnimation({ from, to }: { from: number; to: number }) {
  const dist = to - from;
  const steps = 6;
  let path = `M ${from} 50`;

  for (let i = 1; i <= steps; i++) {
    const x = from + (dist / steps) * i;
    const y = 50 + (i % 2 === 0 ? -8 : 8);
    path += ` L ${x} ${y}`;
  }

  return (
    <path
      d={path}
      stroke="#22c55e"
      strokeWidth="2"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray="200"
      strokeDashoffset="200"
      opacity="0.8"
      className="zigzag-anim"
    />
  );
}

// ── Pass: arc from LOS to landing spot ────────────────────

function PassArcAnimation({
  from,
  to,
  complete,
}: {
  from: number;
  to: number;
  complete: boolean;
}) {
  const midX = (from + to) / 2;
  const arcHeight = Math.min(Math.abs(to - from) * 0.6, 30);
  const color = complete ? '#3b82f6' : '#ef4444';

  return (
    <g>
      <path
        d={`M ${from} 50 Q ${midX} ${50 - arcHeight} ${to} 50`}
        stroke={color}
        strokeWidth="2"
        fill="none"
        strokeDasharray={complete ? '4 3' : '3 3'}
        strokeLinecap="round"
        opacity="0.8"
        className="pass-arc-anim"
      />
      {/* Landing marker */}
      {complete ? (
        <circle cx={to} cy="50" r="2" fill={color} opacity="0.9" />
      ) : (
        <g opacity="0.8">
          <line x1={to - 2} y1="48" x2={to + 2} y2="52" stroke={color} strokeWidth="1.5" />
          <line x1={to + 2} y1="48" x2={to - 2} y2="52" stroke={color} strokeWidth="1.5" />
        </g>
      )}
    </g>
  );
}

// ── Sack: red burst at ball position ──────────────────────

function SackBurst({ at }: { at: number }) {
  return (
    <g className="burst-anim" opacity="0.8">
      {/* Radial burst lines */}
      {Array.from({ length: 8 }, (_, i) => {
        const angle = (i * 45 * Math.PI) / 180;
        const innerR = 2;
        const outerR = 6;
        return (
          <line
            key={i}
            x1={at + Math.cos(angle) * innerR}
            y1={50 + Math.sin(angle) * innerR}
            x2={at + Math.cos(angle) * outerR}
            y2={50 + Math.sin(angle) * outerR}
            stroke="#ef4444"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        );
      })}
      {/* Center impact */}
      <circle cx={at} cy="50" r="2.5" fill="#ef4444" opacity="0.6" />
    </g>
  );
}

// ── Kick arc (punt/kickoff): parabolic arc ────────────────

function KickArcAnimation({ from, to }: { from: number; to: number }) {
  const midX = (from + to) / 2;
  const arcHeight = Math.min(Math.abs(to - from) * 0.8, 40);

  return (
    <path
      d={`M ${from} 50 Q ${midX} ${50 - arcHeight} ${to} 50`}
      stroke="#fbbf24"
      strokeWidth="1.5"
      fill="none"
      strokeDasharray="3 4"
      strokeLinecap="round"
      opacity="0.6"
      className="pass-arc-anim"
    />
  );
}

// ── Field goal: arc toward goal posts ─────────────────────

function FieldGoalAnimation({
  from,
  success,
  small,
}: {
  from: number;
  success: boolean;
  small?: boolean;
}) {
  // FG always goes toward nearest end zone
  const toGoal = from > 50 ? 100 : 0;
  const midX = (from + toGoal) / 2;
  const arcHeight = small ? 15 : 25;
  const color = success ? '#22c55e' : '#ef4444';

  return (
    <g>
      <path
        d={`M ${from} 50 Q ${midX} ${50 - arcHeight} ${toGoal} 50`}
        stroke={color}
        strokeWidth="1.5"
        fill="none"
        strokeDasharray="3 4"
        strokeLinecap="round"
        opacity="0.7"
        className="pass-arc-anim"
      />
      {/* Result flash at goal posts */}
      <circle
        cx={toGoal}
        cy="50"
        r={success ? 4 : 3}
        fill={color}
        opacity="0.5"
        className={success ? 'goalposts-flash-anim' : ''}
      />
    </g>
  );
}

// ── Touchback marker at 25-yard line ──────────────────────

function TouchbackMarker() {
  return (
    <g opacity="0.7">
      <text
        x="25"
        y="45"
        textAnchor="middle"
        fill="white"
        fontSize="5"
        fontWeight="bold"
        fontFamily="system-ui"
      >
        TB
      </text>
      <rect
        x="21"
        y="38"
        width="8"
        height="10"
        rx="1"
        fill="none"
        stroke="white"
        strokeWidth="0.5"
        opacity="0.5"
      />
    </g>
  );
}
