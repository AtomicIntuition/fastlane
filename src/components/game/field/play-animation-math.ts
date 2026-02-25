/**
 * Ball/QB position calculation, easing functions, and animation math
 * for play-scene animations.
 *
 * Extracted from play-scene.tsx — pure functions, no React dependencies.
 */

import type { PlayResult } from '@/lib/simulation/types';
import { YARDS, yardsToPercent } from './yard-grid';
import { KICKOFF_PHASE_END } from './play-timing';

// ── Easing ───────────────────────────────────────────────────

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// ── Kickoff Landing X ────────────────────────────────────────

export function getKickoffLandingX(play: PlayResult, fromX: number, kickingTeam: 'home' | 'away'): number {
  const kickDir = kickingTeam === 'home' ? -1 : 1; // home kicks right-to-left, away kicks left-to-right
  const meta = play.kickoffMeta;

  // Short kick: ball doesn't reach landing zone — lands around the 25-30 area
  if (meta?.touchbackType === 'short') {
    // Ball lands roughly 40 yards from kicker (at ~own 25-30)
    return fromX + kickDir * yardsToPercent(meta.distance || 42);
  }

  if (meta?.distance) {
    return fromX + kickDir * yardsToPercent(meta.distance);
  }
  const receiverEndZone = kickDir < 0 ? 8.33 : 91.66;
  const catchSpotPct = meta ? (meta.catchSpot / 100) : 0.85;
  return fromX + (receiverEndZone - fromX) * Math.min(catchSpotPct, 0.95);
}

// ── Simple Ball Position (straight line, y=50 always) ────────

export function calculateSimpleBallX(
  play: PlayResult, fromX: number, toX: number, t: number,
  possession: 'home' | 'away',
): number {
  const offDir = possession === 'away' ? -1 : 1;

  switch (play.type) {
    case 'run': case 'scramble': case 'two_point': {
      // Slight hold at start (handoff), then accelerate
      if (t < 0.1) return fromX;
      const runT = (t - 0.1) / 0.9;
      return fromX + (toX - fromX) * easeOutCubic(runT);
    }
    case 'pass_complete': {
      // QB holds, then ball travels to catch point
      const isPA = play.call === 'play_action_short' || play.call === 'play_action_deep';
      const holdEnd = isPA ? 0.4 : 0.3;
      const throwEnd = 0.8;
      if (t < holdEnd) {
        // QB dropback — slight backward movement
        const dropT = t / holdEnd;
        return fromX + offDir * YARDS.SHORT_DROP * easeOutCubic(dropT);
      }
      if (t < throwEnd) {
        const throwT = (t - holdEnd) / (throwEnd - holdEnd);
        const qbX = fromX + offDir * YARDS.SHORT_DROP;
        return qbX + (toX - qbX) * easeInOutQuad(throwT);
      }
      // After catch — already at toX
      return toX;
    }
    case 'pass_incomplete': {
      const holdEnd = 0.35;
      if (t < holdEnd) {
        const dropT = t / holdEnd;
        return fromX + offDir * YARDS.SHORT_DROP * easeOutCubic(dropT);
      }
      // Ball travels toward target area but stops short
      const throwT = (t - holdEnd) / (1 - holdEnd);
      const qbX = fromX + offDir * YARDS.SHORT_DROP;
      const targetX = fromX - offDir * yardsToPercent(12);
      return qbX + (targetX - qbX) * easeInOutQuad(throwT);
    }
    case 'sack': {
      // QB drops back, then gets driven back
      if (t < 0.3) {
        return fromX + offDir * YARDS.SHORT_DROP * easeOutCubic(t / 0.3);
      }
      const sackT = (t - 0.3) / 0.7;
      const qbX = fromX + offDir * YARDS.SHORT_DROP;
      return qbX + (toX - qbX) * easeOutCubic(sackT);
    }
    case 'kickoff': {
      // possession = receiving team (already flipped), so kicker is the opposite
      const kicker = possession === 'home' ? 'away' : 'home';
      const landingX = getKickoffLandingX(play, fromX, kicker);
      if (t < KICKOFF_PHASE_END) {
        const kickT = t / KICKOFF_PHASE_END;
        return fromX + (landingX - fromX) * easeInOutQuad(kickT);
      }
      const returnT = (t - KICKOFF_PHASE_END) / (1 - KICKOFF_PHASE_END);
      return landingX + (toX - landingX) * easeOutCubic(returnT);
    }
    case 'punt': {
      // Punt arc then possible return
      const isFairCatch = (play.description || '').toLowerCase().includes('fair catch');
      const isTouchback = play.yardsGained === 0;
      if (isFairCatch || isTouchback) {
        return fromX + (toX - fromX) * easeInOutQuad(t);
      }
      // Flight to landing, then return
      if (t < 0.6) {
        return fromX + (toX - fromX) * easeInOutQuad(t / 0.6);
      }
      return toX;
    }
    case 'field_goal': case 'extra_point': {
      // For missed FGs, possession has flipped — kicker is opposite of current possession
      const kicker = (play.type === 'field_goal' && !play.scoring)
        ? (possession === 'home' ? 'away' : 'home')
        : possession;
      const goalPostX = kicker === 'away' ? 91.66 : 8.33;
      return fromX + (goalPostX - fromX) * easeInOutQuad(t);
    }
    case 'touchback':
      return toX;
    default:
      return fromX + (toX - fromX) * easeOutCubic(t);
  }
}

// ── QB Position (where team logo stays) — split plays only ───

export function calculateQBPosition(
  play: PlayResult, fromX: number, toX: number, t: number,
  possession: 'home' | 'away',
): number {
  const offDir = possession === 'away' ? -1 : 1;

  switch (play.type) {
    case 'run': case 'two_point': {
      // Slight backward motion during handoff, then return to LOS and stay
      if (t < 0.1) {
        const dropT = t / 0.1;
        return fromX + offDir * YARDS.SHORT_DROP * 0.3 * easeOutCubic(dropT);
      }
      if (t < 0.2) {
        const returnT = (t - 0.1) / 0.1;
        return fromX + offDir * YARDS.SHORT_DROP * 0.3 * (1 - easeOutCubic(returnT));
      }
      return fromX;
    }
    case 'scramble': {
      // QB carries the ball — same as current run behavior
      if (t < 0.1) return fromX;
      const runT = (t - 0.1) / 0.9;
      return fromX + (toX - fromX) * easeOutCubic(runT);
    }
    case 'pass_complete': {
      // Dropback, then stay in pocket
      const isPA = play.call === 'play_action_short' || play.call === 'play_action_deep';
      const holdEnd = isPA ? 0.4 : 0.3;
      if (t < holdEnd) {
        const dropT = t / holdEnd;
        return fromX + offDir * YARDS.SHORT_DROP * easeOutCubic(dropT);
      }
      return fromX + offDir * YARDS.SHORT_DROP;
    }
    case 'pass_incomplete': {
      const holdEnd = 0.35;
      if (t < holdEnd) {
        const dropT = t / holdEnd;
        return fromX + offDir * YARDS.SHORT_DROP * easeOutCubic(dropT);
      }
      return fromX + offDir * YARDS.SHORT_DROP;
    }
    case 'sack': {
      // Dropback then driven back to toX
      if (t < 0.3) {
        return fromX + offDir * YARDS.SHORT_DROP * easeOutCubic(t / 0.3);
      }
      const sackT = (t - 0.3) / 0.7;
      const qbX = fromX + offDir * YARDS.SHORT_DROP;
      return qbX + (toX - qbX) * easeOutCubic(sackT);
    }
    default:
      return calculateSimpleBallX(play, fromX, toX, t, possession);
  }
}

// ── Ball Position (where the golden ball dot goes) — split plays ──

export function calculateBallPosition(
  play: PlayResult, fromX: number, toX: number, t: number,
  possession: 'home' | 'away',
): number {
  const offDir = possession === 'away' ? -1 : 1;

  switch (play.type) {
    case 'run': case 'two_point': {
      // Stays at LOS during handoff, then moves to toX
      if (t < 0.1) return fromX;
      const runT = (t - 0.1) / 0.9;
      return fromX + (toX - fromX) * easeOutCubic(runT);
    }
    case 'scramble': {
      // Tracks QB (QB carries ball)
      if (t < 0.1) return fromX;
      const runT = (t - 0.1) / 0.9;
      return fromX + (toX - fromX) * easeOutCubic(runT);
    }
    case 'pass_complete': {
      // Tracks QB during dropback, then flies from QB to catch point
      const isPA = play.call === 'play_action_short' || play.call === 'play_action_deep';
      const holdEnd = isPA ? 0.4 : 0.3;
      const throwEnd = 0.8;
      if (t < holdEnd) {
        const dropT = t / holdEnd;
        return fromX + offDir * YARDS.SHORT_DROP * easeOutCubic(dropT);
      }
      if (t < throwEnd) {
        const throwT = (t - holdEnd) / (throwEnd - holdEnd);
        const qbX = fromX + offDir * YARDS.SHORT_DROP;
        return qbX + (toX - qbX) * easeInOutQuad(throwT);
      }
      return toX;
    }
    case 'pass_incomplete': {
      const holdEnd = 0.35;
      if (t < holdEnd) {
        const dropT = t / holdEnd;
        return fromX + offDir * YARDS.SHORT_DROP * easeOutCubic(dropT);
      }
      const throwT = (t - holdEnd) / (1 - holdEnd);
      const qbX = fromX + offDir * YARDS.SHORT_DROP;
      const targetX = fromX - offDir * yardsToPercent(12);
      return qbX + (targetX - qbX) * easeInOutQuad(throwT);
    }
    case 'sack': {
      // Ball tracks QB exactly
      if (t < 0.3) {
        return fromX + offDir * YARDS.SHORT_DROP * easeOutCubic(t / 0.3);
      }
      const sackT = (t - 0.3) / 0.7;
      const qbX = fromX + offDir * YARDS.SHORT_DROP;
      return qbX + (toX - qbX) * easeOutCubic(sackT);
    }
    default:
      return calculateSimpleBallX(play, fromX, toX, t, possession);
  }
}

/** Returns true for play types where QB and ball should be separate elements */
export function isSplitPlay(type: string | undefined): boolean {
  return type === 'run' || type === 'pass_complete' || type === 'pass_incomplete'
    || type === 'sack' || type === 'scramble' || type === 'two_point';
}

/** Returns true when the golden ball dot should be visible (ball separates from QB) */
export function showTravelingBall(type: string | undefined, animProgress: number, play: PlayResult | null): boolean {
  if (!type || !play) return false;
  if (type === 'run' || type === 'two_point') return animProgress > 0.1;
  if (type === 'pass_complete') {
    const isPA = play.call === 'play_action_short' || play.call === 'play_action_deep';
    return animProgress > (isPA ? 0.4 : 0.3);
  }
  if (type === 'pass_incomplete') return animProgress > 0.35;
  // scramble / sack: ball stays with QB, no separate dot
  return false;
}
