/**
 * PlayChoreographer — simplified animation engine.
 *
 * Core principle: ball is ALWAYS attached to its holder or on a flight arc.
 * Players move with clear intent toward readable destinations.
 * No complex phase system — just snap → play → result.
 */

import type { ChoreographyFrame, PlayContext, EntityState, BallState, BallOwner } from './types';
import type { PlayResult } from '@/lib/simulation/types';
import {
  computeFormationPositions,
  fieldPctToWorld,
  type DotPos,
} from './play-animation';
import { getIdlePositions } from '@/components/game/field/formation-data';
import {
  easeOutCubic, easeInOutQuad, easeOutQuad,
  clamp, lerp, interpolateRoute, CONCEPT_ROUTES, getRouteShape,
} from './ball-trajectory';

// ── Timing ────────────────────────────────────────────────────

export const PRE_SNAP_MS = 600;
export const SNAP_MS = 200;
export const RESULT_MS = 800;
export const POST_PLAY_MS = 200;

export function getDevelopmentMs(play: PlayResult | null): number {
  if (!play) return 2400;
  if (play.type === 'kickoff') {
    if (play.yardsGained === 0) return 2000;
    if (play.isTouchdown) return 3500;
    return 2800;
  }
  if (play.type === 'punt') return 2600;
  if (play.type === 'field_goal' || play.type === 'extra_point') return 2000;
  if (play.type === 'kneel' || play.type === 'spike') return 1200;
  if (play.type === 'pass_complete' || play.type === 'pass_incomplete') {
    if (play.call === 'pass_deep' || play.call === 'play_action_deep') return 3200;
    return 2800;
  }
  if (play.type === 'sack') return 2400;
  return 2400;
}

export function getTotalMs(play: PlayResult | null): number {
  return PRE_SNAP_MS + SNAP_MS + getDevelopmentMs(play) + RESULT_MS + POST_PLAY_MS;
}

// ── Snap Positions ────────────────────────────────────────────

export function getSnapPositions(play: PlayResult, losX: number, offDir: number): {
  offense: EntityState[];
  defense: EntityState[];
} {
  const { offPositions, defPositions } = computeFormationPositions(play, losX, offDir);
  return {
    offense: offPositions.map(d => ({ x: d.x, y: d.y, role: d.role })),
    defense: defPositions.map(d => ({ x: d.x, y: d.y, role: d.role })),
  };
}

export function getIdleEntities(losX: number, offDir: number): {
  offense: EntityState[];
  defense: EntityState[];
} {
  const off = getIdlePositions(losX, offDir, 'offense');
  const def = getIdlePositions(losX, offDir, 'defense');
  return {
    offense: off.map(p => ({ x: p.x, y: p.y, role: p.role })),
    defense: def.map(p => ({ x: p.x, y: p.y, role: p.role })),
  };
}

// ── Development Frame ─────────────────────────────────────────

/**
 * Compute frame during development phase.
 * t: 0-1 progress through development.
 * Returns positions for all 22 + ball with ownership.
 */
export function computeDevelopment(
  t: number,
  ctx: PlayContext,
  snapOff: EntityState[],
  snapDef: EntityState[],
): ChoreographyFrame {
  const { play } = ctx;

  switch (play.type) {
    case 'pass_complete':
    case 'pass_incomplete':
    case 'sack':
      return computePass(t, ctx, snapOff, snapDef);
    case 'run':
    case 'scramble':
    case 'two_point':
      return computeRun(t, ctx, snapOff, snapDef);
    case 'kickoff':
      return computeKickoff(t, ctx, snapOff, snapDef);
    case 'punt':
      return computePunt(t, ctx, snapOff, snapDef);
    case 'field_goal':
    case 'extra_point':
      return computeFieldGoal(t, ctx, snapOff, snapDef);
    default:
      return computeRun(t, ctx, snapOff, snapDef);
  }
}

// ── Pass Play ─────────────────────────────────────────────────

const THROW_TIME = 0.30;  // QB releases at 30%
const CATCH_TIME = 0.75;  // Ball arrives at 75%

function computePass(t: number, ctx: PlayContext, snapOff: EntityState[], snapDef: EntityState[]): ChoreographyFrame {
  const { play, offDir, losX, toX } = ctx;
  const eased = easeOutCubic(t);
  const isSack = play.type === 'sack';
  const isComplete = play.type === 'pass_complete';
  const isPA = play.call === 'play_action_short' || play.call === 'play_action_deep';
  const dropDist = isPA ? 5 : 4;

  // Find key player indices
  const qbIdx = snapOff.findIndex(p => p.role === 'QB');
  const wrIndices = snapOff.reduce<number[]>((acc, p, i) => (p.role === 'WR' || p.role === 'TE') ? [...acc, i] : acc, []);
  const primaryWrIdx = wrIndices[0] ?? -1;

  // ── QB Position ───────────────────────────────────────
  let qbX = snapOff[qbIdx >= 0 ? qbIdx : 0].x;
  let qbY = snapOff[qbIdx >= 0 ? qbIdx : 0].y;

  if (isSack) {
    if (t < 0.4) {
      qbX = qbX + offDir * dropDist * easeOutCubic(t / 0.4);
    } else {
      const sackStart = qbX + offDir * dropDist;
      qbX = lerp(sackStart, toX, easeOutCubic((t - 0.4) / 0.6));
      qbY = qbY + Math.sin((t - 0.4) * 10) * 2;
    }
  } else {
    const dropT = Math.min(t / 0.25, 1);
    qbX = qbX + offDir * dropDist * easeOutCubic(dropT);
  }

  // ── Primary WR route → catch point ────────────────────
  // WR runs toward where the ball will be caught (toX)
  const wrStart = primaryWrIdx >= 0 ? snapOff[primaryWrIdx] : snapOff[0];
  const routePoints = getRouteShape(play.call, play.yardsGained, play.routeConcept);
  const routeT = Math.min(t / CATCH_TIME, 1);
  const routePt = interpolateRoute(routePoints, routeT);
  const routeScale = 20;
  const lateralScale = 12;
  let wrX = clamp(wrStart.x - offDir * routeScale * routePt.dx, 2, 98);
  let wrY = clamp(wrStart.y + routePt.dy * lateralScale, 5, 95);

  // After catch, WR runs toward toX
  if (isComplete && t > CATCH_TIME) {
    const racT = easeOutCubic((t - CATCH_TIME) / (1 - CATCH_TIME));
    wrX = clamp(lerp(wrX, toX, racT * 0.6), 2, 98);
    wrY = clamp(lerp(wrY, 50, racT * 0.3), 5, 95);
  }

  // ── Build offense array ───────────────────────────────
  const offense: EntityState[] = snapOff.map((p, i) => {
    if (i === qbIdx || (qbIdx < 0 && p.role === 'QB')) {
      return { x: clamp(qbX, 2, 98), y: clamp(qbY, 5, 95), role: p.role };
    }
    if (i === primaryWrIdx) {
      return { x: wrX, y: wrY, role: p.role };
    }
    // Other WRs: run complement routes
    if (p.role === 'WR' || p.role === 'TE') {
      const idx = wrIndices.indexOf(i);
      const compT = easeOutCubic(Math.min(t / 0.8, 1));
      const spread = idx % 2 === 0 ? 8 : -6;
      return {
        x: clamp(p.x - offDir * 10 * compT, 2, 98),
        y: clamp(p.y + spread * compT, 5, 95),
        role: p.role,
      };
    }
    // OL: push forward into pass protection
    if (['C', 'LG', 'RG', 'LT', 'RT'].includes(p.role)) {
      return { x: clamp(p.x + offDir * 2 * eased, 2, 98), y: p.y, role: p.role };
    }
    // RB: chip block then release
    if (p.role === 'RB' || p.role === 'FB') {
      return { x: clamp(p.x + offDir * 1.5 * eased, 2, 98), y: p.y + Math.sin(t * 3) * 2, role: p.role };
    }
    return p;
  });

  // ── Defense: converge on ball carrier ─────────────────
  const targetX = isSack ? qbX : (t > CATCH_TIME && isComplete ? wrX : toX);
  const targetY = isSack ? qbY : (t > CATCH_TIME && isComplete ? wrY : 50);
  const defense = computeDefensePursuit(t, snapDef, targetX, targetY, offDir, isSack ? 0.8 : 0.5);

  // ── Ball ──────────────────────────────────────────────
  let ball: BallState;
  const qbEntity = offense[qbIdx >= 0 ? qbIdx : 0];
  const wrEntity = offense[primaryWrIdx >= 0 ? primaryWrIdx : 0];

  if (isSack) {
    // Ball with QB the whole time
    ball = { x: qbEntity.x, y: qbEntity.y, height: t < 0.5 ? 2 : lerp(2, 0.8, (t - 0.5) * 2), spin: 0, owner: { type: 'held', side: 'offense', index: qbIdx >= 0 ? qbIdx : 0 } };
  } else if (t < THROW_TIME) {
    // QB holds ball
    ball = { x: qbEntity.x, y: qbEntity.y, height: 2, spin: 0, owner: { type: 'held', side: 'offense', index: qbIdx >= 0 ? qbIdx : 0 } };
  } else if (t < CATCH_TIME) {
    // Ball in flight — interpolate from QB to WR position
    const flightT = (t - THROW_TIME) / (CATCH_TIME - THROW_TIME);
    const smoothT = easeInOutQuad(flightT);
    const bx = lerp(qbEntity.x, wrEntity.x, smoothT);
    const by = lerp(qbEntity.y, wrEntity.y, smoothT);
    const dist = Math.abs(wrEntity.x - qbEntity.x) + Math.abs(wrEntity.y - qbEntity.y) * 0.3;
    const arcH = play.call === 'screen_pass' ? 0.5 : Math.min(dist * 0.3, 10);
    const bh = 2 + arcH * Math.sin(smoothT * Math.PI);
    ball = { x: bx, y: by, height: bh, spin: 10, owner: { type: 'flight', progress: smoothT } };
  } else if (isComplete) {
    // WR caught it
    ball = { x: wrEntity.x, y: wrEntity.y, height: 0.8, spin: 0, owner: { type: 'held', side: 'offense', index: primaryWrIdx >= 0 ? primaryWrIdx : 0 } };
  } else {
    // Incomplete — ball falls
    const dropT = (t - CATCH_TIME) / (1 - CATCH_TIME);
    ball = { x: wrEntity.x, y: wrEntity.y, height: Math.max(0, 2 * (1 - dropT * 2)), spin: 3, owner: { type: 'ground' } };
  }

  return { offense, defense, ball };
}

// ── Run Play ──────────────────────────────────────────────────

function computeRun(t: number, ctx: PlayContext, snapOff: EntityState[], snapDef: EntityState[]): ChoreographyFrame {
  const { play, offDir, losX, toX } = ctx;
  const eased = easeOutCubic(t);
  const travel = toX - losX;
  const isScramble = play.type === 'scramble';

  // Ball carrier path
  let carrierX: number;
  let carrierY: number;

  if (isScramble) {
    carrierX = losX + travel * eased;
    carrierY = 50 + Math.sin(t * Math.PI * 3) * 14 * (1 - t * 0.5);
  } else {
    const call = play.call || '';
    if (call.includes('outside') || call.includes('sweep')) {
      // Outside run: lateral first, then turn upfield
      if (t < 0.3) {
        const sweepT = easeOutQuad(t / 0.3);
        carrierX = losX + travel * 0.1 * sweepT;
        carrierY = 50 + offDir * 22 * sweepT;
      } else {
        const sprintT = (t - 0.3) / 0.7;
        carrierX = lerp(losX + travel * 0.1, toX, easeOutCubic(sprintT));
        carrierY = lerp(50 + offDir * 22, 50, easeOutCubic(sprintT));
      }
    } else if (call === 'run_counter') {
      // Counter: fake one way, cut back
      if (t < 0.25) {
        carrierX = losX + travel * 0.05 * (t / 0.25);
        carrierY = 50 - offDir * 18 * easeOutQuad(t / 0.25);
      } else {
        const cutT = (t - 0.25) / 0.75;
        carrierX = lerp(losX + travel * 0.05, toX, easeOutCubic(cutT));
        carrierY = lerp(50 - offDir * 18, 50, easeOutCubic(cutT));
      }
    } else if (call === 'run_draw') {
      // Draw: fake pass, then run
      if (t < 0.35) {
        carrierX = losX + offDir * 3 * easeOutQuad(t / 0.35);
        carrierY = 50;
      } else {
        const burstT = (t - 0.35) / 0.65;
        carrierX = lerp(losX + offDir * 3, toX, easeOutCubic(burstT));
        carrierY = 50 + Math.sin(burstT * Math.PI * 2) * 8 * (1 - burstT);
      }
    } else {
      // Inside run: straight ahead with slight juke
      carrierX = losX + travel * eased;
      carrierY = 50 + Math.sin(t * Math.PI * 2) * 8 * (1 - t);
    }
  }

  carrierX = clamp(carrierX, 2, 98);
  carrierY = clamp(carrierY, 5, 95);

  // Find carrier index
  const carrierIdx = isScramble
    ? snapOff.findIndex(p => p.role === 'QB')
    : snapOff.findIndex(p => p.role === 'RB' || p.role === 'FB');
  const qbIdx = snapOff.findIndex(p => p.role === 'QB');

  const offense: EntityState[] = snapOff.map((p, i) => {
    if (i === carrierIdx || (carrierIdx < 0 && i === 0)) {
      return { x: carrierX, y: carrierY, role: p.role };
    }
    if (p.role === 'QB' && !isScramble) {
      // QB hands off then drifts
      const handoffT = Math.min(t / 0.15, 1);
      return { x: clamp(p.x + offDir * 1.5 * easeOutCubic(handoffT), 2, 98), y: p.y, role: p.role };
    }
    if (['C', 'LG', 'RG', 'LT', 'RT'].includes(p.role)) {
      // OL: run block forward
      return { x: clamp(p.x - offDir * 4 * eased, 2, 98), y: p.y, role: p.role };
    }
    if (p.role === 'WR') {
      // WRs block downfield
      return { x: clamp(p.x - offDir * 6 * eased, 2, 98), y: p.y + (p.y > 50 ? 3 : -3) * eased, role: p.role };
    }
    if (p.role === 'TE') {
      return { x: clamp(p.x - offDir * 3.5 * eased, 2, 98), y: p.y, role: p.role };
    }
    return p;
  });

  const defense = computeDefensePursuit(t, snapDef, carrierX, carrierY, offDir, 0.6);

  // Ball with carrier
  const holderIdx = carrierIdx >= 0 ? carrierIdx : 0;
  const ballHolder = t < 0.12 && !isScramble
    ? { type: 'held' as const, side: 'offense' as const, index: qbIdx >= 0 ? qbIdx : 0 }
    : { type: 'held' as const, side: 'offense' as const, index: holderIdx };
  const holder = offense[ballHolder.index];

  return {
    offense,
    defense,
    ball: { x: holder.x, y: holder.y, height: 0.8, spin: 0, owner: ballHolder },
  };
}

// ── Kickoff ───────────────────────────────────────────────────

const KO_FLIGHT_END = 0.40;

function computeKickoff(t: number, ctx: PlayContext, snapOff: EntityState[], snapDef: EntityState[]): ChoreographyFrame {
  const { play, offDir, losX, toX } = ctx;
  const isTouchback = play.yardsGained === 0;
  const kickDir = toX < losX ? -1 : 1;
  const receiverEndZone = kickDir < 0 ? 8.33 : 91.66;
  const meta = play.kickoffMeta;
  const catchSpotPct = meta ? (meta.catchSpot / 100) : 0.85;
  const landingX = losX + (receiverEndZone - losX) * Math.min(catchSpotPct, 0.95);
  const eased = easeOutCubic(t);

  // Kicking team sprints downfield
  const offense: EntityState[] = snapOff.map((p, i) => {
    if (p.role === 'K') {
      if (t < 0.1) return { x: clamp(p.x - offDir * 3 * (t / 0.1), 2, 98), y: p.y, role: p.role };
      return { x: clamp(p.x - offDir * 12 * easeOutCubic((t - 0.1) / 0.9), 2, 98), y: p.y, role: p.role };
    }
    const stagger = (i % 5) * 0.02;
    const adj = Math.max(0, t - stagger);
    return { x: clamp(p.x - offDir * 42 * easeOutCubic(adj), 2, 98), y: clamp(p.y + Math.sin(adj * 3 + i) * 2, 5, 95), role: p.role };
  });

  // Receiving team
  const krIdx = snapDef.findIndex(pp => pp.role === 'KR');
  const defense: EntityState[] = snapDef.map((p, i) => {
    if (p.role === 'KR') {
      if (isTouchback || t < KO_FLIGHT_END) return { ...p, role: p.role };
      const returnT = (t - KO_FLIGHT_END) / (1 - KO_FLIGHT_END);
      const rx = lerp(landingX, toX, easeOutCubic(returnT));
      const ry = 50 + Math.sin(returnT * Math.PI * 3) * 14 * (1 - returnT * 0.5);
      return { x: clamp(rx, 2, 98), y: clamp(ry, 5, 95), role: p.role };
    }
    if (p.role === 'WDG') {
      if (t < KO_FLIGHT_END) return p;
      const rt = (t - KO_FLIGHT_END) / (1 - KO_FLIGHT_END);
      const krPos = defense[krIdx >= 0 ? krIdx : 0] ?? p;
      return { x: clamp(lerp(p.x, toX, easeOutCubic(rt) * 0.5), 2, 98), y: clamp(lerp(p.y, 50, rt * 0.4), 5, 95), role: p.role };
    }
    // Blockers engage
    if (t > KO_FLIGHT_END) {
      const rt = (t - KO_FLIGHT_END) / (1 - KO_FLIGHT_END);
      return { x: clamp(p.x + offDir * 12 * easeOutCubic(rt), 2, 98), y: clamp(p.y + (50 - p.y) * rt * 0.3, 5, 95), role: p.role };
    }
    return p;
  });

  // Ball
  let ball: BallState;
  const kIdx = offense.findIndex(pp => pp.role === 'K');
  const kicker = offense[kIdx >= 0 ? kIdx : 0];

  if (t < 0.08) {
    ball = { x: kicker.x, y: kicker.y, height: 0.4, spin: 0, owner: { type: 'held', side: 'offense', index: kIdx >= 0 ? kIdx : 0 } };
  } else if (t < KO_FLIGHT_END || isTouchback) {
    const flightDur = isTouchback ? (1 - 0.08) : (KO_FLIGHT_END - 0.08);
    const kickT = Math.min((t - 0.08) / flightDur, 1);
    const target = isTouchback ? receiverEndZone : landingX;
    const dist = Math.abs(target - kicker.x);
    const arcH = Math.min(dist * 0.15, 15);
    ball = {
      x: lerp(kicker.x, target, easeInOutQuad(kickT)),
      y: 50,
      height: arcH * Math.sin(kickT * Math.PI),
      spin: 8,
      owner: { type: 'kicked', progress: easeInOutQuad(kickT), arcHeight: arcH },
    };
  } else {
    // Ball with returner
    const kr = defense[krIdx >= 0 ? krIdx : 0];
    ball = { x: kr.x, y: kr.y, height: 0.8, spin: 0, owner: { type: 'held', side: 'defense', index: krIdx >= 0 ? krIdx : 0 } };
  }

  return { offense, defense, ball };
}

// ── Punt ──────────────────────────────────────────────────────

function computePunt(t: number, ctx: PlayContext, snapOff: EntityState[], snapDef: EntityState[]): ChoreographyFrame {
  const { play, offDir, losX, toX } = ctx;
  const desc = (play.description || '').toLowerCase();
  const isFairCatch = desc.includes('fair catch');
  const isTouchback = play.yardsGained === 0 || desc.includes('touchback');
  const eased = easeOutCubic(t);
  const targetX = isTouchback ? (toX < losX ? 8.33 : 91.66) : toX;
  const dist = Math.abs(targetX - losX);
  const arcH = Math.min(dist * 0.12, 12);
  const flightEnd = 0.50;

  const pIdx = snapOff.findIndex(pp => pp.role === 'P');
  const prIdx = snapDef.findIndex(pp => pp.role === 'PR');

  const offense: EntityState[] = snapOff.map((p, i) => {
    if (p.role === 'P') {
      return { x: clamp(p.x - offDir * 3 * Math.min(t / 0.15, 1), 2, 98), y: p.y, role: p.role };
    }
    if (p.role === 'GUN') {
      return { x: clamp(p.x - offDir * 40 * eased, 2, 98), y: clamp(p.y + (p.y > 50 ? -6 : 6) * eased, 5, 95), role: p.role };
    }
    const rel = Math.max(0, t - 0.3) / 0.7;
    return { x: clamp(p.x - offDir * 12 * easeOutCubic(rel), 2, 98), y: p.y, role: p.role };
  });

  const defense: EntityState[] = snapDef.map((p, i) => {
    if (p.role === 'PR') {
      if (t < flightEnd) return p;
      if (isFairCatch || isTouchback) return { ...p, x: clamp(targetX, 2, 98), y: 50 };
      const rt = (t - flightEnd) / (1 - flightEnd);
      return { x: clamp(lerp(targetX, toX, easeOutCubic(rt)), 2, 98), y: clamp(50 + Math.sin(rt * Math.PI * 2) * 10, 5, 95), role: p.role };
    }
    if (p.role === 'JAM') return { x: clamp(p.x + offDir * 4 * eased, 2, 98), y: p.y, role: p.role };
    return { x: clamp(p.x + offDir * 10 * eased, 2, 98), y: p.y, role: p.role };
  });

  // Ball
  let ball: BallState;
  const punter = offense[pIdx >= 0 ? pIdx : 0];
  const pr = defense[prIdx >= 0 ? prIdx : 0];

  if (t < 0.12) {
    ball = { x: punter.x, y: punter.y, height: 1.5, spin: 0, owner: { type: 'held', side: 'offense', index: pIdx >= 0 ? pIdx : 0 } };
  } else if (t < flightEnd || isTouchback || isFairCatch) {
    const dur = (isTouchback || isFairCatch) ? (1 - 0.12) : (flightEnd - 0.12);
    const kickT = Math.min((t - 0.12) / dur, 1);
    ball = {
      x: lerp(punter.x, targetX, easeInOutQuad(kickT)),
      y: 50,
      height: arcH * Math.sin(kickT * Math.PI),
      spin: 6,
      owner: { type: 'kicked', progress: easeInOutQuad(kickT), arcHeight: arcH },
    };
  } else {
    ball = { x: pr.x, y: pr.y, height: 0.8, spin: 0, owner: { type: 'held', side: 'defense', index: prIdx >= 0 ? prIdx : 0 } };
  }

  return { offense, defense, ball };
}

// ── Field Goal ────────────────────────────────────────────────

function computeFieldGoal(t: number, ctx: PlayContext, snapOff: EntityState[], snapDef: EntityState[]): ChoreographyFrame {
  const { play, possession } = ctx;
  const goalPostX = possession === 'away' ? 91.66 : 8.33;
  const arcH = play.type === 'extra_point' ? 8 : 12;

  const hIdx = snapOff.findIndex(pp => pp.role === 'H');
  const offense: EntityState[] = snapOff.map((p, i) => {
    if (p.role === 'K' && t < 0.2) return { ...p, y: clamp(p.y + Math.sin(t / 0.2 * Math.PI) * 1.5, 5, 95) };
    return { ...p, x: clamp(p.x + Math.sin(t * 6 + i) * 0.3, 2, 98) };
  });

  const defense: EntityState[] = snapDef.map((p, i) => {
    if (p.role === 'RSH') return { x: clamp(p.x + (possession === 'away' ? -1 : 1) * 4 * easeOutCubic(Math.min(t * 2, 1)), 2, 98), y: p.y, role: p.role };
    return p;
  });

  const holder = offense[hIdx >= 0 ? hIdx : 0];
  let ball: BallState;
  if (t < 0.15) {
    ball = { x: holder.x, y: holder.y, height: 0.3, spin: 0, owner: { type: 'held', side: 'offense', index: hIdx >= 0 ? hIdx : 0 } };
  } else {
    const flightT = (t - 0.15) / 0.85;
    ball = {
      x: lerp(holder.x, goalPostX, easeInOutQuad(flightT)),
      y: 50,
      height: arcH * Math.sin(flightT * Math.PI),
      spin: 6,
      owner: { type: 'kicked', progress: easeInOutQuad(flightT), arcHeight: arcH },
    };
  }

  return { offense, defense, ball };
}

// ── Defense Pursuit Helper ────────────────────────────────────

function computeDefensePursuit(
  t: number,
  snapDef: EntityState[],
  targetX: number,
  targetY: number,
  offDir: number,
  aggressiveness: number,
): EntityState[] {
  const eased = easeOutCubic(t);
  return snapDef.map((p, i) => {
    const isDL = ['DE', 'DT', 'NT'].includes(p.role);
    const isLB = ['LB', 'ILB', 'OLB'].includes(p.role);
    const isCB = ['CB', 'NCB'].includes(p.role);
    const speed = isDL ? 0.6 : isLB ? 0.7 : isCB ? 0.55 : 0.5;

    return {
      x: clamp(lerp(p.x, targetX, speed * aggressiveness * eased), 2, 98),
      y: clamp(lerp(p.y, targetY, 0.4 * aggressiveness * eased), 5, 95),
      role: p.role,
    };
  });
}

// Re-export
export { fieldPctToWorld } from './play-animation';
