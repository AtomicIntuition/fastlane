'use client';

interface DriveTrailProps {
  /** Absolute field % where the current drive started */
  driveStartPercent: number;
  /** Absolute field % of current ball position */
  ballPercent: number;
  /** Possessing team's primary color */
  teamColor: string;
  /** Whether there's an active drive (hide during kickoffs, etc.) */
  visible: boolean;
}

/**
 * Shows the current drive's progress as a dashed trail on the field.
 * Resets when possession changes (new drive).
 */
export function DriveTrail({
  driveStartPercent,
  ballPercent,
  teamColor,
  visible,
}: DriveTrailProps) {
  if (!visible) return null;

  const left = Math.min(driveStartPercent, ballPercent);
  const width = Math.abs(ballPercent - driveStartPercent);

  if (width < 0.5) return null;

  return (
    <div className="absolute top-0 bottom-0 pointer-events-none z-[5]">
      <svg
        className="absolute"
        style={{
          left: `${left}%`,
          width: `${width}%`,
          top: 0,
          height: '100%',
        }}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {/* Dashed drive trail line at field center */}
        <line
          x1="0"
          y1="52"
          x2="100"
          y2="52"
          stroke={teamColor}
          strokeWidth="2"
          strokeDasharray="4 4"
          opacity="0.35"
          className="drive-trail-grow-anim"
        />
      </svg>

      {/* Drive start marker */}
      <div
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
        style={{
          left: `${driveStartPercent}%`,
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: teamColor,
          opacity: 0.4,
        }}
      />
    </div>
  );
}
