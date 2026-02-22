/**
 * Ball trajectory calculations — extracted from play-scene.tsx for shared use.
 * All functions are pure: given play data + progress (0-1), returns {x, y} in field percentages.
 */

import type { PlayResult } from '@/lib/simulation/types';

// ── Easing ───────────────────────────────────────────────────
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ── Route shape system ─────────────────────────────────────

type RoutePoint = { dx: number; dy: number };

export const CONCEPT_ROUTES: Record<string, RoutePoint[]> = {
  hitch:  [{ dx: 0, dy: 0 }, { dx: 0.6, dy: 0.05 }, { dx: 0.85, dy: 0.03 }, { dx: 1, dy: -0.05 }],
  curl:   [{ dx: 0, dy: 0 }, { dx: 0.55, dy: 0 }, { dx: 0.9, dy: -0.1 }, { dx: 1, dy: -0.15 }],
  shake:  [{ dx: 0, dy: 0 }, { dx: 0.3, dy: 0.3 }, { dx: 0.5, dy: 0.15 }, { dx: 1, dy: -0.4 }],
  angle:  [{ dx: 0, dy: 0 }, { dx: 0.2, dy: -0.3 }, { dx: 0.45, dy: -0.2 }, { dx: 1, dy: 0.4 }],
  stick:  [{ dx: 0, dy: 0 }, { dx: 0.5, dy: 0.1 }, { dx: 0.6, dy: 0.1 }, { dx: 1, dy: 0.1 }],
  semi:   [{ dx: 0, dy: 0 }, { dx: 0.4, dy: 0.1 }, { dx: 0.6, dy: 0.3 }, { dx: 1, dy: 0.5 }],
  bench:  [{ dx: 0, dy: 0 }, { dx: 0.5, dy: 0 }, { dx: 0.65, dy: 0.15 }, { dx: 1, dy: 0.8 }],
  drive:  [{ dx: 0, dy: 0 }, { dx: 0.5, dy: -0.15 }, { dx: 0.7, dy: 0 }, { dx: 1, dy: 0.6 }],
  cross:  [{ dx: 0, dy: 0 }, { dx: 0.4, dy: 0 }, { dx: 0.6, dy: 0.2 }, { dx: 1, dy: 0.7 }],
  blinky: [{ dx: 0, dy: 0 }, { dx: 0.35, dy: 0.1 }, { dx: 0.55, dy: -0.1 }, { dx: 1, dy: 0.4 }],
  go:     [{ dx: 0, dy: 0 }, { dx: 0.3, dy: 0.05 }, { dx: 0.7, dy: 0.08 }, { dx: 1, dy: 0.1 }],
  cab:    [{ dx: 0, dy: 0 }, { dx: 0.4, dy: 0 }, { dx: 0.6, dy: 0.1 }, { dx: 1, dy: 0.45 }],
  pylon:  [{ dx: 0, dy: 0 }, { dx: 0.45, dy: -0.1 }, { dx: 0.7, dy: 0.2 }, { dx: 1, dy: 0.75 }],
  x_ray:  [{ dx: 0, dy: 0 }, { dx: 0.35, dy: 0.3 }, { dx: 0.55, dy: 0.15 }, { dx: 1, dy: 0.5 }],
  delta:  [{ dx: 0, dy: 0 }, { dx: 0.4, dy: 0.05 }, { dx: 0.6, dy: 0.15 }, { dx: 1, dy: 0.3 }],
  screen: [{ dx: -0.15, dy: 0.5 }, { dx: -0.1, dy: 0.6 }, { dx: 0.2, dy: 0.55 }, { dx: 1, dy: 0.3 }],
  waggle: [{ dx: 0, dy: 0 }, { dx: -0.1, dy: 0.4 }, { dx: 0.3, dy: 0.5 }, { dx: 1, dy: 0.35 }],
};

export function getRouteShape(call: string, yardsGained: number, routeConcept?: string): RoutePoint[] {
  if (routeConcept && CONCEPT_ROUTES[routeConcept]) {
    return CONCEPT_ROUTES[routeConcept];
  }
  switch (call) {
    case 'pass_quick': case 'pass_rpo':
      return [{ dx: 0, dy: 0 }, { dx: 0.3, dy: 0 }, { dx: 1, dy: 0.6 }];
    case 'pass_short': case 'play_action_short':
      return [{ dx: 0, dy: 0 }, { dx: 0.55, dy: 0 }, { dx: 0.85, dy: -0.15 }, { dx: 1.0, dy: -0.05 }];
    case 'pass_medium':
      return [{ dx: 0, dy: 0 }, { dx: 0.55, dy: 0 }, { dx: 0.65, dy: 0.1 }, { dx: 1, dy: 0.7 }];
    case 'pass_deep': case 'play_action_deep':
      if (yardsGained > 30) return [{ dx: 0, dy: 0 }, { dx: 0.4, dy: 0.05 }, { dx: 1, dy: 0.1 }];
      return [{ dx: 0, dy: 0 }, { dx: 0.5, dy: -0.1 }, { dx: 0.7, dy: 0.05 }, { dx: 1, dy: 0.5 }];
    case 'screen_pass':
      return [{ dx: -0.15, dy: 0.5 }, { dx: -0.1, dy: 0.6 }, { dx: 0.2, dy: 0.55 }, { dx: 1, dy: 0.3 }];
    default:
      return [{ dx: 0, dy: 0 }, { dx: 0.4, dy: 0.15 }, { dx: 1, dy: 0.3 }];
  }
}

export function interpolateRoute(points: RoutePoint[], t: number): { dx: number; dy: number } {
  if (points.length < 2) return points[0] || { dx: 0, dy: 0 };
  const clamped = Math.max(0, Math.min(1, t));
  const segCount = points.length - 1;
  const rawIdx = clamped * segCount;
  const idx = Math.min(Math.floor(rawIdx), segCount - 1);
  const localT = rawIdx - idx;
  const smooth = easeInOutQuad(localT);
  const a = points[idx];
  const b = points[idx + 1];
  return {
    dx: a.dx + (b.dx - a.dx) * smooth,
    dy: a.dy + (b.dy - a.dy) * smooth,
  };
}

// ── Ball position calculators ────────────────────────────────

/** Kickoff flight phase fraction (when ball lands) */
export const KICKOFF_PHASE_END = 0.45;

export function calculateBallPosition(
  play: PlayResult, fromX: number, toX: number, t: number,
  possession: 'home' | 'away',
): { x: number; y: number } {
  const offDir = possession === 'away' ? -1 : 1;
  switch (play.type) {
    case 'run': case 'two_point':
      return calculateRunPosition(play, fromX, toX, t, offDir);
    case 'scramble':
      return calculateScramblePosition(fromX, toX, t);
    case 'pass_complete':
      return calculatePassPosition(play, fromX, toX, t, offDir);
    case 'pass_incomplete':
      return calculateIncompletePassPosition(play, fromX, toX, t, offDir);
    case 'sack': {
      if (t < 0.2) return { x: fromX + offDir * 2 * easeOutCubic(t / 0.2), y: 50 };
      if (t < 0.5) return { x: fromX + offDir * 2 + Math.sin((t - 0.2) * 15) * 0.8, y: 50 };
      const sackT = easeOutCubic((t - 0.5) / 0.5);
      const qbX = fromX + offDir * 2;
      const x = qbX + (toX - qbX) * sackT;
      const jolt = t > 0.75 ? Math.sin((t - 0.75) * 30) * 2 * (1 - t) : 0;
      return { x: x + jolt, y: 50 + jolt * 0.7 };
    }
    case 'kickoff':
      return calculateKickoffPosition(play, fromX, toX, t);
    case 'punt':
      return calculatePuntPosition(play, fromX, toX, t);
    case 'field_goal': case 'extra_point': {
      const goalPostX = possession === 'away' ? 91.66 : 8.33;
      const eased = easeInOutQuad(t);
      const arcHeight = play.type === 'extra_point' ? 20 : 28;
      return { x: fromX + (goalPostX - fromX) * eased, y: 50 - arcHeight * Math.sin(t * Math.PI) };
    }
    case 'touchback': return { x: toX, y: 50 };
    default: return { x: fromX + (toX - fromX) * easeOutCubic(t), y: 50 };
  }
}

function calculateRunPosition(
  play: PlayResult, fromX: number, toX: number, t: number, offDir: number,
): { x: number; y: number } {
  const call = play.call;
  const travel = toX - fromX;
  const overshootX = travel * 0.10;

  switch (call) {
    case 'run_power': case 'run_zone': case 'run_inside': {
      let x: number;
      if (t < 0.85) {
        x = fromX + (travel + overshootX) * easeOutQuad(t / 0.85);
      } else {
        x = fromX + travel + overshootX * (1 - easeOutQuad((t - 0.85) / 0.15));
      }
      const drift = Math.sin(t * Math.PI * 2) * 10 * (1 - t);
      const juke = t > 0.35 && t < 0.5 ? Math.sin((t - 0.35) * Math.PI / 0.15) * 8 : 0;
      return { x, y: 50 + drift + juke };
    }
    case 'run_outside_zone': case 'run_sweep': case 'run_outside': {
      if (t < 0.35) {
        const sweepT = easeOutQuad(t / 0.35);
        return { x: fromX + travel * 0.1 * sweepT, y: 50 + offDir * 28 * sweepT };
      }
      const sprintPhaseT = (t - 0.35) / 0.65;
      const cornerX = fromX + travel * 0.1;
      let x: number;
      if (sprintPhaseT < 0.85) {
        x = cornerX + (toX + overshootX - cornerX) * easeOutQuad(sprintPhaseT / 0.85);
      } else {
        x = toX + overshootX * (1 - easeOutQuad((sprintPhaseT - 0.85) / 0.15));
      }
      const cornerY = 50 + offDir * 28;
      return { x, y: cornerY + (50 - cornerY) * easeOutCubic(sprintPhaseT) };
    }
    case 'run_draw': {
      if (t < 0.25) return { x: fromX + offDir * 3 * easeOutQuad(t / 0.25), y: 50 };
      if (t < 0.45) return { x: fromX + offDir * 3 + Math.sin((t - 0.25) * 30) * 0.5, y: 50 };
      const burstPhase = (t - 0.45) / 0.55;
      const startX = fromX + offDir * 3;
      const bTravel = toX - startX;
      const bOvershoot = bTravel * 0.10;
      let x: number;
      if (burstPhase < 0.85) {
        x = startX + (bTravel + bOvershoot) * easeOutCubic(burstPhase / 0.85);
      } else {
        x = startX + bTravel + bOvershoot * (1 - easeOutQuad((burstPhase - 0.85) / 0.15));
      }
      return { x, y: 50 + Math.sin(burstPhase * Math.PI * 2) * 10 * (1 - burstPhase) };
    }
    case 'run_counter': {
      if (t < 0.30) {
        const fakeT = easeOutQuad(t / 0.30);
        return { x: fromX + travel * 0.05 * fakeT, y: 50 - offDir * 24 * fakeT };
      }
      if (t < 0.45) {
        const cutT = (t - 0.30) / 0.15;
        return {
          x: fromX + travel * 0.05 + travel * 0.1 * cutT,
          y: (50 - offDir * 24) + offDir * 40 * easeInOutQuad(cutT),
        };
      }
      const sprintPhase = (t - 0.45) / 0.55;
      const cutX = fromX + travel * 0.15;
      const cutY = 50 + offDir * 16;
      let x: number;
      if (sprintPhase < 0.85) {
        x = cutX + (toX + overshootX - cutX) * easeOutQuad(sprintPhase / 0.85);
      } else {
        x = toX + overshootX * (1 - easeOutQuad((sprintPhase - 0.85) / 0.15));
      }
      return { x, y: cutY + (50 - cutY) * sprintPhase };
    }
    case 'run_option': {
      if (t < 0.20) return { x: fromX, y: 50 + offDir * 14 * (t / 0.20) };
      if (t < 0.40) {
        return { x: fromX + travel * 0.1 * ((t - 0.20) / 0.20), y: 50 + offDir * 14 };
      }
      const burstPhase = (t - 0.40) / 0.60;
      const startX = fromX + travel * 0.1;
      let x: number;
      if (burstPhase < 0.85) {
        x = startX + (toX + overshootX - startX) * easeOutQuad(burstPhase / 0.85);
      } else {
        x = toX + overshootX * (1 - easeOutQuad((burstPhase - 0.85) / 0.15));
      }
      return { x, y: 50 + offDir * 14 * (1 - burstPhase) };
    }
    case 'run_qb_sneak': {
      const eased = easeOutCubic(t);
      return { x: fromX + travel * eased, y: 50 + Math.sin(t * Math.PI * 5) * 1.5 * (1 - t) };
    }
    default: {
      const defOvershoot = travel * 0.08;
      let x: number;
      if (t < 0.85) {
        x = fromX + (travel + defOvershoot) * easeOutQuad(t / 0.85);
      } else {
        x = fromX + travel + defOvershoot * (1 - easeOutQuad((t - 0.85) / 0.15));
      }
      return { x, y: 50 + Math.sin(t * Math.PI * 3) * 10 * (1 - t) };
    }
  }
}

function calculateScramblePosition(
  fromX: number, toX: number, t: number,
): { x: number; y: number } {
  const travel = toX - fromX;
  const overshootX = travel * 0.12;
  let x: number;
  if (t < 0.85) {
    x = fromX + (travel + overshootX) * easeOutCubic(t / 0.85);
  } else {
    x = fromX + travel + overshootX * (1 - easeOutQuad((t - 0.85) / 0.15));
  }
  const weave = Math.sin(t * Math.PI * 4) * 18 * (1 - t * 0.7);
  const secondaryWeave = Math.cos(t * Math.PI * 2.5) * 6 * (1 - t);
  return { x, y: 50 + weave + secondaryWeave };
}

function calculatePassPosition(
  play: PlayResult, fromX: number, toX: number, t: number, offDir: number,
): { x: number; y: number } {
  const isPlayAction = play.call === 'play_action_short' || play.call === 'play_action_deep';
  const isScreen = play.call === 'screen_pass';
  const dropEnd = isPlayAction ? 0.22 : 0.12;
  const holdEnd = isPlayAction ? 0.42 : 0.32;
  const throwEnd = 0.82;

  if (t < dropEnd) {
    const dropT = easeOutCubic(t / dropEnd);
    const dropDist = isPlayAction ? 4 : 3;
    const fakeY = isPlayAction ? Math.sin(dropT * Math.PI) * 3 : 0;
    return { x: fromX + offDir * dropDist * dropT, y: 50 + fakeY };
  }
  if (t < holdEnd) {
    const qbX = fromX + offDir * (isPlayAction ? 4 : 3);
    return { x: qbX + Math.sin((t - dropEnd) * 25) * 0.4, y: 50 };
  }
  if (t < throwEnd) {
    const throwT = (t - holdEnd) / (throwEnd - holdEnd);
    const smoothT = easeInOutQuad(throwT);
    const qbX = fromX + offDir * (isPlayAction ? 4 : 3);
    const route = getRouteShape(play.call, play.yardsGained, play.routeConcept);
    const rPt = interpolateRoute(route, smoothT);
    const routeDistX = toX - qbX;
    const x = qbX + routeDistX * rPt.dx;
    const routeY = 50 + rPt.dy * 28;
    const arcHeight = isScreen ? 0 : Math.min(Math.abs(routeDistX) * 0.35, 18);
    const arc = arcHeight * Math.sin(smoothT * Math.PI);
    return { x, y: routeY - arc };
  }
  const racT = (t - throwEnd) / (1 - throwEnd);
  const route = getRouteShape(play.call, play.yardsGained);
  const endPt = interpolateRoute(route, 1);
  const catchY = 50 + endPt.dy * 28;
  return { x: toX, y: catchY + (50 - catchY) * easeOutQuad(racT) };
}

function calculateIncompletePassPosition(
  play: PlayResult, fromX: number, toX: number, t: number, offDir: number,
): { x: number; y: number } {
  const isPlayAction = play.call === 'play_action_short' || play.call === 'play_action_deep';
  const dropEnd = isPlayAction ? 0.22 : 0.15;
  const holdEnd = isPlayAction ? 0.42 : 0.35;

  if (t < dropEnd) {
    return { x: fromX + offDir * 3 * easeOutCubic(t / dropEnd), y: 50 };
  }
  if (t < holdEnd) {
    const qbX = fromX + offDir * 3;
    return { x: qbX + Math.sin((t - dropEnd) * 20) * 0.4, y: 50 };
  }
  if (t < 0.72) {
    const throwT = (t - holdEnd) / (0.72 - holdEnd);
    const smoothT = easeInOutQuad(throwT);
    const qbX = fromX + offDir * 3;
    const targetX = fromX - offDir * 12;
    const route = getRouteShape(play.call, play.yardsGained, play.routeConcept);
    const rPt = interpolateRoute(route, smoothT);
    const routeDistX = targetX - qbX;
    const x = qbX + routeDistX * rPt.dx;
    const routeY = 50 + rPt.dy * 18;
    const arcHeight = Math.min(Math.abs(routeDistX) * 0.4, 16);
    return { x, y: routeY - arcHeight * Math.sin(smoothT * Math.PI) };
  }
  const dropT = (t - 0.72) / 0.28;
  const qbX = fromX + offDir * 3;
  const targetX = fromX - offDir * 12;
  const route = getRouteShape(play.call, play.yardsGained);
  const endPt = interpolateRoute(route, 1);
  const fallX = qbX + (targetX - qbX) * 0.9;
  const fallY = 50 + endPt.dy * 18;
  return { x: fallX + (targetX - fallX) * dropT * 0.2, y: fallY + dropT * 15 };
}

function calculateKickoffPosition(
  play: PlayResult, fromX: number, toX: number, t: number,
): { x: number; y: number } {
  const isTouchback = play.yardsGained === 0;
  const kickDir = toX < fromX ? -1 : 1;
  const receiverEndZone = kickDir < 0 ? 8.33 : 91.66;
  const meta = play.kickoffMeta;
  const catchSpotPct = meta ? (meta.catchSpot / 100) : 0.85;
  const landingX = fromX + (receiverEndZone - fromX) * Math.min(catchSpotPct, 0.95);
  const kickDist = Math.abs(landingX - fromX);
  const arcHeight = Math.min(kickDist * 0.6, 40);

  if (isTouchback) {
    const eased = easeInOutQuad(t);
    return { x: fromX + (receiverEndZone - fromX) * eased, y: 50 - arcHeight * Math.sin(t * Math.PI) };
  }

  if (t < KICKOFF_PHASE_END) {
    const kickT = t / KICKOFF_PHASE_END;
    const eased = easeInOutQuad(kickT);
    return { x: fromX + (landingX - fromX) * eased, y: 50 - arcHeight * Math.sin(kickT * Math.PI) };
  }

  const returnT = (t - KICKOFF_PHASE_END) / (1 - KICKOFF_PHASE_END);
  if (play.isTouchdown) {
    if (returnT < 0.6) {
      const jukeT = returnT / 0.6;
      const eased = easeOutQuad(jukeT);
      const x = landingX + (toX - landingX) * 0.5 * eased;
      return { x, y: 50 + Math.sin(jukeT * Math.PI * 5) * 22 * (1 - jukeT * 0.3) };
    }
    const sprintT = (returnT - 0.6) / 0.4;
    const midX = landingX + (toX - landingX) * 0.5;
    const x = midX + (toX - midX) * easeOutCubic(sprintT);
    return { x, y: 50 + Math.sin(sprintT * Math.PI * 2) * 4 * (1 - sprintT) };
  }

  const eased = easeOutQuad(returnT);
  const x = landingX + (toX - landingX) * eased;
  const amplitude = 16 * (1 - returnT * 0.6);
  const juke = returnT > 0.35 && returnT < 0.5
    ? Math.sin((returnT - 0.35) * Math.PI / 0.15) * 8 : 0;
  return { x, y: 50 + Math.sin(returnT * Math.PI * 3) * amplitude + juke };
}

function calculatePuntPosition(
  play: PlayResult, fromX: number, toX: number, t: number,
): { x: number; y: number } {
  const desc = (play.description || '').toLowerCase();
  const isFairCatch = desc.includes('fair catch');
  const isTouchback = play.yardsGained === 0 || desc.includes('touchback');

  if (isTouchback) {
    const puntDir = toX < fromX ? -1 : 1;
    const endZoneX = puntDir < 0 ? 8.33 : 91.66;
    const eased = easeInOutQuad(t);
    const dist = Math.abs(endZoneX - fromX);
    return { x: fromX + (endZoneX - fromX) * eased, y: 50 - Math.min(dist * 0.8, 38) * Math.sin(t * Math.PI) };
  }

  if (isFairCatch) {
    const eased = easeInOutQuad(t);
    const dist = Math.abs(toX - fromX);
    return { x: fromX + (toX - fromX) * eased, y: 50 - Math.min(dist * 0.9, 38) * Math.sin(t * Math.PI) };
  }

  const kickPhaseEnd = 0.45;
  const travelDist = toX - fromX;
  const overshoot = travelDist * 0.2;
  const landingX = toX + overshoot;

  if (t < kickPhaseEnd) {
    const kickT = t / kickPhaseEnd;
    const eased = easeInOutQuad(kickT);
    const x = fromX + (landingX - fromX) * eased;
    const dist = Math.abs(landingX - fromX);
    return { x, y: 50 - Math.min(dist * 0.9, 38) * Math.sin(kickT * Math.PI) };
  }

  const returnT = (t - kickPhaseEnd) / (1 - kickPhaseEnd);
  const eased = easeOutQuad(returnT);
  const x = landingX + (toX - landingX) * eased;
  const amplitude = play.isTouchdown ? 18 : 14;
  return { x, y: 50 + Math.sin(returnT * Math.PI * 3) * amplitude * (1 - returnT * 0.5) };
}

// ── 3D-specific ball trajectory (world coordinates) ────────────────

/**
 * Convert 2D field percentage ball position to 3D world coordinates.
 * In 3D: X = length (-60 to +60), Y = height (0 = ground), Z = width (-26.65 to +26.65).
 *
 * For pass plays, Y includes arc height. For kicks, Y includes flight arc.
 */
export function calculateBallPosition3D(
  play: PlayResult,
  fromX: number,
  toX: number,
  t: number,
  possession: 'home' | 'away',
): { x: number; y: number; z: number } {
  const pos2d = calculateBallPosition(play, fromX, toX, t, possession);

  // Convert percentage to world coords
  const worldX = (pos2d.x / 100) * 120 - 60;
  const worldZ = (pos2d.y / 100) * 53.33 - 26.65;

  // Calculate Y (height) based on play type and phase
  let worldY = 0.8; // Default ball-at-waist height

  const offDir = possession === 'away' ? -1 : 1;
  const isPlayAction = play.call === 'play_action_short' || play.call === 'play_action_deep';
  const isScreen = play.call === 'screen_pass';

  if (play.type === 'pass_complete' || play.type === 'pass_incomplete') {
    const holdEnd = isPlayAction ? 0.42 : 0.32;
    const throwEnd = play.type === 'pass_incomplete' ? 0.72 : 0.82;

    if (t >= holdEnd && t < throwEnd) {
      // Ball in flight — parabolic arc
      const flightT = (t - holdEnd) / (throwEnd - holdEnd);
      const passDist = Math.abs(toX - fromX);
      const arcHeight = isScreen ? 0.5 : passDist < 10 ? 3 : passDist < 20 ? 6 : 10;
      worldY = 2 + arcHeight * Math.sin(flightT * Math.PI);
    } else if (play.type === 'pass_incomplete' && t >= 0.72) {
      // Falling to ground
      const dropT = (t - 0.72) / 0.28;
      worldY = 2 * (1 - dropT);
    } else if (t < holdEnd) {
      worldY = 2; // QB holding at chest height
    }
  } else if (play.type === 'kickoff' || play.type === 'punt') {
    const kickPhaseEnd = 0.45;
    const isTouchback = play.yardsGained === 0;
    const totalDist = Math.abs(toX - fromX);

    if (play.type === 'kickoff') {
      if (isTouchback || t < kickPhaseEnd) {
        const kickT = isTouchback ? t : t / kickPhaseEnd;
        const arcHeight = Math.min(totalDist * 0.15, 15);
        worldY = arcHeight * Math.sin(kickT * Math.PI);
      } else {
        worldY = 0.8; // Return phase
      }
    } else {
      // Punt
      const desc = (play.description || '').toLowerCase();
      const isFairCatch = desc.includes('fair catch');
      const isPuntTouchback = play.yardsGained === 0 || desc.includes('touchback');
      if (isPuntTouchback || isFairCatch || t < kickPhaseEnd) {
        const kickT = (isPuntTouchback || isFairCatch) ? t : t / kickPhaseEnd;
        const arcHeight = Math.min(totalDist * 0.12, 12);
        worldY = arcHeight * Math.sin(kickT * Math.PI);
      } else {
        worldY = 0.8;
      }
    }
  } else if (play.type === 'field_goal' || play.type === 'extra_point') {
    const arcHeight = play.type === 'extra_point' ? 8 : 12;
    worldY = arcHeight * Math.sin(t * Math.PI);
  } else if (play.type === 'sack') {
    worldY = t < 0.5 ? 2 : 2 * (1 - (t - 0.5) / 0.5);
  }

  return { x: worldX, y: Math.max(0, worldY), z: worldZ };
}
