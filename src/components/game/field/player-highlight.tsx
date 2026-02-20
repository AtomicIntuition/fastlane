'use client';

import { useEffect, useState, useRef } from 'react';

interface PlayerHighlightProps {
  /** Player name to display, e.g. "T. Kelce" */
  playerName: string | null;
  /** Jersey number */
  jerseyNumber: number | null;
  /** Team primary color for badge background */
  teamColor: string;
  /** Absolute field % for positioning near ball */
  ballPercent: number;
  /** Unique key to re-trigger animation */
  highlightKey: number;
}

/**
 * Popup showing the key player's name on notable plays.
 * Pill-shaped badge with team color background, positioned near the ball marker.
 */
export function PlayerHighlight({
  playerName,
  jerseyNumber,
  teamColor,
  ballPercent,
  highlightKey,
}: PlayerHighlightProps) {
  const [visible, setVisible] = useState(false);
  const prevKeyRef = useRef(highlightKey);

  useEffect(() => {
    if (highlightKey === prevKeyRef.current || !playerName) return;
    prevKeyRef.current = highlightKey;

    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 2100);
    return () => clearTimeout(timer);
  }, [highlightKey, playerName]);

  if (!visible || !playerName) return null;

  // Keep badge from clipping off edges
  const clampedLeft = Math.max(10, Math.min(90, ballPercent));

  return (
    <div
      className="absolute z-30 pointer-events-none highlight-popup-anim"
      style={{
        left: `${clampedLeft}%`,
        bottom: '58%',
        transform: 'translateX(-50%)',
      }}
    >
      <div
        className="rounded-full px-3 py-1 whitespace-nowrap"
        style={{
          backgroundColor: teamColor,
          boxShadow: `0 0 12px ${teamColor}80, 0 2px 8px rgba(0,0,0,0.4)`,
        }}
      >
        <span className="text-white text-[10px] sm:text-xs font-bold drop-shadow-sm">
          {jerseyNumber != null && `#${jerseyNumber} `}
          {playerName}
        </span>
      </div>
    </div>
  );
}
