'use client';

import { useState, useEffect } from 'react';

interface IntermissionCountdownProps {
  /** ISO timestamp when the intermission ends */
  endsAt: string;
}

export function IntermissionCountdown({ endsAt }: IntermissionCountdownProps) {
  const [remaining, setRemaining] = useState(() => {
    const ms = new Date(endsAt).getTime() - Date.now();
    return Math.max(0, ms);
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const ms = new Date(endsAt).getTime() - Date.now();
      setRemaining(Math.max(0, ms));
      if (ms <= 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [endsAt]);

  const totalSec = Math.ceil(remaining / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;

  if (remaining <= 0) {
    return (
      <p className="text-xs text-gold mt-2 tracking-wider uppercase font-bold animate-pulse">
        Starting soon...
      </p>
    );
  }

  return (
    <div className="text-center">
      <p className="text-xs text-text-muted tracking-wider uppercase mb-1">
        Next Game In
      </p>
      <p className="font-mono text-3xl sm:text-5xl font-black tabular-nums text-gold">
        {min}:{String(sec).padStart(2, '0')}
      </p>
    </div>
  );
}
