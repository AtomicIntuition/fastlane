'use client';

import { useMemo } from 'react';
import * as THREE from 'three';

interface StadiumProps {
  homeColor: string;
  awayColor: string;
}

/**
 * Stadium geometry — stands, fans, press box, and ambient surround.
 * Replaces the black void outside the field with a full stadium bowl.
 * All procedural geometry — no loaded models, minimal draw calls.
 */
export function Stadium({ homeColor, awayColor }: StadiumProps) {
  // Shared materials
  const concreteMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#4a4a50', roughness: 0.9, metalness: 0,
  }), []);
  const seatHomeMatLower = useMemo(() => new THREE.MeshStandardMaterial({
    color: homeColor, roughness: 0.7, metalness: 0.05,
  }), [homeColor]);
  const seatAwayMatLower = useMemo(() => new THREE.MeshStandardMaterial({
    color: awayColor, roughness: 0.7, metalness: 0.05,
  }), [awayColor]);
  const seatUpperMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#2a2a35', roughness: 0.8, metalness: 0,
  }), []);
  const pressBoxMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#1a1a2a', roughness: 0.3, metalness: 0.4,
  }), []);
  const fanMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#8a7a6a', roughness: 0.9, metalness: 0,
  }), []);

  // Stadium dimensions
  const fieldLength = 120;
  const fieldWidth = 53.33;
  const standHeight = 18;
  const standDepth = 25;
  const standAngle = 0.55; // ~32 degrees
  const upperDeckHeight = 12;
  const gapFromField = 3; // Sideline gap

  // Fan dot geometry (instanced for performance)
  const fanPositions = useMemo(() => {
    const positions: number[] = [];
    // Populate stands with fan dots
    const rows = 12;
    const cols = 80;

    // Both sidelines
    for (const side of [-1, 1]) {
      const baseZ = side * (fieldWidth / 2 + gapFromField + 2);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = -fieldLength / 2 + 5 + (c / cols) * (fieldLength - 10);
          const y = 1 + r * 1.4;
          const z = baseZ + side * (r * 1.8);
          // Add slight randomness for organic look
          positions.push(
            x + (Math.random() - 0.5) * 0.6,
            y + (Math.random() - 0.5) * 0.3,
            z + (Math.random() - 0.5) * 0.4,
          );
        }
      }
    }

    // End zones
    for (const endSide of [-1, 1]) {
      const baseX = endSide * (fieldLength / 2 + gapFromField + 2);
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 30; c++) {
          const z = -fieldWidth / 2 + 5 + (c / 30) * (fieldWidth - 10);
          const y = 1 + r * 1.4;
          const x = baseX + endSide * (r * 1.8);
          positions.push(
            x + (Math.random() - 0.5) * 0.6,
            y + (Math.random() - 0.5) * 0.3,
            z + (Math.random() - 0.5) * 0.4,
          );
        }
      }
    }

    return new Float32Array(positions);
  }, []);

  const fanGeo = useMemo(() => new THREE.SphereGeometry(0.35, 4, 3), []);

  return (
    <group>
      {/* ── Sideline Stands (home side — negative Z) ──────────── */}
      <Stand
        position={[0, 0, -(fieldWidth / 2 + gapFromField + standDepth / 2)]}
        size={[fieldLength + 10, standHeight, standDepth]}
        rotation={[standAngle, 0, 0]}
        material={seatHomeMatLower}
      />
      {/* Upper deck — home */}
      <Stand
        position={[0, standHeight - 2, -(fieldWidth / 2 + gapFromField + standDepth + 6)]}
        size={[fieldLength + 10, upperDeckHeight, 18]}
        rotation={[standAngle + 0.1, 0, 0]}
        material={seatUpperMat}
      />

      {/* ── Sideline Stands (away side — positive Z) ──────────── */}
      <Stand
        position={[0, 0, (fieldWidth / 2 + gapFromField + standDepth / 2)]}
        size={[fieldLength + 10, standHeight, standDepth]}
        rotation={[-standAngle, 0, 0]}
        material={seatAwayMatLower}
      />
      {/* Upper deck — away */}
      <Stand
        position={[0, standHeight - 2, (fieldWidth / 2 + gapFromField + standDepth + 6)]}
        size={[fieldLength + 10, upperDeckHeight, 18]}
        rotation={[-standAngle - 0.1, 0, 0]}
        material={seatUpperMat}
      />

      {/* ── End Zone Stands ───────────────────────────────────── */}
      <Stand
        position={[-(fieldLength / 2 + gapFromField + 12), 0, 0]}
        size={[20, standHeight - 2, fieldWidth + 10]}
        rotation={[0, 0, -standAngle]}
        material={concreteMat}
      />
      <Stand
        position={[(fieldLength / 2 + gapFromField + 12), 0, 0]}
        size={[20, standHeight - 2, fieldWidth + 10]}
        rotation={[0, 0, standAngle]}
        material={concreteMat}
      />

      {/* ── Press Box (home side, high up) ─────────────────────── */}
      <mesh
        position={[0, standHeight + upperDeckHeight - 1, -(fieldWidth / 2 + gapFromField + standDepth + 15)]}
        material={pressBoxMat}
      >
        <boxGeometry args={[60, 5, 6]} />
      </mesh>

      {/* ── Stadium Ring / Rim ────────────────────────────────── */}
      <mesh position={[0, standHeight + upperDeckHeight + 1, 0]}>
        <torusGeometry args={[72, 1.5, 6, 48]} />
        <meshStandardMaterial color="#3a3a45" roughness={0.8} metalness={0.1} />
      </mesh>

      {/* ── Sideline Pad / Track ──────────────────────────────── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -(fieldWidth / 2 + 1.5)]}>
        <planeGeometry args={[fieldLength, 3]} />
        <meshStandardMaterial color="#2a4a2a" roughness={0.95} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, (fieldWidth / 2 + 1.5)]}>
        <planeGeometry args={[fieldLength, 3]} />
        <meshStandardMaterial color="#2a4a2a" roughness={0.95} />
      </mesh>

      {/* ── Fan Dots (instanced points) ───────────────────────── */}
      <points>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[fanPositions, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          color="#b8a890"
          size={0.6}
          sizeAttenuation
          transparent
          opacity={0.8}
        />
      </points>

      {/* ── Ground plane outside field (dark grass) ─────────── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#1a2e1a" roughness={1} />
      </mesh>
    </group>
  );
}

/** Angled stadium stand section */
function Stand({
  position,
  size,
  rotation,
  material,
}: {
  position: [number, number, number];
  size: [number, number, number];
  rotation: [number, number, number];
  material: THREE.MeshStandardMaterial;
}) {
  return (
    <mesh position={position} rotation={rotation} material={material}>
      <boxGeometry args={size} />
    </mesh>
  );
}
