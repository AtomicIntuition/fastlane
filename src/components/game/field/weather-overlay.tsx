'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { WeatherConditions } from '@/lib/simulation/types';

interface WeatherOverlayProps {
  weather?: WeatherConditions | null;
}

interface RainDrop {
  x: number;
  y: number;
  speed: number;
  length: number;
  width: number;
}

interface SnowFlake {
  x: number;
  y: number;
  radius: number;
  speed: number;
  opacity: number;
  driftPhase: number;
  driftSpeed: number;
}

interface WindStreak {
  x: number;
  y: number;
  speed: number;
  length: number;
  opacity: number;
}

/**
 * Canvas-based weather particle system overlaid on the 2D field.
 * Renders rain, snow, wind streaks, and fog effects based on WeatherConditions.
 * Uses requestAnimationFrame for smooth 60fps animation.
 */
export function WeatherOverlay({ weather }: WeatherOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const particlesRef = useRef<{
    rain: RainDrop[];
    snow: SnowFlake[];
    wind: WindStreak[];
  }>({ rain: [], snow: [], wind: [] });
  const fogPhaseRef = useRef(0);
  const initializedForRef = useRef<string>('');

  const initParticles = useCallback((w: number, h: number, conditions: WeatherConditions) => {
    const key = `${conditions.type}-${conditions.precipitation}-${conditions.windSpeed}-${w}-${h}`;
    if (initializedForRef.current === key) return;
    initializedForRef.current = key;

    const particles = particlesRef.current;
    particles.rain = [];
    particles.snow = [];
    particles.wind = [];

    if (conditions.type === 'rain') {
      const count = Math.floor(200 + conditions.precipitation * 400);
      for (let i = 0; i < count; i++) {
        particles.rain.push({
          x: Math.random() * w * 1.5 - w * 0.25,
          y: Math.random() * h,
          speed: 4 + Math.random() * 6,
          length: 8 + Math.random() * 8,
          width: 1 + Math.random() * 0.5,
        });
      }
    }

    if (conditions.type === 'snow') {
      const count = Math.floor(100 + conditions.precipitation * 300);
      for (let i = 0; i < count; i++) {
        particles.snow.push({
          x: Math.random() * w,
          y: Math.random() * h,
          radius: 1 + Math.random() * 2,
          speed: 0.5 + Math.random() * 1.5,
          opacity: 0.4 + Math.random() * 0.4,
          driftPhase: Math.random() * Math.PI * 2,
          driftSpeed: 0.5 + Math.random() * 1.5,
        });
      }
    }

    // Wind streaks for any weather type when windy
    if (conditions.windSpeed > 15) {
      const count = Math.floor(20 + ((conditions.windSpeed - 15) / 20) * 80);
      for (let i = 0; i < count; i++) {
        particles.wind.push({
          x: Math.random() * w,
          y: Math.random() * h,
          speed: 2 + (conditions.windSpeed / 35) * 6,
          length: 20 + Math.random() * 40,
          opacity: 0.05 + Math.random() * 0.1,
        });
      }
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !weather) return;
    if (weather.type === 'clear' || weather.type === 'cloudy') return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Size canvas to container
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        canvas.width = width * window.devicePixelRatio;
        canvas.height = height * window.devicePixelRatio;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        // Reinit particles for new dimensions
        initializedForRef.current = '';
        initParticles(width, height, weather);
      }
    });
    resizeObserver.observe(canvas.parentElement!);

    const animate = () => {
      const w = canvas.width / window.devicePixelRatio;
      const h = canvas.height / window.devicePixelRatio;
      if (w === 0 || h === 0) {
        animFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      initParticles(w, h, weather);
      ctx.clearRect(0, 0, w, h);
      const particles = particlesRef.current;

      // ── Rain ─────────────────────────────────────────
      if (weather.type === 'rain' && particles.rain.length > 0) {
        const windAngle = (70 + (weather.windSpeed / 35) * 15) * (Math.PI / 180);
        const dx = Math.sin(windAngle);
        const dy = Math.cos(windAngle);

        ctx.strokeStyle = `rgba(180, 210, 255, ${0.25 + weather.precipitation * 0.15})`;
        ctx.lineWidth = 1;
        ctx.beginPath();

        for (const drop of particles.rain) {
          ctx.moveTo(drop.x, drop.y);
          ctx.lineTo(drop.x + dx * drop.length, drop.y + dy * drop.length);

          drop.x += dx * drop.speed;
          drop.y += dy * drop.speed;

          if (drop.y > h + drop.length) {
            drop.y = -drop.length;
            drop.x = Math.random() * w * 1.5 - w * 0.25;
          }
          if (drop.x > w + 20) {
            drop.x = -20;
          }
        }
        ctx.stroke();
      }

      // ── Snow ─────────────────────────────────────────
      if (weather.type === 'snow' && particles.snow.length > 0) {
        fogPhaseRef.current += 0.01;

        for (const flake of particles.snow) {
          ctx.fillStyle = `rgba(255, 255, 255, ${flake.opacity})`;
          ctx.beginPath();
          ctx.arc(
            flake.x + Math.sin(fogPhaseRef.current * flake.driftSpeed + flake.driftPhase) * 15,
            flake.y,
            flake.radius,
            0,
            Math.PI * 2,
          );
          ctx.fill();

          flake.y += flake.speed;
          flake.x += (weather.windSpeed / 35) * 0.5;

          if (flake.y > h + flake.radius) {
            flake.y = -flake.radius;
            flake.x = Math.random() * w;
          }
          if (flake.x > w + 10) flake.x = -10;
        }
      }

      // ── Wind streaks ─────────────────────────────────
      if (particles.wind.length > 0) {
        for (const streak of particles.wind) {
          ctx.strokeStyle = `rgba(200, 200, 200, ${streak.opacity})`;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(streak.x, streak.y);
          ctx.lineTo(streak.x + streak.length, streak.y);
          ctx.stroke();

          streak.x += streak.speed;
          if (streak.x > w + streak.length) {
            streak.x = -streak.length;
            streak.y = Math.random() * h;
          }
        }
      }

      // ── Fog ──────────────────────────────────────────
      if (weather.type === 'fog') {
        fogPhaseRef.current += 0.005;
        const fogOpacity = 0.12 + Math.sin(fogPhaseRef.current) * 0.04;
        ctx.fillStyle = `rgba(180, 190, 200, ${fogOpacity})`;
        ctx.fillRect(0, 0, w, h);
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      resizeObserver.disconnect();
      initializedForRef.current = '';
    };
  }, [weather, initParticles]);

  // Don't render for clear/cloudy or no weather
  if (!weather || weather.type === 'clear' || weather.type === 'cloudy') {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-[2] pointer-events-none"
      aria-hidden="true"
    />
  );
}
