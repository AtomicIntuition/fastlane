'use client';

import { useEffect, useState, useRef, useMemo } from 'react';

type CelebType = 'touchdown' | 'turnover' | 'field_goal' | 'safety' | null;
type TurnoverKind = 'interception' | 'fumble' | 'fumble_recovery' | 'turnover_on_downs' | null;

interface CelebrationOverlayProps {
  type: CelebType;
  /** Scoring team's primary color (for confetti) */
  teamColor: string;
  /** Unique key to re-trigger animations */
  celebKey: number;
  /** Specific turnover type for sub-label */
  turnoverKind?: TurnoverKind;
}

/**
 * Event-triggered visual overlays for big moments:
 * - Touchdown: confetti + golden "TOUCHDOWN!" text + white flash + radial burst
 * - Turnover: screen shake + red flash + shock rings + "TURNOVER" text
 * - Field goal: golden goalposts flash + "FIELD GOAL - 3 PTS"
 * - Safety: purple flash + "SAFETY - 2 PTS"
 */
export function CelebrationOverlay({ type, teamColor, celebKey, turnoverKind }: CelebrationOverlayProps) {
  const [active, setActive] = useState(false);
  const prevKeyRef = useRef(celebKey);

  useEffect(() => {
    if (celebKey === prevKeyRef.current || !type) return;
    prevKeyRef.current = celebKey;

    setActive(true);
    const duration = type === 'touchdown' ? 3500 : type === 'turnover' ? 2000 : 1800;
    const timer = setTimeout(() => setActive(false), duration);
    return () => clearTimeout(timer);
  }, [celebKey, type]);

  if (!active || !type) return null;

  return (
    <div className="absolute inset-0 z-40 pointer-events-none overflow-hidden">
      {type === 'touchdown' && <TouchdownCelebration teamColor={teamColor} />}
      {type === 'turnover' && <TurnoverAlert kind={turnoverKind} />}
      {type === 'field_goal' && <FieldGoalCelebration />}
      {type === 'safety' && <SafetyCelebration />}
    </div>
  );
}

// ── Touchdown Celebration ──────────────────────────────────

function TouchdownCelebration({ teamColor }: { teamColor: string }) {
  const confettiPieces = useMemo(() => (
    Array.from({ length: 80 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 1.0,
      duration: 1.8 + Math.random() * 1.2,
      color: [teamColor, '#ffd700', '#ffffff', '#d4af37', teamColor][i % 5],
      size: 4 + Math.random() * 8,
      rotation: Math.random() * 360,
      drift: (Math.random() - 0.5) * 80,
      glow: i % 3 === 0,
    }))
  ), [teamColor]);

  return (
    <>
      {/* Bright white screen flash */}
      <div
        className="absolute inset-0"
        style={{
          background: 'white',
          animation: 'td-screen-flash 0.4s ease-out forwards',
        }}
      />

      {/* Team color wash */}
      <div className="absolute inset-0 td-flash-anim" />

      {/* Radial burst effect from center */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${teamColor}30 0%, transparent 70%)`,
          animation: 'td-radial-burst 1.5s ease-out forwards',
        }}
      />

      {/* Confetti with glow effect */}
      {confettiPieces.map((piece) => (
        <div
          key={piece.id}
          className="absolute confetti-fall-anim"
          style={{
            left: `${piece.left}%`,
            top: '-10px',
            width: `${piece.size}px`,
            height: `${piece.size}px`,
            backgroundColor: piece.color,
            borderRadius: piece.id % 3 === 0 ? '50%' : '1px',
            animationDelay: `${piece.delay}s`,
            animationDuration: `${piece.duration}s`,
            boxShadow: piece.glow ? `0 0 8px ${piece.color}, 0 0 16px ${piece.color}40` : 'none',
            '--confetti-drift': `${piece.drift}px`,
            '--confetti-rotation': `${piece.rotation}deg`,
          } as React.CSSProperties}
        />
      ))}

      {/* "TOUCHDOWN!" text with scale+fade entrance */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <span
            className="td-text-pulse-anim text-3xl sm:text-5xl lg:text-6xl font-black tracking-wider super-bowl-text block"
            style={{
              animation: 'td-text-entrance 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards, td-text-pulse 1.5s ease-in-out 0.5s infinite',
            }}
          >
            TOUCHDOWN!
          </span>
          <span
            className="block text-sm sm:text-lg font-bold mt-2 opacity-0"
            style={{
              color: teamColor,
              textShadow: `0 0 12px ${teamColor}60`,
              animation: 'coin-result-fade 0.5s ease-out 0.6s forwards',
            }}
          >
            6 PTS
          </span>
        </div>
      </div>
    </>
  );
}

// ── Turnover Alert ─────────────────────────────────────────

function TurnoverAlert({ kind }: { kind?: TurnoverKind }) {
  const label = kind === 'interception' ? 'INTERCEPTED!'
    : kind === 'fumble' || kind === 'fumble_recovery' ? 'FUMBLE!'
    : kind === 'turnover_on_downs' ? 'TURNOVER ON DOWNS'
    : 'TURNOVER';

  return (
    <>
      {/* Red flash */}
      <div
        className="absolute inset-0"
        style={{
          background: 'rgba(239, 68, 68, 0.15)',
          animation: 'turnover-flash 0.8s ease-out forwards',
        }}
      />

      {/* Expanding shock rings */}
      {[0, 0.15, 0.3].map((delay, i) => (
        <div
          key={i}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            width: '60px',
            height: '60px',
            border: '2px solid rgba(239, 68, 68, 0.5)',
            animation: `shock-ring 0.8s ease-out ${delay}s forwards`,
            opacity: 0,
          }}
        />
      ))}

      {/* Screen shake applied via parent class */}
      <div className="absolute inset-0 shake-anim">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <span className="turnover-text-anim text-2xl sm:text-4xl lg:text-5xl font-black tracking-wider text-red-500 block"
              style={{ textShadow: '0 0 20px rgba(239, 68, 68, 0.6)' }}
            >
              {label}
            </span>
            <span
              className="block text-xs sm:text-sm font-bold text-red-400/70 mt-1 uppercase tracking-widest opacity-0"
              style={{ animation: 'coin-result-fade 0.4s ease-out 0.3s forwards' }}
            >
              Change of Possession
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Field Goal Celebration ─────────────────────────────────

function FieldGoalCelebration() {
  return (
    <>
      {/* Golden shimmer flash */}
      <div
        className="absolute inset-0"
        style={{
          background: 'rgba(212, 175, 55, 0.08)',
          animation: 'turnover-flash 0.6s ease-out forwards',
        }}
      />

      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center" style={{ animation: 'coin-result-fade 0.5s ease-out forwards' }}>
          <span className="text-xl sm:text-3xl font-black tracking-wider text-gold block"
            style={{ textShadow: '0 0 16px rgba(212, 175, 55, 0.5)' }}
          >
            FIELD GOAL
          </span>
          <span className="block text-sm sm:text-lg font-bold text-gold/70 mt-1">
            3 PTS
          </span>
        </div>
      </div>
    </>
  );
}

// ── Safety Celebration ─────────────────────────────────────

function SafetyCelebration() {
  return (
    <>
      {/* Purple flash */}
      <div
        className="absolute inset-0"
        style={{
          background: 'rgba(147, 51, 234, 0.15)',
          animation: 'turnover-flash 0.8s ease-out forwards',
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center" style={{ animation: 'coin-result-fade 0.5s ease-out forwards' }}>
          <span className="text-xl sm:text-3xl font-black tracking-wider text-purple-400 block"
            style={{ textShadow: '0 0 16px rgba(147, 51, 234, 0.5)' }}
          >
            SAFETY
          </span>
          <span className="block text-sm sm:text-lg font-bold text-purple-400/70 mt-1">
            2 PTS
          </span>
        </div>
      </div>
    </>
  );
}
