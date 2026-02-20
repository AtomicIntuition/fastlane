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
 * Small, clean football marker — shows ball position between plays.
 * No big SVG or golden glow. Just a simple football-shaped dot.
 */
export function BallMarker({ leftPercent, topPercent = 50, direction, isKicking, hidden = false }: BallMarkerProps) {
  const [snap, setSnap] = useState(false);
  const prevLeft = useRef(leftPercent);

  // Trigger snap bounce on ball movement
  useEffect(() => {
    if (Math.abs(leftPercent - prevLeft.current) > 0.5) {
      setSnap(true);
      const timer = setTimeout(() => setSnap(false), 300);
      prevLeft.current = leftPercent;
      return () => clearTimeout(timer);
    }
  }, [leftPercent]);

  const tiltDeg = direction === 'right' ? -20 : direction === 'left' ? 20 : 0;

  return (
    <div
      className="absolute z-20 pointer-events-none"
      style={{
        left: `${leftPercent}%`,
        top: `${topPercent}%`,
        transition: hidden
          ? 'opacity 150ms ease-out'
          : 'left 600ms cubic-bezier(0.34, 1.56, 0.64, 1), top 400ms ease-out, opacity 200ms ease-in',
        transform: `translate(-50%, -50%)${snap ? ' scale(1.2)' : ''}`,
        opacity: hidden ? 0 : 1,
      }}
    >
      {/* Simple football shape */}
      <div
        style={{
          width: 16,
          height: 10,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #A0522D 0%, #8B4513 50%, #6B3410 100%)',
          border: '1px solid #5C2D06',
          boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
          transform: `rotate(${tiltDeg}deg)`,
          transition: 'transform 400ms ease-out',
          position: 'relative',
        }}
      >
        {/* Lace */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '25%',
            right: '25%',
            height: 1,
            background: 'rgba(255,255,255,0.7)',
            transform: 'translateY(-50%)',
          }}
        />
      </div>
    </div>
  );
}
