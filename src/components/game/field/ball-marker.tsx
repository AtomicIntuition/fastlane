'use client';

import { useEffect, useRef, useState } from 'react';

interface BallMarkerProps {
  /** Absolute field percentage 0-100 (0 = left/away endzone, 100 = right/home endzone) */
  leftPercent: number;
  /** Vertical position as percentage (default 50 = centered) */
  topPercent?: number;
  /** Direction of last play: 'left' | 'right' | null */
  direction: 'left' | 'right' | null;
  /** Whether a kick is in the air (punt/kickoff/FG) */
  isKicking: boolean;
  /** When true, ball fades out (PlayScene is animating its own ball) */
  hidden?: boolean;
}

/**
 * Football-shaped SVG ball marker with golden glow, shadow,
 * smooth CSS transitions, and directional tilt.
 */
export function BallMarker({ leftPercent, topPercent = 50, direction, isKicking, hidden = false }: BallMarkerProps) {
  const [launching, setLaunching] = useState(false);
  const [snap, setSnap] = useState(false);
  const prevKicking = useRef(false);
  const prevLeft = useRef(leftPercent);

  useEffect(() => {
    if (isKicking && !prevKicking.current) {
      setLaunching(true);
      const timer = setTimeout(() => setLaunching(false), 1500);
      return () => clearTimeout(timer);
    }
    prevKicking.current = isKicking;
  }, [isKicking]);

  // Trigger snap bounce on ball movement
  useEffect(() => {
    if (Math.abs(leftPercent - prevLeft.current) > 0.5) {
      setSnap(true);
      const timer = setTimeout(() => setSnap(false), 300);
      prevLeft.current = leftPercent;
      return () => clearTimeout(timer);
    }
  }, [leftPercent]);

  const tiltDeg = direction === 'right' ? -15 : direction === 'left' ? 15 : 0;

  return (
    <div
      className="absolute z-20 pointer-events-none"
      style={{
        left: `${leftPercent}%`,
        top: `${topPercent}%`,
        transition: hidden
          ? 'opacity 150ms ease-out'
          : 'left 600ms cubic-bezier(0.34, 1.56, 0.64, 1), top 400ms ease-out, opacity 200ms ease-in',
        transform: `translate(-50%, -50%)${snap ? ' scale(1.15)' : ''}`,
        opacity: hidden ? 0 : 1,
      }}
    >
      {/* Shadow beneath ball */}
      <div
        className="absolute left-1/2 -translate-x-1/2 rounded-full"
        style={{
          bottom: '-4px',
          width: '20px',
          height: '6px',
          background: 'rgba(0,0,0,0.4)',
          filter: 'blur(3px)',
        }}
      />

      {/* Football SVG */}
      <div
        className={launching ? 'ball-launch-anim' : ''}
        style={{
          transform: `rotate(${tiltDeg}deg)`,
          transition: 'transform 400ms ease-out',
          filter: 'drop-shadow(0 0 8px rgba(212, 175, 55, 0.6)) drop-shadow(0 0 16px rgba(212, 175, 55, 0.3))',
        }}
      >
        <svg
          width="32"
          height="20"
          viewBox="0 0 32 20"
          className="w-6 h-4 sm:w-8 sm:h-5 lg:w-10 lg:h-6"
          aria-label="Football"
        >
          {/* Ball body */}
          <ellipse
            cx="16"
            cy="10"
            rx="14"
            ry="8"
            fill="#8B4513"
            stroke="#5C2D06"
            strokeWidth="1"
          />
          {/* Darker brown gradient overlay */}
          <ellipse
            cx="16"
            cy="10"
            rx="14"
            ry="8"
            fill="url(#football-gradient)"
          />
          {/* White lacing - center stripe */}
          <line x1="10" y1="10" x2="22" y2="10" stroke="white" strokeWidth="1.2" opacity="0.9" />
          {/* Lace crosses */}
          <line x1="12" y1="7.5" x2="12" y2="12.5" stroke="white" strokeWidth="0.8" opacity="0.8" />
          <line x1="14.5" y1="7" x2="14.5" y2="13" stroke="white" strokeWidth="0.8" opacity="0.8" />
          <line x1="17.5" y1="7" x2="17.5" y2="13" stroke="white" strokeWidth="0.8" opacity="0.8" />
          <line x1="20" y1="7.5" x2="20" y2="12.5" stroke="white" strokeWidth="0.8" opacity="0.8" />
          {/* Specular highlight */}
          <ellipse cx="14" cy="7" rx="6" ry="3" fill="white" opacity="0.1" />
          <defs>
            <linearGradient id="football-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#A0522D" stopOpacity="0.4" />
              <stop offset="50%" stopColor="#8B4513" stopOpacity="0" />
              <stop offset="100%" stopColor="#3E1A00" stopOpacity="0.5" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  );
}
