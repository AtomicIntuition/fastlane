/**
 * Animation system types — simplified for stable broadcast-quality output.
 */

import type { PlayResult } from '@/lib/simulation/types';

// ── Phase System (matches SSE event timing) ───────────────────

export type Phase = 'idle' | 'pre_snap' | 'snap' | 'development' | 'result' | 'post_play';

// ── Entity State ──────────────────────────────────────────────

export interface EntityState {
  x: number;   // field percentage (0-100)
  y: number;   // field percentage (0-100, 50 = center)
  role: string;
}

// ── Ball State ────────────────────────────────────────────────

export type BallOwner =
  | { type: 'held'; side: 'offense' | 'defense'; index: number }
  | { type: 'flight'; progress: number }
  | { type: 'ground' }
  | { type: 'kicked'; progress: number; arcHeight: number };

export interface BallState {
  x: number;
  y: number;
  height: number;  // world units above ground
  spin: number;    // rotation speed (0 = none)
  owner: BallOwner;
}

// ── Choreography Frame ────────────────────────────────────────

export interface ChoreographyFrame {
  offense: EntityState[];
  defense: EntityState[];
  ball: BallState;
}

// ── Play Context ──────────────────────────────────────────────

export interface PlayContext {
  play: PlayResult;
  losX: number;   // LOS field percentage (absolute)
  toX: number;    // ball destination field percentage (absolute)
  offDir: number; // 1 = going right, -1 = going left
  possession: 'home' | 'away';
}
