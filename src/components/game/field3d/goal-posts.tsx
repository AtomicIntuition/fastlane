'use client';

import { useMemo } from 'react';
import * as THREE from 'three';

const GOAL_POST_COLOR = '#FFD700';
const POST_MATERIAL = new THREE.MeshStandardMaterial({
  color: GOAL_POST_COLOR,
  metalness: 0.6,
  roughness: 0.3,
});

/**
 * 3D goal posts at each end of the field.
 * Y-shaped uprights: main post + crossbar + two uprights.
 * Positioned at x = -60 (away) and x = +60 (home).
 */
export function GoalPosts() {
  return (
    <>
      <GoalPost x={-60} />
      <GoalPost x={60} />
    </>
  );
}

function GoalPost({ x }: { x: number }) {
  const postRadius = 0.15;
  const mainHeight = 3;       // Main vertical post
  const crossbarWidth = 5.63; // 18'6" = ~5.63 yards
  const uprightHeight = 4;    // Above crossbar

  return (
    <group position={[x, 0, 0]}>
      {/* Main vertical post */}
      <mesh position={[0, mainHeight / 2, 0]} material={POST_MATERIAL}>
        <cylinderGeometry args={[postRadius, postRadius * 1.2, mainHeight, 8]} />
      </mesh>

      {/* Crossbar */}
      <mesh
        position={[0, mainHeight, 0]}
        rotation={[0, 0, Math.PI / 2]}
        material={POST_MATERIAL}
      >
        <cylinderGeometry args={[postRadius * 0.8, postRadius * 0.8, crossbarWidth, 8]} />
      </mesh>

      {/* Left upright */}
      <mesh
        position={[0, mainHeight + uprightHeight / 2, -crossbarWidth / 2]}
        material={POST_MATERIAL}
      >
        <cylinderGeometry args={[postRadius * 0.7, postRadius * 0.7, uprightHeight, 8]} />
      </mesh>

      {/* Right upright */}
      <mesh
        position={[0, mainHeight + uprightHeight / 2, crossbarWidth / 2]}
        material={POST_MATERIAL}
      >
        <cylinderGeometry args={[postRadius * 0.7, postRadius * 0.7, uprightHeight, 8]} />
      </mesh>
    </group>
  );
}
