'use client';

/**
 * Stadium lighting — ambient, hemisphere (sky+grass), and directional sun.
 */
export function StadiumLighting() {
  return (
    <>
      <ambientLight intensity={0.4} />
      <hemisphereLight
        args={['#87CEEB', '#228B22', 0.6]}
      />
      <directionalLight
        position={[30, 50, 20]}
        intensity={1}
        castShadow={false}
      />
      <directionalLight
        position={[-30, 40, -15]}
        intensity={0.3}
        castShadow={false}
      />
    </>
  );
}
