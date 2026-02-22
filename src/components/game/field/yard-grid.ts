/**
 * Yard-Grid Constants — ground ALL field movement in real NFL yard distances.
 *
 * Field container layout:
 *   0%     → 8.33%   Away end zone
 *   8.33%  → 91.66%  100-yard playing field
 *   91.66% → 100%    Home end zone
 *
 * 1 yard = 83.34% / 100 = 0.8334% of container width
 */

/** Percentage of field container width equal to 1 NFL yard */
export const YARD_PCT = 0.8334;

/** Convert a yard distance to field container percentage */
export function yardsToPercent(yards: number): number {
  return yards * YARD_PCT;
}

/** Pre-computed common distances in field container % */
export const YARDS = {
  // QB drops
  SHORT_DROP: 3 * YARD_PCT,     // ~2.5%  — 3-step drop
  MEDIUM_DROP: 5 * YARD_PCT,    // ~4.2%  — 5-step drop
  PA_DROP: 5 * YARD_PCT,        // ~4.2%  — play-action drop

  // OL movement
  OL_RUN_PUSH: 2 * YARD_PCT,    // ~1.7%  — drive block distance
  OL_PASS_SET: 1.5 * YARD_PCT,  // ~1.25% — pass protection kick

  // Lateral motion caps
  MAX_JUKE: 3 * YARD_PCT,       // ~2.5%  — single juke cut
  MAX_WEAVE: 2 * YARD_PCT,      // ~1.7%  — running weave amplitude
  MAX_SCRAMBLE_WEAVE: 4 * YARD_PCT, // ~3.3% — scramble lateral range

  // Run laterals
  SWEEP_LATERAL: 4 * YARD_PCT,  // ~3.3%  — outside sweep width
  COUNTER_FAKE: 3 * YARD_PCT,   // ~2.5%  — counter misdirection
  OPTION_MESH: 2 * YARD_PCT,    // ~1.7%  — option mesh point

  // Kicker
  KICKER_APPROACH: 3 * YARD_PCT, // ~2.5% — kicker run-up

  // Short route minimum (for scaling)
  SHORT_ROUTE: 6 * YARD_PCT,    // ~5.0%  — minimum route depth
} as const;
