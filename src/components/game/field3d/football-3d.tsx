'use client';

import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { PlayResult } from '@/lib/simulation/types';
import type { Phase, EntityState } from '@/lib/animation/types';
import {
  computeDevelopment, getSnapPositions, getIdleEntities,
  getDevelopmentMs, PRE_SNAP_MS, SNAP_MS, fieldPctToWorld,
} from '@/lib/animation/choreographer';

interface Football3DProps {
  ballPosition: number;
  prevBallPosition: number;
  possession: 'home' | 'away';
  lastPlay: PlayResult | null;
  phase: Phase;
  playKey: number;
}

/**
 * 3D football — position driven by choreographer ball ownership.
 * Ball is ALWAYS at its owner's position when held, or on a flight arc.
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
  const snapOffRef = useRef<EntityState[]>([]);
  const snapDefRef = useRef<EntityState[]>([]);
  const offDir = possession === 'away' ? -1 : 1;
  const losX = prevBallPosition;

  // Materials
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#8B4513', roughness: 0.7, metalness: 0.1,
  }), []);
  const laceMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ffffff', roughness: 0.5, metalness: 0,
  }), []);

  // On new play: compute snap positions
  useEffect(() => {
    if (playKey === prevKeyRef.current || !lastPlay) return;
    prevKeyRef.current = playKey;
    animStartRef.current = performance.now();
    const snap = getSnapPositions(lastPlay, losX, offDir);
    snapOffRef.current = snap.offense;
    snapDefRef.current = snap.defense;
  }, [playKey, lastPlay, losX, offDir]);

  useFrame(() => {
    if (!meshRef.current) return;
    const group = meshRef.current;

    if (phase === 'idle') {
      // Show ball at current position when idle
      const worldX = (ballPosition / 100) * 120 - 60;
      group.position.set(worldX, 0.4, 0);
      group.rotation.set(0, 0, 0);
      group.visible = false;
      return;
    }

    if (!lastPlay) return;

    const ctx = { play: lastPlay, losX, toX: ballPosition, offDir, possession };

    if (phase === 'development') {
      const devMs = getDevelopmentMs(lastPlay);
      const devStart = PRE_SNAP_MS + SNAP_MS;
      const elapsed = performance.now() - animStartRef.current;
      const t = Math.min(Math.max((elapsed - devStart) / devMs, 0), 1);

      const frame = computeDevelopment(t, ctx, snapOffRef.current, snapDefRef.current);

      // Position ball from choreographer
      const ballWorld = fieldPctToWorld(frame.ball.x, frame.ball.y);
      group.position.x = ballWorld.x;
      group.position.y = Math.max(0.2, frame.ball.height);
      group.position.z = ballWorld.z;

      // Rotation based on ball state
      if (frame.ball.spin > 0) {
        group.rotation.z += frame.ball.spin * 0.02;
        // Tilt toward target on passes/kicks
        group.rotation.x = frame.ball.owner.type === 'flight' ? -0.3 : 0.2;
      } else if (frame.ball.owner.type === 'held') {
        group.rotation.z = Math.sin(elapsed * 0.01) * 0.05;
        group.rotation.x = 0;
      } else {
        group.rotation.z *= 0.95;
        group.rotation.x *= 0.95;
      }
      group.visible = true;

    } else if (phase === 'pre_snap' || phase === 'snap') {
      // Ball at center/holder position
      if (snapOffRef.current.length > 0) {
        const centerIdx = snapOffRef.current.findIndex(p => p.role === 'C' || p.role === 'LS' || p.role === 'H');
        const holder = snapOffRef.current[centerIdx >= 0 ? centerIdx : 0];
        const world = fieldPctToWorld(holder.x, holder.y);
        group.position.set(world.x, 0.4, world.z);
        group.rotation.set(0, 0, 0);
      }
      group.visible = true;

    } else if (phase === 'result' || phase === 'post_play') {
      // Freeze at end of development
      if (snapOffRef.current.length > 0) {
        const frame = computeDevelopment(1, ctx, snapOffRef.current, snapDefRef.current);
        const ballWorld = fieldPctToWorld(frame.ball.x, frame.ball.y);
        group.position.x = ballWorld.x;
        group.position.y = Math.max(0.2, frame.ball.height);
        group.position.z = ballWorld.z;
        group.rotation.z *= 0.9;
        group.rotation.x *= 0.9;
      }
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
