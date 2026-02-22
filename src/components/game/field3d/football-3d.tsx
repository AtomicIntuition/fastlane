'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { PlayResult } from '@/lib/simulation/types';
import { calculateBallPosition3D } from '@/lib/animation/ball-trajectory';
import type { Phase } from '@/lib/animation/play-animation';
import { DEVELOPMENT_MS, getKickoffDevMs } from '@/lib/animation/play-animation';

interface Football3DProps {
  ballPosition: number;
  prevBallPosition: number;
  possession: 'home' | 'away';
  lastPlay: PlayResult | null;
  phase: Phase;
  playKey: number;
}

/**
 * 3D football with spiral rotation and parabolic arc trajectory.
 * Elongated sphere with brown material and lace stripe.
 */
export function Football3D({
  ballPosition,
  prevBallPosition,
  possession,
  lastPlay,
  phase,
  playKey,
}: Football3DProps) {
  const meshRef = useRef<THREE.Group>(null);
  const animStartRef = useRef(0);
  const prevKeyRef = useRef(playKey);

  // Detect new play
  if (playKey !== prevKeyRef.current) {
    prevKeyRef.current = playKey;
    animStartRef.current = performance.now();
  }

  // Football material
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#8B4513',
    roughness: 0.7,
    metalness: 0.1,
  }), []);

  // Lace material
  const laceMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.5,
    metalness: 0,
  }), []);

  useFrame(() => {
    if (!meshRef.current) return;

    const group = meshRef.current;

    if (phase === 'development' && lastPlay) {
      const devDuration = lastPlay.type === 'kickoff' ? getKickoffDevMs(lastPlay) : DEVELOPMENT_MS;
      const t = Math.min((performance.now() - animStartRef.current) / devDuration, 1);

      const pos3d = calculateBallPosition3D(
        lastPlay, prevBallPosition, ballPosition, t, possession
      );

      group.position.set(pos3d.x, pos3d.y, pos3d.z);

      // Spiral rotation for passes and kicks
      const isPass = lastPlay.type === 'pass_complete' || lastPlay.type === 'pass_incomplete';
      const isKick = lastPlay.type === 'kickoff' || lastPlay.type === 'punt' ||
                     lastPlay.type === 'field_goal' || lastPlay.type === 'extra_point';
      const isPlayAction = lastPlay.call === 'play_action_short' || lastPlay.call === 'play_action_deep';
      const holdEnd = isPlayAction ? 0.42 : 0.32;

      if (isPass && t >= holdEnd) {
        const spiralT = (t - holdEnd) / (1 - holdEnd);
        group.rotation.z = spiralT * Math.PI * 4;
        group.rotation.x = 0.3;
      } else if (isKick) {
        group.rotation.z = t * Math.PI * 6;
        group.rotation.x = 0.3;
      } else {
        // Run plays: slight bobble
        group.rotation.z = Math.sin(t * 10) * 0.1;
        group.rotation.x = 0;
      }

      group.visible = true;
    } else if (phase === 'idle' || phase === 'pre_snap' || phase === 'snap') {
      // Position at LOS
      const worldX = (ballPosition / 100) * 120 - 60;
      group.position.set(worldX, 0.4, 0);
      group.rotation.set(0, 0, 0);
      group.visible = phase !== 'idle';
    } else if (phase === 'result' || phase === 'post_play') {
      // Keep at final position
      const worldX = (ballPosition / 100) * 120 - 60;
      group.position.x = THREE.MathUtils.lerp(group.position.x, worldX, 0.1);
      group.position.y = THREE.MathUtils.lerp(group.position.y, 0.4, 0.1);
      group.rotation.z *= 0.95;
      group.visible = true;
    }
  });

  return (
    <group ref={meshRef}>
      {/* Elongated football body */}
      <mesh material={material} scale={[0.55, 0.35, 0.35]}>
        <sphereGeometry args={[1, 16, 12]} />
      </mesh>
      {/* Lace stripe */}
      <mesh material={laceMaterial} position={[0, 0.33, 0]} scale={[0.35, 0.02, 0.02]}>
        <boxGeometry args={[1, 1, 1]} />
      </mesh>
      {/* Lace cross-stitches */}
      {[0, 1, 2, 3].map(i => (
        <mesh key={i} material={laceMaterial}
          position={[-0.12 + i * 0.08, 0.34, 0]}
          scale={[0.01, 0.06, 0.01]}
        >
          <boxGeometry args={[1, 1, 1]} />
        </mesh>
      ))}
    </group>
  );
}
