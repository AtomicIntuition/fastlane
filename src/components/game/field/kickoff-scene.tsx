/**
 * Kickoff Scene — Two-logo cinematic kickoff visualization.
 *
 * Extracted from play-scene.tsx. Renders the kicker logo, receiver logo,
 * kicked ball in flight, and speed trails during return.
 */

import type { Phase } from './play-timing';
import { KICKOFF_PHASE_END } from './play-timing';
import { easeOutCubic, easeInOutQuad } from './play-animation-math';
import { LogoImg, BALL_SIZE, clamp } from './play-effects';

interface KickoffSceneProps {
  kickerAbbrev: string;
  kickerColor: string;
  receiverAbbrev: string;
  receiverColor: string;
  fromX: number;
  toX: number;
  landingX: number;
  animProgress: number;
  phase: Phase;
  isTouchback: boolean;
  isTD: boolean;
  playKey: number;
  flipKicker: boolean;
  flipReceiver: boolean;
}

export function KickoffScene({
  kickerAbbrev,
  kickerColor,
  receiverAbbrev,
  receiverColor,
  fromX,
  toX,
  landingX,
  animProgress,
  phase,
  isTouchback,
  isTD,
  flipKicker,
  flipReceiver,
}: KickoffSceneProps) {
  const inDev = phase === 'development';
  const inResult = phase === 'result' || phase === 'post_play';

  // ── Receiver starting position: near end zone where ball is headed ──
  // Home kicks right-to-left (toward 8.33), receiver waits near 8.33
  // Away kicks left-to-right (toward 91.66), receiver waits near 91.66
  // flipKicker is true when away is kicking (kicks toward 91.66)
  const receiverEndZone = flipKicker ? (91.66 - 5) : (8.33 + 5);

  // ── Phase breakpoints (within 0-1 animProgress during development) ──
  const CATCH_T = KICKOFF_PHASE_END; // 0.45

  // ── Kicker logo ──
  let kickerOpacity = 1;
  const kickerX = fromX;
  if (inDev) {
    if (animProgress < CATCH_T) {
      kickerOpacity = 1 - animProgress * (0.5 / CATCH_T); // 1 -> 0.5
    } else {
      const fadeT = (animProgress - CATCH_T) / (1 - CATCH_T);
      kickerOpacity = 0.5 * (1 - fadeT); // 0.5 -> 0
    }
  } else if (inResult) {
    kickerOpacity = 0;
  }

  // ── Receiver logo ──
  let receiverX = receiverEndZone;
  const receiverOpacity = 1;
  if (inDev) {
    if (animProgress < 0.3) {
      // Holds position
      receiverX = receiverEndZone;
    } else if (animProgress < CATCH_T) {
      // Drifts toward landing spot
      const driftT = (animProgress - 0.3) / (CATCH_T - 0.3);
      receiverX = receiverEndZone + (landingX - receiverEndZone) * easeOutCubic(driftT);
    } else if (isTouchback) {
      // Touchback: stays at landing position (end zone area)
      receiverX = landingX;
    } else {
      // Return phase: runs from landing to final position
      const returnT = (animProgress - CATCH_T) / (1 - CATCH_T);
      receiverX = landingX + (toX - landingX) * easeOutCubic(returnT);
    }
  } else if (inResult) {
    receiverX = toX;
  }

  // ── Kicked ball (golden circle) ──
  let ballVisible = false;
  let ballPosX = fromX;
  let ballPosY = 50;
  if (inDev && animProgress < CATCH_T) {
    ballVisible = true;
    const kickT = animProgress / CATCH_T;
    ballPosX = fromX + (landingX - fromX) * easeInOutQuad(kickT);
    // Parabolic arc — peaks at midpoint
    const altitude = Math.sin(kickT * Math.PI);
    ballPosY = 50 - altitude * 25;
  }

  // ── Speed trails on receiver during return ──
  const showSpeedTrails = inDev && animProgress > CATCH_T && !isTouchback;

  return (
    <>
      {/* --- Kicker Logo --- */}
      {kickerOpacity > 0.01 && (
        <div
          style={{
            position: 'absolute',
            left: `${clamp(kickerX, 2, 98)}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 19,
            opacity: kickerOpacity,
            transition: inResult ? 'opacity 300ms ease-out' : undefined,
          }}
        >
          <div
            className="absolute rounded-full"
            style={{
              width: BALL_SIZE + 10,
              height: BALL_SIZE + 10,
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: `radial-gradient(circle, ${kickerColor}40 0%, transparent 70%)`,
              opacity: 0.6,
            }}
          />
          <div
            style={{
              width: BALL_SIZE,
              height: BALL_SIZE,
              borderRadius: '50%',
              border: `3px solid ${kickerColor}`,
              backgroundColor: '#111827',
              boxShadow: `0 0 12px ${kickerColor}60, 0 2px 8px rgba(0,0,0,0.8)`,
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <LogoImg
              abbrev={kickerAbbrev}
              size={BALL_SIZE - 10}
              flip={flipKicker}
            />
          </div>
        </div>
      )}

      {/* --- Kicked Ball (football in flight) --- */}
      {ballVisible && (
        <div
          style={{
            position: 'absolute',
            left: `${clamp(ballPosX, 2, 98)}%`,
            top: `${ballPosY}%`,
            transform: 'translate(-50%, -50%)',
            zIndex: 21,
            fontSize: 16,
            lineHeight: 1,
            filter: 'drop-shadow(0 0 6px rgba(212, 175, 55, 0.5))',
          }}
        >
          {'\u{1F3C8}'}
        </div>
      )}

      {/* --- Speed Trails (receiver return) --- */}
      {showSpeedTrails && (
        <>
          {[0.06, 0.12, 0.18, 0.24, 0.30, 0.36].map((offset, i) => {
            const trailT = Math.max(CATCH_T, animProgress - offset);
            const returnT = (trailT - CATCH_T) / (1 - CATCH_T);
            const trailX = landingX + (toX - landingX) * easeOutCubic(returnT);
            return (
              <div
                key={i}
                className="absolute rounded-full"
                style={{
                  left: `${clamp(trailX, 2, 98)}%`,
                  top: '50%',
                  width: BALL_SIZE * (0.6 - i * 0.08),
                  height: BALL_SIZE * (0.6 - i * 0.08),
                  transform: 'translate(-50%, -50%)',
                  backgroundColor: receiverColor,
                  opacity: 0.35 - i * 0.05,
                  borderRadius: '50%',
                  animation: 'speed-trail-fade 0.4s ease-out forwards',
                }}
              />
            );
          })}
        </>
      )}

      {/* --- Receiver Logo --- */}
      <div
        style={{
          position: 'absolute',
          left: `${clamp(receiverX, 2, 98)}%`,
          top: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 20,
          opacity: receiverOpacity,
        }}
      >
        {/* Big play glow for TD return */}
        {isTD && inDev && animProgress > CATCH_T && (
          <div
            className="absolute rounded-full"
            style={{
              width: BALL_SIZE + 20,
              height: BALL_SIZE + 20,
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              animation: 'big-play-glow 0.8s ease-in-out infinite',
              boxShadow: '0 0 20px #22c55e, 0 0 40px #22c55e50',
              borderRadius: '50%',
            }}
          />
        )}

        <div
          className="absolute rounded-full"
          style={{
            width: BALL_SIZE + 10,
            height: BALL_SIZE + 10,
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: `radial-gradient(circle, ${receiverColor}40 0%, transparent 70%)`,
            opacity: 0.8,
          }}
        />
        <div
          style={{
            width: BALL_SIZE,
            height: BALL_SIZE,
            borderRadius: '50%',
            border: `3px solid ${receiverColor}`,
            backgroundColor: '#111827',
            boxShadow: `0 0 12px ${receiverColor}60, 0 2px 8px rgba(0,0,0,0.8)`,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <LogoImg
            abbrev={receiverAbbrev}
            size={BALL_SIZE - 10}
            flip={flipReceiver}
          />
        </div>
      </div>
    </>
  );
}
