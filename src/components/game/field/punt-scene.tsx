/**
 * Punt Scene — Two-logo punt visualization (punter + returner).
 *
 * Extracted from play-scene.tsx. Renders the punter logo, receiver logo,
 * punted ball in flight, and speed trails during return.
 */

import type { Phase } from './play-timing';
import { PUNT_PHASE_END } from './play-timing';
import { easeOutCubic, easeInOutQuad } from './play-animation-math';
import { LogoImg, BALL_SIZE, clamp } from './play-effects';

interface PuntSceneProps {
  punterAbbrev: string;
  punterColor: string;
  receiverAbbrev: string;
  receiverColor: string;
  fromX: number;
  toX: number;
  animProgress: number;
  phase: Phase;
  isTouchback: boolean;
  isFairCatch: boolean;
  isTD: boolean;
  playKey: number;
  flipPunter: boolean;
  flipReceiver: boolean;
}

export function PuntScene({
  punterAbbrev,
  punterColor,
  receiverAbbrev,
  receiverColor,
  fromX,
  toX,
  animProgress,
  phase,
  isTouchback,
  isFairCatch,
  isTD,
  flipPunter,
  flipReceiver,
}: PuntSceneProps) {
  const inDev = phase === 'development';
  const inResult = phase === 'result' || phase === 'post_play';

  const CATCH_T = PUNT_PHASE_END; // 0.55

  // ── Punt landing spot: where the ball comes down ──
  // For touchbacks/fair catches, the ball lands at toX.
  // For returns, the ball lands partway and then receiver runs to toX.
  const landingX = isTouchback || isFairCatch
    ? toX
    : fromX + (toX - fromX) * 0.7; // ball lands ~70% of the way

  // ── Receiver starting position: near own end zone / deep ──
  const receiverEndZone = flipPunter ? (91.66 - 5) : (8.33 + 5);

  // ── Punter logo ──
  let punterOpacity = 1;
  const punterX = fromX;
  if (inDev) {
    if (animProgress < CATCH_T) {
      punterOpacity = 1 - animProgress * (0.5 / CATCH_T);
    } else {
      const fadeT = (animProgress - CATCH_T) / (1 - CATCH_T);
      punterOpacity = 0.5 * (1 - fadeT);
    }
  } else if (inResult) {
    punterOpacity = 0;
  }

  // ── Receiver logo ──
  let receiverX = receiverEndZone;
  const receiverOpacity = 1;
  if (inDev) {
    if (animProgress < 0.3) {
      receiverX = receiverEndZone;
    } else if (animProgress < CATCH_T) {
      // Drift toward landing spot to catch
      const driftT = (animProgress - 0.3) / (CATCH_T - 0.3);
      receiverX = receiverEndZone + (landingX - receiverEndZone) * easeOutCubic(driftT);
    } else if (isTouchback || isFairCatch) {
      receiverX = landingX;
    } else {
      // Return phase
      const returnT = (animProgress - CATCH_T) / (1 - CATCH_T);
      receiverX = landingX + (toX - landingX) * easeOutCubic(returnT);
    }
  } else if (inResult) {
    receiverX = toX;
  }

  // ── Punted ball (golden circle in flight) ──
  let ballVisible = false;
  let ballPosX = fromX;
  let ballPosY = 50;
  if (inDev && animProgress < CATCH_T) {
    ballVisible = true;
    const kickT = animProgress / CATCH_T;
    ballPosX = fromX + (landingX - fromX) * easeInOutQuad(kickT);
    // Parabolic arc — punts have high arc
    const altitude = Math.sin(kickT * Math.PI);
    ballPosY = 50 - altitude * 28;
  }

  // ── Speed trails on receiver during return ──
  const showSpeedTrails = inDev && animProgress > CATCH_T && !isTouchback && !isFairCatch;

  return (
    <>
      {/* --- Punter Logo --- */}
      {punterOpacity > 0.01 && (
        <div
          style={{
            position: 'absolute',
            left: `${clamp(punterX, 2, 98)}%`,
            top: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 19,
            opacity: punterOpacity,
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
              background: `radial-gradient(circle, ${punterColor}40 0%, transparent 70%)`,
              opacity: 0.6,
            }}
          />
          <div
            style={{
              width: BALL_SIZE,
              height: BALL_SIZE,
              borderRadius: '50%',
              border: `3px solid ${punterColor}`,
              backgroundColor: '#111827',
              boxShadow: `0 0 12px ${punterColor}60, 0 2px 8px rgba(0,0,0,0.8)`,
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <LogoImg
              abbrev={punterAbbrev}
              size={BALL_SIZE - 10}
              flip={flipPunter}
            />
          </div>
        </div>
      )}

      {/* --- Punted Ball (football in flight) --- */}
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
