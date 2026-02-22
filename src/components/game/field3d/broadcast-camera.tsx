'use client';

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface BroadcastCameraProps {
  /** Ball X position in world coordinates (-60 to +60) */
  ballX: number;
  /** Direction offense is going: 1 = right, -1 = left */
  offenseDirection: number;
  /** Whether a kickoff/punt is in progress (wider FOV) */
  isWidePlay?: boolean;
}

/**
 * Animated broadcast camera — positioned behind the offense, elevated,
 * smoothly tracking the ball position each frame.
 */
export function BroadcastCamera({ ballX, offenseDirection, isWidePlay }: BroadcastCameraProps) {
  const { camera } = useThree();
  const targetPos = useRef(new THREE.Vector3());
  const targetLook = useRef(new THREE.Vector3());
  const currentLook = useRef(new THREE.Vector3(0, 0, 0));

  useFrame((_state, delta) => {
    const cam = camera as THREE.PerspectiveCamera;

    // Camera position: behind offense, elevated, centered on field width
    const behindOffset = offenseDirection * -20;
    targetPos.current.set(
      ballX + behindOffset,
      22,
      0
    );

    // Look at point: ahead of ball in offensive direction
    const lookAheadOffset = offenseDirection * 12;
    targetLook.current.set(
      ballX + lookAheadOffset,
      0,
      0
    );

    // Smooth lerp for camera position and look-at
    const lerpSpeed = Math.min(1, delta * 2.5);
    cam.position.lerp(targetPos.current, lerpSpeed);
    currentLook.current.lerp(targetLook.current, lerpSpeed);
    cam.lookAt(currentLook.current);

    // Adjust FOV for wide plays
    const targetFov = isWidePlay ? 60 : 50;
    cam.fov = THREE.MathUtils.lerp(cam.fov, targetFov, lerpSpeed * 0.5);
    cam.updateProjectionMatrix();
  });

  return null;
}
