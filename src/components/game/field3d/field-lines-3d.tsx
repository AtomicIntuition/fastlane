'use client';

import { useMemo } from 'react';
import * as THREE from 'three';

interface FieldLines3DProps {
  /** Ball position in field percentage (0-100) */
  ballPosition: number;
  /** First down line in field percentage */
  firstDownLine: number;
  /** Which team has the ball */
  possession: 'home' | 'away';
}

const FIELD_HALF_WIDTH = 26.65; // Half of 53.33 yards

/**
 * 3D field markers: first-down line (yellow) and line of scrimmage (blue).
 * Rendered as transparent planes perpendicular to the field.
 */
export function FieldLines3D({ ballPosition, firstDownLine, possession }: FieldLines3DProps) {
  // Convert field percentage to world X
  const losWorldX = (ballPosition / 100) * 120 - 60;
  const firstDownWorldX = (firstDownLine / 100) * 120 - 60;

  const yellowMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#FFD700',
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
    depthWrite: false,
  }), []);

  const blueMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#3b82f6',
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide,
    depthWrite: false,
  }), []);

  return (
    <>
      {/* Line of Scrimmage (blue) */}
      <mesh
        position={[losWorldX, 0.5, 0]}
        rotation={[0, 0, 0]}
        material={blueMaterial}
      >
        <planeGeometry args={[0.15, 1, 1]} />
      </mesh>
      {/* LOS ground stripe */}
      <mesh
        position={[losWorldX, 0.01, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={blueMaterial}
      >
        <planeGeometry args={[0.2, FIELD_HALF_WIDTH * 2]} />
      </mesh>

      {/* First Down Line (yellow) */}
      <mesh
        position={[firstDownWorldX, 0.5, 0]}
        rotation={[0, 0, 0]}
        material={yellowMaterial}
      >
        <planeGeometry args={[0.15, 1, 1]} />
      </mesh>
      {/* First down ground stripe */}
      <mesh
        position={[firstDownWorldX, 0.02, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={yellowMaterial}
      >
        <planeGeometry args={[0.2, FIELD_HALF_WIDTH * 2]} />
      </mesh>
    </>
  );
}
