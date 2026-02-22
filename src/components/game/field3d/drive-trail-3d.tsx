'use client';

import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';

interface DriveTrail3DProps {
  /** Drive start position in field percentage */
  driveStartPosition: number;
  /** Current ball position in field percentage */
  ballPosition: number;
  /** Team primary color */
  teamColor: string;
  /** Whether to show the trail */
  visible: boolean;
}

/**
 * 3D drive trail — a glowing line on the ground showing drive progress.
 */
export function DriveTrail3D({
  driveStartPosition,
  ballPosition,
  teamColor,
  visible,
}: DriveTrail3DProps) {
  const points = useMemo(() => {
    if (!visible) return [];
    const startX = (driveStartPosition / 100) * 120 - 60;
    const endX = (ballPosition / 100) * 120 - 60;
    // Line on the ground, slightly elevated
    return [
      new THREE.Vector3(startX, 0.05, 0),
      new THREE.Vector3(endX, 0.05, 0),
    ];
  }, [driveStartPosition, ballPosition, visible]);

  if (!visible || points.length < 2) return null;

  return (
    <Line
      points={points}
      color={teamColor}
      lineWidth={3}
      transparent
      opacity={0.5}
    />
  );
}
