'use client';

import { useState, useEffect, useCallback } from 'react';

interface JumbotronMessage {
  id: string;
  message: string;
  type: string;
  durationSeconds: number;
  expiresAt: string;
  createdAt: string;
}

export function useJumbotron() {
  const [activeMessage, setActiveMessage] = useState<JumbotronMessage | null>(null);

  const fetchMessage = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/jumbotron');
      if (!res.ok) return;
      const data = await res.json();

      if (data.message) {
        // Check if expired client-side
        const expiresAt = new Date(data.message.expiresAt).getTime();
        if (expiresAt > Date.now()) {
          setActiveMessage(data.message);
        } else {
          setActiveMessage(null);
        }
      } else {
        setActiveMessage(null);
      }
    } catch {
      // Silently fail — jumbotron is non-critical
    }
  }, []);

  useEffect(() => {
    fetchMessage();
    const interval = setInterval(fetchMessage, 10_000);
    return () => clearInterval(interval);
  }, [fetchMessage]);

  // Auto-clear expired messages client-side
  useEffect(() => {
    if (!activeMessage) return;

    const expiresAt = new Date(activeMessage.expiresAt).getTime();
    const remaining = expiresAt - Date.now();

    if (remaining <= 0) {
      setActiveMessage(null);
      return;
    }

    const timer = setTimeout(() => setActiveMessage(null), remaining);
    return () => clearTimeout(timer);
  }, [activeMessage]);

  return { activeMessage };
}
