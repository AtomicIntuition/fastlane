/**
 * Play animation logic — extracted from players-overlay.tsx for shared use.
 * Outputs world coordinates for 3D rendering, using the same phase-based
 * timing system: idle → pre_snap → snap → development → result → post_play.
 */

import type { PlayResult, Formation, DefensivePersonnel } from '@/lib/simulation/types';
import {
  OFFENSIVE_FORMATIONS,
  DEFENSIVE_FORMATIONS,
  SPECIAL_TEAMS,
  getAbsolutePositions,
  getIdlePositions,
  type PlayerPosition,
} from '@/components/game/field/formation-data';
import {
  easeOutCubic,
  easeInOutQuad,
  easeOutQuad,
  clamp,
  lerp,
  interpolateRoute,
  CONCEPT_ROUTES,
  KICKOFF_PHASE_END,
} from './ball-trajectory';

// ── Timing constants (same as play-scene.tsx) ──────────────

export const PRE_SNAP_MS = 800;
export const SNAP_MS = 250;
export const DEVELOPMENT_MS = 2400;
export const RESULT_MS = 600;
export const POST_PLAY_MS = 200;

export const KICKOFF_PRE_SNAP_MS = 1000;
export const KICKOFF_SNAP_MS = 250;
export const KICKOFF_RESULT_MS = 600;
export const KICKOFF_POST_PLAY_MS = 200;

export function getKickoffDevMs(play: PlayResult | null): number {
  if (!play || play.type !== 'kickoff') return DEVELOPMENT_MS;
  if (play.yardsGained === 0) return 2000;
  if (play.isTouchdown) return 3500;
  if (play.yardsGained >= 35) return 3000;
  return 2800;
}

export type Phase = 'idle' | 'pre_snap' | 'snap' | 'development' | 'result' | 'post_play';

export interface DotPos {
  x: number; // field percentage (0-100)
  y: number; // field percentage (0-100)
  role: string;
}

// ── Complement routes for non-primary WRs ────────────────────
const COMPLEMENT_ROUTES = [
  [{ dx: 0, dy: 0 }, { dx: 0.55, dy: 0 }, { dx: 0.85, dy: -0.15 }, { dx: 1, dy: -0.05 }],
  [{ dx: 0, dy: 0 }, { dx: 0.3, dy: 0.05 }, { dx: 0.7, dy: 0.08 }, { dx: 1, dy: 0.1 }],
  [{ dx: 0, dy: 0 }, { dx: 0.4, dy: 0 }, { dx: 0.6, dy: 0.2 }, { dx: 1, dy: 0.7 }],
  [{ dx: 0, dy: 0 }, { dx: 0.5, dy: 0.1 }, { dx: 0.6, dy: 0.1 }, { dx: 1, dy: 0.1 }],
];

function getRouteForConcept(routeConcept?: string): { dx: number; dy: number }[] {
  if (routeConcept && CONCEPT_ROUTES[routeConcept]) {
    return CONCEPT_ROUTES[routeConcept];
  }
  return [{ dx: 0, dy: 0 }, { dx: 0.4, dy: 0.15 }, { dx: 1, dy: 0.3 }];
}

// ── Formation computation ─────────────────────────────────────

export function computeFormationPositions(
  play: PlayResult,
  losX: number,
  offDir: number,
): { offPositions: DotPos[]; defPositions: DotPos[] } {
  const playType = play.type;

  if (playType === 'kickoff') {
    return {
      offPositions: getAbsolutePositions(SPECIAL_TEAMS.kickoff.kicking, losX, offDir, 'offense'),
      defPositions: getAbsolutePositions(SPECIAL_TEAMS.kickoff.receiving, losX, offDir, 'defense'),
    };
  }
  if (playType === 'punt') {
    return {
      offPositions: getAbsolutePositions(SPECIAL_TEAMS.punt.kicking, losX, offDir, 'offense'),
      defPositions: getAbsolutePositions(SPECIAL_TEAMS.punt.receiving, losX, offDir, 'defense'),
    };
  }
  if (playType === 'field_goal' || playType === 'extra_point') {
    return {
      offPositions: getAbsolutePositions(SPECIAL_TEAMS.field_goal.kicking, losX, offDir, 'offense'),
      defPositions: getAbsolutePositions(SPECIAL_TEAMS.field_goal.blocking, losX, offDir, 'defense'),
    };
  }

  const formation: Formation = play.formation || 'shotgun';
  const defPersonnel: DefensivePersonnel = play.defensiveCall?.personnel || 'base_4_3';
  const offFormation = OFFENSIVE_FORMATIONS[formation] || OFFENSIVE_FORMATIONS.shotgun;
  const defFormation = DEFENSIVE_FORMATIONS[defPersonnel] || DEFENSIVE_FORMATIONS.base_4_3;

  return {
    offPositions: getAbsolutePositions(offFormation, losX, offDir, 'offense'),
    defPositions: getAbsolutePositions(defFormation, losX, offDir, 'defense'),
  };
}

// ── Animate offense (development phase) ──────────────────────

export function animateOffense(
  playType: string,
  startPositions: DotPos[],
  t: number,
  eased: number,
  fromX: number,
  toX: number,
  play: PlayResult,
  offDir: number,
): DotPos[] {
  return startPositions.map((p, i) => {
    const isOL = p.role === 'C' || p.role === 'LG' || p.role === 'RG' || p.role === 'LT' || p.role === 'RT';
    const isQB = p.role === 'QB';
    const isRB = p.role === 'RB' || p.role === 'FB';
    const isWR = p.role === 'WR';
    const isTE = p.role === 'TE';

    if (playType === 'pass_complete' || playType === 'pass_incomplete' || playType === 'sack') {
      if (isOL) {
        return { ...p, x: clamp(p.x + offDir * (2.5 * eased), 2, 98), y: p.y + Math.sin(t * 3 + i) * 0.5, role: p.role };
      }
      if (isQB) {
        if (playType === 'sack') {
          const dropDist = 4;
          if (t < 0.35) return { ...p, x: clamp(p.x + offDir * dropDist * (t / 0.35), 2, 98), role: p.role };
          const sackT = (t - 0.35) / 0.65;
          return { ...p, x: clamp(lerp(p.x + offDir * dropDist, toX, sackT), 2, 98), y: p.y + Math.sin(sackT * 8) * 1.5, role: p.role };
        }
        const dropDist = play.call?.includes('play_action') ? 5 : 4;
        const dropT = Math.min(t / 0.3, 1);
        return { ...p, x: clamp(p.x + offDir * dropDist * easeOutCubic(dropT), 2, 98), role: p.role };
      }
      if (isWR || isTE) {
        const routeIdx = startPositions.filter((pp, ii) => ii < i && (pp.role === 'WR' || pp.role === 'TE')).length;
        const isPrimary = routeIdx === 0;
        const route = isPrimary ? getRouteForConcept(play.routeConcept) : COMPLEMENT_ROUTES[routeIdx % COMPLEMENT_ROUTES.length];
        const routePt = interpolateRoute(route, t);
        const routeScale = isPrimary ? 18 : 12;
        const lateralScale = isPrimary ? 10 : 6;
        return { ...p, x: clamp(p.x - offDir * routeScale * routePt.dx, 2, 98), y: clamp(p.y + routePt.dy * lateralScale, 5, 95), role: p.role };
      }
      if (isRB) {
        return { ...p, x: clamp(p.x + offDir * 1.5 * eased, 2, 98), y: p.y + Math.sin(t * 4) * 2, role: p.role };
      }
    }

    if (playType === 'run' || playType === 'scramble' || playType === 'two_point') {
      if (isOL) return { ...p, x: clamp(p.x - offDir * 4 * eased, 2, 98), y: p.y, role: p.role };
      if (isRB || (playType === 'scramble' && isQB)) {
        const ballX = lerp(fromX, toX, eased);
        const weave = Math.sin(t * Math.PI * 3) * 4 * (1 - t);
        return { ...p, x: clamp(ballX, 2, 98), y: clamp(50 + weave, 5, 95), role: p.role };
      }
      if (isQB && playType !== 'scramble') {
        const handoffT = Math.min(t / 0.2, 1);
        return { ...p, x: clamp(p.x + offDir * 1.5 * easeOutCubic(handoffT), 2, 98), role: p.role };
      }
      if (isWR) return { ...p, x: clamp(p.x - offDir * 6 * eased, 2, 98), y: p.y + (p.y > 50 ? 3 : -3) * eased, role: p.role };
      if (isTE) return { ...p, x: clamp(p.x - offDir * 3.5 * eased, 2, 98), role: p.role };
    }

    if (playType === 'kickoff') {
      if (p.role === 'K') {
        if (t < 0.15) {
          const runT = t / 0.15;
          return { ...p, x: clamp(p.x - offDir * 3 * easeOutCubic(runT), 2, 98), y: clamp(p.y + Math.sin(runT * Math.PI) * 2, 5, 95), role: p.role };
        }
        const driftT = (t - 0.15) / 0.85;
        return { ...p, x: clamp(p.x - offDir * 10 * easeOutCubic(driftT), 2, 98), role: p.role };
      }
      const staggerDelay = (i % 5) * 0.03;
      const adjustedT = Math.max(0, t - staggerDelay);
      const covEased = easeOutCubic(adjustedT);
      return { ...p, x: clamp(p.x - offDir * 40 * covEased, 2, 98), y: clamp(p.y + Math.sin(adjustedT * 3 + i * 1.2) * 2, 5, 95), role: p.role };
    }

    if (playType === 'punt') {
      if (p.role === 'P') {
        const kickT = Math.min(t / 0.3, 1);
        return { ...p, x: clamp(p.x - offDir * 3 * kickT, 2, 98), role: p.role };
      }
      if (p.role === 'GUN') {
        return { ...p, x: clamp(p.x - offDir * 40 * eased, 2, 98), y: clamp(p.y + (p.y > 50 ? -6 : 6) * eased, 5, 95), role: p.role };
      }
      return { ...p, x: clamp(p.x - offDir * (t > 0.3 ? 12 * ((t - 0.3) / 0.7) : 0), 2, 98), role: p.role };
    }

    if (playType === 'field_goal' || playType === 'extra_point') {
      if (p.role === 'K' || p.role === 'H') return p;
      return { ...p, x: clamp(p.x + Math.sin(t * 6 + i) * 0.4, 2, 98), role: p.role };
    }

    return p;
  });
}

// ── Animate defense (development phase) ──────────────────────

export function animateDefense(
  playType: string,
  startPositions: DotPos[],
  t: number,
  eased: number,
  fromX: number,
  toX: number,
  offDir: number,
): DotPos[] {
  return startPositions.map((p, i) => {
    const isDL = p.role === 'DE' || p.role === 'DT' || p.role === 'NT';
    const isLB = p.role === 'LB' || p.role === 'ILB' || p.role === 'OLB';
    const isCB = p.role === 'CB' || p.role === 'NCB';
    const isS = p.role === 'S';

    if (playType === 'pass_complete' || playType === 'pass_incomplete' || playType === 'sack') {
      const isCatchPhase = t >= 0.35 && playType === 'pass_complete';
      if (isDL) {
        const rushDist = playType === 'sack' ? 8 : 5;
        if (isCatchPhase) {
          const preX = p.x + offDir * rushDist * easeOutCubic(0.35);
          const pursuitT = (t - 0.35) / 0.65;
          return { ...p, x: clamp(lerp(preX, toX, 0.4 * easeOutCubic(pursuitT)), 2, 98), y: clamp(lerp(p.y, 50, 0.3 * pursuitT), 5, 95), role: p.role };
        }
        return { ...p, x: clamp(p.x + offDir * rushDist * eased, 2, 98), y: p.y + Math.sin(t * 5 + i) * 1.5, role: p.role };
      }
      if (isLB) {
        if (isCatchPhase) {
          const preX = p.x - offDir * 3 * easeOutCubic(0.35);
          const pursuitT = (t - 0.35) / 0.65;
          return { ...p, x: clamp(lerp(preX, toX, 0.5 * easeOutCubic(pursuitT)), 2, 98), y: clamp(lerp(p.y + Math.sin(0.35 * 3 + i * 2) * 2, 50, 0.4 * pursuitT), 5, 95), role: p.role };
        }
        return { ...p, x: clamp(p.x - offDir * 3 * eased, 2, 98), y: p.y + Math.sin(t * 3 + i * 2) * 2, role: p.role };
      }
      if (isCB) {
        if (isCatchPhase) {
          const preX = p.x - offDir * 5 * easeOutCubic(0.35);
          const pursuitT = (t - 0.35) / 0.65;
          return { ...p, x: clamp(lerp(preX, toX, 0.6 * easeOutCubic(pursuitT)), 2, 98), y: clamp(lerp(p.y + Math.sin(0.35 * 4 + i) * 3, 50, 0.5 * pursuitT), 5, 95), role: p.role };
        }
        return { ...p, x: clamp(p.x - offDir * 5 * eased, 2, 98), y: p.y + Math.sin(t * 4 + i) * 3, role: p.role };
      }
      if (isS) {
        if (isCatchPhase) {
          const preX = p.x - offDir * 6 * easeOutCubic(0.35);
          const pursuitT = (t - 0.35) / 0.65;
          return { ...p, x: clamp(lerp(preX, toX, 0.55 * easeOutCubic(pursuitT)), 2, 98), y: clamp(lerp(p.y, 50, 0.45 * pursuitT), 5, 95), role: p.role };
        }
        return { ...p, x: clamp(p.x - offDir * 6 * eased, 2, 98), role: p.role };
      }
    }

    if (playType === 'run' || playType === 'scramble' || playType === 'two_point') {
      const ballX = lerp(fromX, toX, eased);
      const pursuitSpeed = isDL ? 0.6 : isLB ? 0.7 : isCB ? 0.55 : 0.5;
      return { ...p, x: clamp(lerp(p.x, ballX, pursuitSpeed * eased), 2, 98), y: clamp(lerp(p.y, 50, 0.45 * eased), 5, 95), role: p.role };
    }

    if (playType === 'kickoff') {
      if (p.role === 'KR') {
        if (t < KICKOFF_PHASE_END) return p;
        const returnT = (t - KICKOFF_PHASE_END) / (1 - KICKOFF_PHASE_END);
        const ballX = lerp(fromX, toX, easeOutCubic(returnT));
        return { ...p, x: clamp(ballX + offDir * 5, 2, 98), y: clamp(50 + Math.sin(returnT * Math.PI * 4) * 14 * (1 - returnT * 0.5), 5, 95), role: p.role };
      }
      if (p.role === 'WDG') {
        if (t < KICKOFF_PHASE_END) return p;
        const returnT = (t - KICKOFF_PHASE_END) / (1 - KICKOFF_PHASE_END);
        const ballX = lerp(fromX, toX, easeOutCubic(returnT));
        return { ...p, x: clamp(ballX + offDir * 10, 2, 98), y: clamp(p.y + (50 - p.y) * 0.3 * returnT, 5, 95), role: p.role };
      }
      return { ...p, x: clamp(p.x + offDir * 20 * eased, 2, 98), y: clamp(p.y + (50 - p.y) * 0.35 * eased, 5, 95), role: p.role };
    }

    if (playType === 'punt') {
      if (p.role === 'PR') {
        if (t < 0.45) return p;
        const returnT = (t - 0.45) / 0.55;
        return { ...p, x: clamp(lerp(p.x, toX, easeOutCubic(returnT)), 2, 98), y: clamp(50 + Math.sin(returnT * Math.PI * 2) * 10, 5, 95), role: p.role };
      }
      if (p.role === 'JAM') return { ...p, x: clamp(p.x + offDir * 4 * eased, 2, 98), role: p.role };
      return { ...p, x: clamp(p.x + offDir * 10 * eased, 2, 98), role: p.role };
    }

    if (playType === 'field_goal' || playType === 'extra_point') {
      if (isDL || p.role === 'RSH') return { ...p, x: clamp(p.x + offDir * 4 * eased, 2, 98), role: p.role };
      return p;
    }

    return p;
  });
}

// ── Convert field percentage to 3D world coordinates ────────

export function fieldPctToWorld(pctX: number, pctY: number): { x: number; z: number } {
  return {
    x: (pctX / 100) * 120 - 60,
    z: (pctY / 100) * 53.33 - 26.65,
  };
}
