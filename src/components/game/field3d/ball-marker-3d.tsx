'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface BallMarker3DProps {
  /** Ball position in field percentage */
  ballPosition: number;
  /** Whether to hide (during play animation) */
  hidden: boolean;
}

/**
 * 3D ball marker — small glowing sphere at the ball position when not in play.
 */
export function BallMarker3D({ ballPosition, hidden }: BallMarker3DProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!meshRef.current) return;
    meshRef.current.visible = !hidden;
    if (hidden) return;

    const worldX = (ballPosition / 100) * 120 - 60;
    meshRef.current.position.x = THREE.MathUtils.lerp(
      meshRef.current.position.x, worldX, 0.1
    );
    // Gentle bob
    meshRef.current.position.y = 0.5 + Math.sin(state.clock.elapsedTime * 2) * 0.1;
  });

  return (
    <mesh ref={meshRef} position={[0, 0.5, 0]}>
      <sphereGeometry args={[0.25, 12, 8]} />
      <meshStandardMaterial
        color="#ff6600"
        emissive="#ff6600"
        emissiveIntensity={0.4}
        transparent
        opacity={0.8}
      />
    </mesh>
  );
}
