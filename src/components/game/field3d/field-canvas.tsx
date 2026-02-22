'use client';

import { Canvas } from '@react-three/fiber';
import type { ReactNode } from 'react';

interface FieldCanvasProps {
  children: ReactNode;
  /** Whether animation is actively playing (controls frameloop) */
  animating?: boolean;
}

/**
 * R3F Canvas wrapper — sized to fill existing container,
 * with performance-tuned settings for broadcast-quality rendering.
 */
export function FieldCanvas({ children, animating = false }: FieldCanvasProps) {
  return (
    <Canvas
      frameloop={animating ? 'always' : 'demand'}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: false }}
      camera={{ fov: 50, near: 0.1, far: 500, position: [0, 30, 0] }}
      style={{ width: '100%', height: '100%' }}
    >
      {children}
    </Canvas>
  );
}
