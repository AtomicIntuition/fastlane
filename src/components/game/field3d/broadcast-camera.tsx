'use client';

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Phase } from '@/lib/animation/types';
import type { PlayResult } from '@/lib/simulation/types';

interface BroadcastCameraProps {
  /** Ball X position in world coordinates (-60 to +60) */
  ballX: number;
  /** Direction offense is going: 1 = right, -1 = left */
  offenseDirection: number;
  /** Whether a kickoff/punt is in progress (wider FOV) */
  isWidePlay?: boolean;
  /** Current animation phase */
  phase: Phase;
  /** Current play for context-aware camera */
  lastPlay: PlayResult | null;
}

/**
 * Single stable broadcast camera — classic NFL sideline view.
 * Smoothly tracks the ball along the field. No preset switching.
 */
export function BroadcastCamera({
  ballX,
  offenseDirection,
  isWidePlay,
  phase,
  lastPlay,
}: BroadcastCameraProps) {
  const { camera } = useThree();
  const targetPos = useRef(new THREE.Vector3());
  const targetLook = useRef(new THREE.Vector3());
  const currentLook = useRef(new THREE.Vector3(0, 0, 0));

  useFrame((_state, delta) => {
    const cam = camera as THREE.PerspectiveCamera;

    // Classic broadcast angle: behind and above the offense, looking downfield
    // Offset behind the play, elevated, slightly to the side for depth
    const behindOffset = offenseDirection * -20;
    const sideOffset = 30; // Camera off to one side (positive Z = one sideline)
    const height = 22;
    const lookAhead = offenseDirection * 10;

    targetPos.current.set(ballX + behindOffset, height, sideOffset);
    targetLook.current.set(ballX + lookAhead, 0, 0);

    // Smooth camera tracking — gentle lerp for broadcast feel
    const speed = Math.min(1, delta * 2.5);
    cam.position.lerp(targetPos.current, speed);
    currentLook.current.lerp(targetLook.current, speed);
    cam.lookAt(currentLook.current);

    // Stable FOV — slightly wider for kickoffs/punts
    const targetFov = isWidePlay ? 55 : 50;
    cam.fov = THREE.MathUtils.lerp(cam.fov, targetFov, speed * 0.5);
    cam.updateProjectionMatrix();
  });

  return null;
}
