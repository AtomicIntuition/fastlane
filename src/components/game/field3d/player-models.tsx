'use client';

import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { PlayResult } from '@/lib/simulation/types';
import type { Phase, EntityState, ChoreographyFrame } from '@/lib/animation/types';
import {
  computeDevelopment, getSnapPositions, getIdleEntities,
  getDevelopmentMs, PRE_SNAP_MS, SNAP_MS, fieldPctToWorld,
} from '@/lib/animation/choreographer';
import { easeOutCubic } from '@/lib/animation/ball-trajectory';

interface PlayerModelsProps {
  ballPosition: number;
  prevBallPosition: number;
  possession: 'home' | 'away';
  offenseColor: string;
  defenseColor: string;
  lastPlay: PlayResult | null;
  playKey: number;
  phase: Phase;
}

function getCapsuleRadius(role: string): number {
  const linemen = ['C', 'LG', 'RG', 'LT', 'RT', 'DE', 'DT', 'NT'];
  const skill = ['WR', 'CB', 'NCB', 'S'];
  if (linemen.includes(role)) return 0.5;
  if (skill.includes(role)) return 0.35;
  return 0.4;
}

/**
 * 22 capsule players — positions driven by choreographer.
 * Direct position setting from choreographer output (no lerp).
 */
export function PlayerModels({
  ballPosition, prevBallPosition, possession,
  offenseColor, defenseColor, lastPlay, playKey, phase,
}: PlayerModelsProps) {
  const offDir = possession === 'away' ? -1 : 1;
  const losX = prevBallPosition;

  const offRefs = useRef<(THREE.Mesh | null)[]>([]);
  const defRefs = useRef<(THREE.Mesh | null)[]>([]);
  const snapOffRef = useRef<EntityState[]>([]);
  const snapDefRef = useRef<EntityState[]>([]);
  const animStartRef = useRef(0);
  const prevKeyRef = useRef(playKey);

  // Materials
  const offMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: offenseColor, roughness: 0.6, metalness: 0.1 }), [offenseColor]);
  const defMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: defenseColor, roughness: 0.6, metalness: 0.1 }), [defenseColor]);

  // Geometries
  const geoLarge = useMemo(() => new THREE.CapsuleGeometry(0.5, 1.2, 4, 8), []);
  const geoMedium = useMemo(() => new THREE.CapsuleGeometry(0.4, 1.2, 4, 8), []);
  const geoSmall = useMemo(() => new THREE.CapsuleGeometry(0.35, 1.2, 4, 8), []);

  function getGeo(role: string) {
    const r = getCapsuleRadius(role);
    if (r >= 0.5) return geoLarge;
    if (r <= 0.35) return geoSmall;
    return geoMedium;
  }

  // On new play: compute snap positions
  useEffect(() => {
    if (playKey === prevKeyRef.current || !lastPlay) return;
    prevKeyRef.current = playKey;
    animStartRef.current = performance.now();
    const snap = getSnapPositions(lastPlay, losX, offDir);
    snapOffRef.current = snap.offense;
    snapDefRef.current = snap.defense;
  }, [playKey, lastPlay, losX, offDir]);

  // Frame-by-frame position updates
  useFrame(() => {
    if (!lastPlay) return;

    let offPositions: EntityState[];
    let defPositions: EntityState[];

    if (phase === 'development') {
      const devMs = getDevelopmentMs(lastPlay);
      const devStart = PRE_SNAP_MS + SNAP_MS;
      const elapsed = performance.now() - animStartRef.current;
      const t = Math.min(Math.max((elapsed - devStart) / devMs, 0), 1);

      const ctx = { play: lastPlay, losX, toX: ballPosition, offDir, possession };
      const frame = computeDevelopment(t, ctx, snapOffRef.current, snapDefRef.current);
      offPositions = frame.offense;
      defPositions = frame.defense;
    } else if (phase === 'pre_snap' || phase === 'snap') {
      offPositions = snapOffRef.current;
      defPositions = snapDefRef.current;
    } else if (phase === 'result' || phase === 'post_play') {
      // Freeze at end of development
      if (snapOffRef.current.length > 0) {
        const ctx = { play: lastPlay, losX, toX: ballPosition, offDir, possession };
        const frame = computeDevelopment(1, ctx, snapOffRef.current, snapDefRef.current);
        offPositions = frame.offense;
        defPositions = frame.defense;
      } else {
        return;
      }
    } else {
      // idle — relaxed positions
      const idle = getIdleEntities(ballPosition, offDir);
      offPositions = idle.offense;
      defPositions = idle.defense;
    }

    // Apply positions directly — no lerp
    offPositions.forEach((pos, i) => {
      const mesh = offRefs.current[i];
      if (mesh) {
        const world = fieldPctToWorld(pos.x, pos.y);
        mesh.position.x = world.x;
        mesh.position.z = world.z;
        mesh.position.y = 0.9;
      }
    });

    defPositions.forEach((pos, i) => {
      const mesh = defRefs.current[i];
      if (mesh) {
        const world = fieldPctToWorld(pos.x, pos.y);
        mesh.position.x = world.x;
        mesh.position.z = world.z;
        mesh.position.y = 0.9;
      }
    });
  });

  const offRoles = snapOffRef.current.length > 0 ? snapOffRef.current.map(p => p.role) : Array(11).fill('OFF');
  const defRoles = snapDefRef.current.length > 0 ? snapDefRef.current.map(p => p.role) : Array(11).fill('DEF');

  return (
    <>
      {Array.from({ length: 11 }, (_, i) => (
        <mesh
          key={`off-${i}`}
          ref={el => { offRefs.current[i] = el; }}
          geometry={getGeo(offRoles[i])}
          material={offMaterial}
          position={[0, 0.9, i * 2 - 10]}
        />
      ))}
      {Array.from({ length: 11 }, (_, i) => (
        <mesh
          key={`def-${i}`}
          ref={el => { defRefs.current[i] = el; }}
          geometry={getGeo(defRoles[i])}
          material={defMaterial}
          position={[5, 0.9, i * 2 - 10]}
        />
      ))}
    </>
  );
}
