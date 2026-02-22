'use client';

import { useRef, useMemo, useEffect, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { PlayResult } from '@/lib/simulation/types';
import {
  computeFormationPositions,
  animateOffense,
  animateDefense,
  getKickoffDevMs,
  fieldPctToWorld,
  DEVELOPMENT_MS,
  type DotPos,
  type Phase,
} from '@/lib/animation/play-animation';
import { easeOutCubic } from '@/lib/animation/ball-trajectory';

interface PlayerModelsProps {
  ballPosition: number;      // field percentage
  prevBallPosition: number;  // previous field percentage
  possession: 'home' | 'away';
  offenseColor: string;
  defenseColor: string;
  lastPlay: PlayResult | null;
  playKey: number;
  phase: Phase;
}

// Role-based sizing
function getCapsuleRadius(role: string): number {
  const linemen = ['C', 'LG', 'RG', 'LT', 'RT', 'DE', 'DT', 'NT'];
  const skill = ['WR', 'CB', 'NCB', 'S'];
  if (linemen.includes(role)) return 0.5;
  if (skill.includes(role)) return 0.35;
  return 0.4;
}

/**
 * 22 capsule-geometry players with role-based sizing and team colors.
 * Positions driven by formation data + phase-based animation via refs (no re-renders).
 */
export function PlayerModels({
  ballPosition,
  prevBallPosition,
  possession,
  offenseColor,
  defenseColor,
  lastPlay,
  playKey,
  phase,
}: PlayerModelsProps) {
  const offDir = possession === 'away' ? -1 : 1;
  const losX = prevBallPosition;

  // Refs for 22 meshes
  const offRefs = useRef<(THREE.Mesh | null)[]>([]);
  const defRefs = useRef<(THREE.Mesh | null)[]>([]);

  // Current animation state
  const offSnapRef = useRef<DotPos[]>([]);
  const defSnapRef = useRef<DotPos[]>([]);
  const offCurrentRef = useRef<DotPos[]>([]);
  const defCurrentRef = useRef<DotPos[]>([]);
  const animStartRef = useRef(0);
  const prevKeyRef = useRef(playKey);

  // Shared materials
  const offMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: offenseColor,
    roughness: 0.6,
    metalness: 0.1,
  }), [offenseColor]);

  const defMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: defenseColor,
    roughness: 0.6,
    metalness: 0.1,
  }), [defenseColor]);

  // Shared geometries by role type
  const geoLarge = useMemo(() => new THREE.CapsuleGeometry(0.5, 1.2, 4, 8), []);
  const geoMedium = useMemo(() => new THREE.CapsuleGeometry(0.4, 1.2, 4, 8), []);
  const geoSmall = useMemo(() => new THREE.CapsuleGeometry(0.35, 1.2, 4, 8), []);

  function getGeo(role: string): THREE.CapsuleGeometry {
    const r = getCapsuleRadius(role);
    if (r >= 0.5) return geoLarge;
    if (r <= 0.35) return geoSmall;
    return geoMedium;
  }

  // Initialize with idle positions
  const initPositions = useCallback(() => {
    const positions: DotPos[] = Array.from({ length: 11 }, (_, i) => ({
      x: 50 + (i - 5) * 2, y: 50, role: 'OFF',
    }));
    offCurrentRef.current = positions;
    defCurrentRef.current = positions.map(p => ({ ...p, role: 'DEF' }));
  }, []);

  useEffect(() => {
    initPositions();
  }, [initPositions]);

  // Detect new play → compute formation
  useEffect(() => {
    if (playKey === prevKeyRef.current || !lastPlay) return;
    prevKeyRef.current = playKey;

    const { offPositions, defPositions } = computeFormationPositions(lastPlay, losX, offDir);
    offSnapRef.current = offPositions;
    defSnapRef.current = defPositions;
    animStartRef.current = performance.now();
  }, [playKey, lastPlay, losX, offDir]);

  // Phase-driven position updates
  useEffect(() => {
    if (phase === 'idle' || phase === 'post_play') {
      // Return to relaxed positions near ball
      const defaultPos: DotPos[] = Array.from({ length: 11 }, (_, i) => ({
        x: ballPosition + (i - 5) * 1.5 + (phase === 'idle' ? 5 : 0),
        y: 30 + i * 4,
        role: 'OFF',
      }));
      offCurrentRef.current = defaultPos;
      defCurrentRef.current = defaultPos.map(p => ({ ...p, x: p.x - 8, role: 'DEF' }));
    } else if (phase === 'pre_snap' || phase === 'snap') {
      if (offSnapRef.current.length > 0) {
        offCurrentRef.current = offSnapRef.current;
        defCurrentRef.current = defSnapRef.current;
      }
    }
  }, [phase, ballPosition]);

  // RAF-driven animation during development phase
  useFrame(() => {
    if (!lastPlay) return;

    if (phase === 'development' && offSnapRef.current.length > 0) {
      const devDuration = lastPlay.type === 'kickoff' ? getKickoffDevMs(lastPlay) : DEVELOPMENT_MS;
      const t = Math.min((performance.now() - animStartRef.current) / devDuration, 1);
      const eased = easeOutCubic(t);

      const newOff = animateOffense(
        lastPlay.type, offSnapRef.current, t, eased,
        prevBallPosition, ballPosition, lastPlay, offDir
      );
      const newDef = animateDefense(
        lastPlay.type, defSnapRef.current, t, eased,
        prevBallPosition, ballPosition, offDir
      );

      offCurrentRef.current = newOff;
      defCurrentRef.current = newDef;
    }

    // Update mesh positions from refs
    offCurrentRef.current.forEach((pos, i) => {
      const mesh = offRefs.current[i];
      if (mesh) {
        const world = fieldPctToWorld(pos.x, pos.y);
        mesh.position.x = THREE.MathUtils.lerp(mesh.position.x, world.x, 0.15);
        mesh.position.z = THREE.MathUtils.lerp(mesh.position.z, world.z, 0.15);
        mesh.position.y = 0.9; // Standing height
      }
    });

    defCurrentRef.current.forEach((pos, i) => {
      const mesh = defRefs.current[i];
      if (mesh) {
        const world = fieldPctToWorld(pos.x, pos.y);
        mesh.position.x = THREE.MathUtils.lerp(mesh.position.x, world.x, 0.15);
        mesh.position.z = THREE.MathUtils.lerp(mesh.position.z, world.z, 0.15);
        mesh.position.y = 0.9;
      }
    });
  });

  // Determine roles from snap positions for geometry selection
  const offRoles = offSnapRef.current.length > 0
    ? offSnapRef.current.map(p => p.role)
    : Array(11).fill('OFF');
  const defRoles = defSnapRef.current.length > 0
    ? defSnapRef.current.map(p => p.role)
    : Array(11).fill('DEF');

  return (
    <>
      {/* Offense (11 players) */}
      {Array.from({ length: 11 }, (_, i) => (
        <mesh
          key={`off-${i}`}
          ref={(el) => { offRefs.current[i] = el; }}
          geometry={getGeo(offRoles[i])}
          material={offMaterial}
          position={[0, 0.9, i * 2 - 10]}
        />
      ))}
      {/* Defense (11 players) */}
      {Array.from({ length: 11 }, (_, i) => (
        <mesh
          key={`def-${i}`}
          ref={(el) => { defRefs.current[i] = el; }}
          geometry={getGeo(defRoles[i])}
          material={defMaterial}
          position={[5, 0.9, i * 2 - 10]}
        />
      ))}
    </>
  );
}
