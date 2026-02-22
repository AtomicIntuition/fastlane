'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { getTeamLogoUrl } from '@/lib/utils/team-logos';

interface FieldGroundProps {
  homeTeam: { abbreviation: string; primaryColor: string };
  awayTeam: { abbreviation: string; primaryColor: string };
}

/**
 * 3D field plane with procedural CanvasTexture — grass stripes, yard lines,
 * numbers, hash marks, end zone coloring with team abbreviations.
 * Single draw call via a pre-rendered texture.
 */
export function FieldGround({ homeTeam, awayTeam }: FieldGroundProps) {
  const texture = useMemo(() => {
    const width = 2400;
    const height = 1067;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    // Field dimensions: 120 yards x 53.33 yards → each yard = 20px wide, 20px tall
    const yardW = width / 120;
    const yardH = height / 53.33;

    // ── Base grass with alternating mowed stripes (every 5 yards)
    for (let i = 0; i < 120; i += 5) {
      ctx.fillStyle = (Math.floor(i / 5) % 2 === 0) ? '#2d5a27' : '#316130';
      ctx.fillRect(i * yardW, 0, 5 * yardW, height);
    }

    // ── Green tint overlay
    ctx.fillStyle = 'rgba(42, 85, 37, 0.3)';
    ctx.fillRect(0, 0, width, height);

    // ── End zones
    // Away (left, 0-10 yards)
    ctx.fillStyle = awayTeam.primaryColor;
    ctx.globalAlpha = 0.6;
    ctx.fillRect(0, 0, 10 * yardW, height);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.globalAlpha = 1;
    ctx.fillRect(0, 0, 10 * yardW, height);

    // Away team abbreviation
    ctx.save();
    ctx.translate(5 * yardW, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.font = `bold ${yardW * 4}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillText(awayTeam.abbreviation, 0, 0);
    ctx.restore();

    // Home (right, 110-120 yards)
    ctx.fillStyle = homeTeam.primaryColor;
    ctx.globalAlpha = 0.6;
    ctx.fillRect(110 * yardW, 0, 10 * yardW, height);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.globalAlpha = 1;
    ctx.fillRect(110 * yardW, 0, 10 * yardW, height);

    // Home team abbreviation
    ctx.save();
    ctx.translate(115 * yardW, height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.font = `bold ${yardW * 4}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillText(homeTeam.abbreviation, 0, 0);
    ctx.restore();

    // ── Goal lines
    ctx.strokeStyle = 'white';
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(10 * yardW, 0); ctx.lineTo(10 * yardW, height);
    ctx.moveTo(110 * yardW, 0); ctx.lineTo(110 * yardW, height);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // ── 10-yard lines
    const yardNumbers = [10, 20, 30, 40, 50, 40, 30, 20, 10];
    for (let i = 1; i <= 9; i++) {
      const x = (10 + i * 10) * yardW;
      const isMidfield = i === 5;
      ctx.strokeStyle = 'white';
      ctx.globalAlpha = isMidfield ? 0.5 : 0.3;
      ctx.lineWidth = isMidfield ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // ── Hash marks (every yard)
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 1;
    for (let yard = 1; yard <= 99; yard++) {
      if (yard % 10 === 0) continue;
      const x = (10 + yard) * yardW;

      // Top hash (~1/3 from top)
      ctx.globalAlpha = 0.15;
      ctx.beginPath();
      ctx.moveTo(x, height * 0.30); ctx.lineTo(x, height * 0.33);
      ctx.stroke();

      // Bottom hash (~1/3 from bottom)
      ctx.beginPath();
      ctx.moveTo(x, height * 0.67); ctx.lineTo(x, height * 0.70);
      ctx.stroke();

      // Sideline ticks
      ctx.globalAlpha = 0.1;
      ctx.beginPath();
      ctx.moveTo(x, height * 0.04); ctx.lineTo(x, height * 0.06);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, height * 0.94); ctx.lineTo(x, height * 0.96);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // ── Yard numbers (top and bottom)
    ctx.font = `900 ${yardW * 3.2}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (let i = 0; i < yardNumbers.length; i++) {
      const x = (10 + (i + 1) * 10) * yardW;
      ctx.fillText(String(yardNumbers[i]), x, height * 0.14);
      ctx.fillText(String(yardNumbers[i]), x, height * 0.86);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }, [homeTeam.primaryColor, homeTeam.abbreviation, awayTeam.primaryColor, awayTeam.abbreviation]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
      <planeGeometry args={[120, 53.33]} />
      <meshStandardMaterial map={texture} roughness={0.9} metalness={0} />
    </mesh>
  );
}
