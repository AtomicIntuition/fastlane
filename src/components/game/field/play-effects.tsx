/**
 * Visual effect components for play-scene animations.
 *
 * Extracted from play-scene.tsx — presentational React components
 * for impact bursts, turnover shocks, touchdown bursts, spiral lines,
 * kick altitude ghosts, decorative arcs, outcome markers, and the
 * shared LogoImg helper.
 */

import type { PlayResult } from '@/lib/simulation/types';
import { getTeamScoreboardLogoUrl } from '@/lib/utils/team-logos';
import { yardsToPercent } from './yard-grid';

// ── Shared Constants ─────────────────────────────────────────

export const BALL_SIZE = 44;

// ── Helpers ──────────────────────────────────────────────────

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function isFailedPlay(play: PlayResult): boolean {
  if (play.type === 'pass_incomplete') return true;
  if (play.type === 'sack') return true;
  if (play.type === 'field_goal' && !play.scoring) return true;
  if (play.type === 'extra_point' && !play.scoring) return true;
  if (play.turnover) return true;
  return false;
}

// ── Logo Image ───────────────────────────────────────────────

export function LogoImg({
  abbrev, size, flip, opacity,
}: {
  abbrev: string; size: number; flip?: boolean; opacity?: number;
}) {
  return (
    <img
      src={getTeamScoreboardLogoUrl(abbrev)}
      alt=""
      width={size}
      height={size}
      style={{
        objectFit: 'contain',
        pointerEvents: 'none',
        userSelect: 'none',
        transform: flip ? 'scaleX(-1)' : undefined,
        opacity,
      }}
      draggable={false}
    />
  );
}

// ── Impact Burst (sacks, TFL) ────────────────────────────────

export function ImpactBurst({ x }: { x: number }) {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {Array.from({ length: 8 }, (_, i) => {
        const angle = (i * 45 * Math.PI) / 180;
        const len = 24;
        return (
          <div
            key={i}
            className="absolute"
            style={{
              left: `${clamp(x, 5, 95)}%`,
              top: '50%',
              width: 3,
              height: len,
              backgroundColor: '#ef4444',
              borderRadius: 2,
              transform: `translate(-50%, -50%) rotate(${i * 45}deg)`,
              transformOrigin: 'center center',
              animation: 'impact-burst 0.4s ease-out forwards',
              opacity: 0.8,
            }}
          />
        );
      })}
    </div>
  );
}

// ── Turnover Shock Rings ─────────────────────────────────────

export function TurnoverShock({ x }: { x: number }) {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${clamp(x, 5, 95)}%`,
            top: '50%',
            width: 30 + i * 30,
            height: 30 + i * 30,
            transform: 'translate(-50%, -50%)',
            border: '2px solid #f59e0b',
            animation: `shock-ring 0.6s ease-out ${i * 0.12}s forwards`,
            opacity: 0,
          }}
        />
      ))}
    </div>
  );
}

// ── Touchdown Burst ──────────────────────────────────────────

export function TouchdownBurst({ x, teamColor }: { x: number; teamColor: string }) {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Green radial */}
      <div
        className="absolute rounded-full"
        style={{
          left: `${clamp(x, 5, 95)}%`,
          top: '50%',
          width: 80,
          height: 80,
          transform: 'translate(-50%, -50%)',
          background: 'radial-gradient(circle, rgba(34,197,94,0.5) 0%, transparent 70%)',
          animation: 'td-radial-burst 0.6s ease-out forwards',
        }}
      />
      {/* Gold expanding ring */}
      <div
        className="absolute rounded-full"
        style={{
          left: `${clamp(x, 5, 95)}%`,
          top: '50%',
          width: 50,
          height: 50,
          transform: 'translate(-50%, -50%)',
          border: `3px solid ${teamColor}`,
          animation: 'shock-ring 0.8s ease-out forwards',
          opacity: 0,
        }}
      />
    </div>
  );
}

// ── Deep Pass Spiral Lines ───────────────────────────────────

export function SpiralLines({ x }: { x: number }) {
  return (
    <div
      className="absolute"
      style={{
        left: `${clamp(x, 5, 95)}%`,
        top: '50%',
        transform: 'translate(-50%, -50%)',
        width: BALL_SIZE + 24,
        height: BALL_SIZE + 24,
        animation: 'spiral-rotate 0.6s linear infinite',
      }}
    >
      {[0, 90, 180, 270].map((deg) => (
        <div
          key={deg}
          className="absolute"
          style={{
            width: 2,
            height: 14,
            background: 'linear-gradient(to bottom, rgba(59,130,246,0.6), transparent)',
            top: 0,
            left: '50%',
            transformOrigin: `50% ${(BALL_SIZE + 24) / 2}px`,
            transform: `translateX(-50%) rotate(${deg}deg)`,
            borderRadius: 1,
          }}
        />
      ))}
    </div>
  );
}

// ── Kick Altitude Ghost (FG/XP only) ────────────────────────

export function KickAltitudeGhost({
  x, progress, abbrev, borderColor, flipLogo,
}: {
  x: number; progress: number; abbrev: string; borderColor: string; flipLogo?: boolean;
}) {
  // Ghost rises up on a parabolic arc: peak at t=0.5
  const altitude = Math.sin(progress * Math.PI);
  const ghostOpacity = 0.3 * altitude;
  const ghostY = 50 - altitude * 25; // rises up to 25% above center

  if (altitude < 0.1) return null;

  return (
    <div
      className="absolute"
      style={{
        left: `${clamp(x, 2, 98)}%`,
        top: `${ghostY}%`,
        transform: 'translate(-50%, -50%)',
        zIndex: 18,
        opacity: ghostOpacity,
      }}
    >
      <div
        style={{
          width: BALL_SIZE * 0.8,
          height: BALL_SIZE * 0.8,
          borderRadius: '50%',
          border: `2px solid ${borderColor}80`,
          backgroundColor: '#11182780',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <LogoImg
          abbrev={abbrev}
          size={BALL_SIZE * 0.8 - 8}
          flip={flipLogo}
          opacity={0.5}
        />
      </div>
    </div>
  );
}

// ── Decorative Arc (visual only) ─────────────────────────────

export function DecorativeArc({
  fromX, toX, playType, isSuccess, progress,
}: {
  fromX: number; toX: number; playType: string;
  isSuccess: boolean; progress: number;
}) {
  const midX = (fromX + toX) / 2;
  const dist = Math.abs(toX - fromX);

  if (playType === 'pass_complete' || playType === 'pass_incomplete') {
    const arcHeight = Math.min(dist * 0.5, 25);
    const color = playType === 'pass_complete' ? '#3b82f6' : '#ef4444';
    const endX = fromX + (toX - fromX) * Math.min(progress * 1.2, 1);
    const midArcX = (fromX + endX) / 2;
    return (
      <path
        d={`M ${fromX} 50 Q ${midArcX} ${50 - arcHeight * Math.min(progress * 1.5, 1)} ${endX} 50`}
        stroke={color}
        strokeWidth="1.5"
        fill="none"
        strokeDasharray="4 3"
        strokeLinecap="round"
        opacity={0.5 * Math.min(progress * 3, 1)}
      />
    );
  }

  if (playType === 'punt' || playType === 'kickoff') {
    const arcHeight = Math.min(dist * 0.7, 35);
    return (
      <path
        d={`M ${fromX} 50 Q ${midX} ${50 - arcHeight} ${toX} 50`}
        stroke="#fbbf24"
        strokeWidth="1.2"
        fill="none"
        strokeDasharray="3 4"
        strokeLinecap="round"
        opacity={0.4}
      />
    );
  }

  if (playType === 'field_goal' || playType === 'extra_point') {
    // Kick goes toward the opposite end zone from where the kicker stands
    const goalX = fromX > 50 ? 8.33 : 91.66;
    const arcH = playType === 'extra_point' ? 20 : 28;
    const midGoalX = (fromX + goalX) / 2;
    const color = isSuccess ? '#22c55e' : '#ef4444';
    return (
      <g>
        <path
          d={`M ${fromX} 50 Q ${midGoalX} ${50 - arcH} ${goalX} 50`}
          stroke={color}
          strokeWidth="1.2"
          fill="none"
          strokeDasharray="3 4"
          opacity="0.5"
        />
        <line x1={goalX} y1={25} x2={goalX} y2={75} stroke="#fbbf24" strokeWidth="0.6" opacity="0.3" />
      </g>
    );
  }

  return null;
}

// ── Outcome Marker ───────────────────────────────────────────

export function OutcomeMarker({
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

  if (lastPlay.isTouchdown) {
    text = 'TOUCHDOWN!';
    color = '#22c55e';
    size = 'lg';
  } else if (lastPlay.type === 'kickoff') {
    if (lastPlay.yardsGained === 0) {
      // Dynamic Kickoff tiered touchback labels
      const tbType = lastPlay.kickoffMeta?.touchbackType;
      if (tbType === 'endzone') {
        text = 'TOUCHBACK (35)';
      } else if (tbType === 'bounce') {
        text = 'TOUCHBACK (20)';
      } else if (tbType === 'short') {
        text = 'SHORT KICK — B40';
      } else {
        text = 'TOUCHBACK';
      }
      color = tbType === 'short' ? '#f59e0b' : '#94a3b8';
      size = 'md';
    } else {
      text = `+${lastPlay.yardsGained} YDS`;
      color = '#22c55e';
      size = 'sm';
    }
  } else if (lastPlay.type === 'pass_incomplete') {
    text = 'INCOMPLETE';
    color = '#ef4444';
    x = fromX - offDir * yardsToPercent(10);
  } else if (lastPlay.type === 'sack') {
    text = 'SACK';
    color = '#ef4444';
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
    // For missed FGs, possession has flipped — kicker is opposite of current possession
    const kicker = (lastPlay.type === 'field_goal' && !lastPlay.scoring)
      ? (possession === 'home' ? 'away' : 'home')
      : possession;
    const goalPostX = kicker === 'away' ? 91.66 : 8.33;
    text = lastPlay.scoring ? 'GOOD!' : 'NO GOOD';
    color = lastPlay.scoring ? '#22c55e' : '#ef4444';
    x = goalPostX;
  } else if (lastPlay.type === 'run' || lastPlay.type === 'scramble') {
    const yards = lastPlay.yardsGained;
    text = yards >= 0 ? `+${yards} YDS` : `${yards} YDS`;
    color = yards > 0 ? '#22c55e' : '#ef4444';
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
        top: '28%',
        transform: 'translate(-50%, -50%)',
        zIndex: 25,
        textAlign: 'center',
      }}
    >
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
