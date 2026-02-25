// ============================================================================
// Offensive Coordinator — Integrated Play Design System
// ============================================================================
// Mirrors the defensive-coordinator.ts 7-layer modifier stack. Selects
// personnel, formation, protection scheme, pre-snap motion, route concept,
// and run scheme based on game situation and defensive look. Produces
// multiplicative modifiers layered onto play resolution.
//
// Inspired by Bruce Arians' 2016 Cardinals Offense playbook.
// ============================================================================

import type {
  DefensiveCall,
  Formation,
  FormationVariant,
  GameState,
  MotionType,
  OffensiveCall,
  PersonnelGrouping,
  PlayCall,
  ProtectionScheme,
  RouteConcept,
  RunScheme,
  SeededRNG,
  WeightedOption,
} from './types';

import { selectFormationVariant, getFormationModifiersWithVariant } from './formations';

// ============================================================================
// PROTECTION SCHEME MODIFIERS
// ============================================================================

interface ProtectionModifiers {
  sackRateMultiplier: number;
  playActionBonus: number;
  quickPassBonus: number;    // Applied to screen/quick pass completion
  scrambleModifier: number;  // Multiplied onto scramble rate
}

const PROTECTION_MODIFIERS: Record<ProtectionScheme, ProtectionModifiers> = {
  middle_62: {
    sackRateMultiplier: 0.75,  // Max protection — fewest sacks
    playActionBonus: 1.0,      // No play-action from max protect
    quickPassBonus: 0.95,      // Fewer receivers out = less quick-game
    scrambleModifier: 0.7,     // QB stays in pocket
  },
  blunt_80: {
    sackRateMultiplier: 0.85,  // Sprint-out protection — decent
    playActionBonus: 1.35,     // Waggle/boot = great play-action
    quickPassBonus: 1.05,
    scrambleModifier: 1.6,     // Designed QB movement
  },
  base_82: {
    sackRateMultiplier: 0.92,  // Standard 5-man
    playActionBonus: 1.10,
    quickPassBonus: 1.0,
    scrambleModifier: 1.0,
  },
  sort_83: {
    sackRateMultiplier: 0.88,  // Sort blocking — good vs odd fronts
    playActionBonus: 1.10,
    quickPassBonus: 1.0,
    scrambleModifier: 0.9,
  },
};

// ============================================================================
// PRE-SNAP MOTION MODIFIERS
// ============================================================================

interface MotionModifiers {
  completionBonus: number;    // Additive
  runYardBonus: number;       // Additive
  vsManMultiplier: number;    // Multiplied onto bonus when vs man coverage
  vsZoneMultiplier: number;   // Multiplied onto bonus when vs zone coverage
}

const MOTION_MODIFIERS: Record<MotionType, MotionModifiers> = {
  fly: {
    completionBonus: 0.03,
    runYardBonus: 0.5,
    vsManMultiplier: 2.0,     // Motion destroys man assignments
    vsZoneMultiplier: 0.5,    // Zone doesn't care about motion
  },
  peel: {
    completionBonus: 0.02,
    runYardBonus: 0.0,
    vsManMultiplier: 1.5,
    vsZoneMultiplier: 0.7,
  },
  short: {
    completionBonus: 0.01,
    runYardBonus: 0.3,
    vsManMultiplier: 1.3,
    vsZoneMultiplier: 0.8,
  },
  cut: {
    completionBonus: 0.0,
    runYardBonus: 0.8,
    vsManMultiplier: 1.0,
    vsZoneMultiplier: 1.0,
  },
  shift: {
    completionBonus: 0.02,
    runYardBonus: 0.3,
    vsManMultiplier: 1.2,
    vsZoneMultiplier: 1.5,    // Shifts force zone re-alignment
  },
};

// ============================================================================
// RUN SCHEME MODIFIERS
// ============================================================================

interface RunSchemeModifiers {
  yardMultiplier: number;      // Multiplicative
  bigPlayModifier: number;     // Multiplied onto BIG_PLAY_RATE
  shortYardageBonus: number;   // Additive yards in short yardage
  vsBlitzBonus: number;        // Additive yards when defense blitzes
}

const RUN_SCHEME_MODIFIERS: Record<RunScheme, RunSchemeModifiers> = {
  inside_zone: {
    yardMultiplier: 1.0,
    bigPlayModifier: 1.0,
    shortYardageBonus: 0.3,
    vsBlitzBonus: 0.5,
  },
  outside_zone: {
    yardMultiplier: 1.05,
    bigPlayModifier: 1.2,      // Stretch = more boom/bust
    shortYardageBonus: -0.2,   // Not great in short yardage
    vsBlitzBonus: 0.8,
  },
  power: {
    yardMultiplier: 0.95,
    bigPlayModifier: 0.8,      // Lower ceiling, higher floor
    shortYardageBonus: 1.0,    // Excellent short yardage
    vsBlitzBonus: 0.3,
  },
  counter: {
    yardMultiplier: 1.10,
    bigPlayModifier: 1.3,      // High boom/bust
    shortYardageBonus: 0.0,
    vsBlitzBonus: 1.2,         // Counter exploits over-pursuit
  },
  draw: {
    yardMultiplier: 1.08,
    bigPlayModifier: 1.1,
    shortYardageBonus: -0.5,   // Bad in short yardage
    vsBlitzBonus: 2.0,         // Draw is the anti-blitz play
  },
  sweep: {
    yardMultiplier: 1.12,
    bigPlayModifier: 1.4,      // Highest boom/bust
    shortYardageBonus: -0.3,
    vsBlitzBonus: -0.5,        // Sweep is bad vs blitz
  },
};

// ============================================================================
// PERSONNEL-FORMATION FIT BONUS
// ============================================================================
// Natural pairings get a bonus; awkward pairings get a penalty.

const PERSONNEL_FORMATION_FIT: Partial<Record<PersonnelGrouping, Partial<Record<Formation, number>>>> = {
  '00': { empty: 0.04, spread: 0.03, shotgun: 0.02 },
  '10': { spread: 0.03, shotgun: 0.02, empty: 0.02 },
  '11': { shotgun: 0.02, singleback: 0.02, pistol: 0.01 },
  '12': { singleback: 0.03, under_center: 0.02, pistol: 0.01 },
  '13': { under_center: 0.03, i_formation: 0.02, goal_line: 0.02 },
  '21': { i_formation: 0.04, under_center: 0.03, pistol: 0.02 },
  '22': { i_formation: 0.05, goal_line: 0.04, under_center: 0.03 },
};

// Mismatched combos get a penalty
const PERSONNEL_FORMATION_MISFIT: Partial<Record<PersonnelGrouping, Partial<Record<Formation, number>>>> = {
  '22': { spread: -0.04, empty: -0.05, shotgun: -0.03 },
  '21': { spread: -0.03, empty: -0.04 },
  '13': { spread: -0.04, empty: -0.05, shotgun: -0.03 },
  '00': { under_center: -0.02, i_formation: -0.04, goal_line: -0.05 },
  '10': { i_formation: -0.03, goal_line: -0.04 },
};

// ============================================================================
// RUN SCHEME vs DEFENSIVE FRONT INTERACTION
// ============================================================================

const RUN_SCHEME_VS_FRONT: Partial<Record<RunScheme, Record<string, number>>> = {
  inside_zone: {
    base_4_3: 1.05,
    base_3_4: 0.95,
    nickel: 1.10,
    dime: 1.20,
  },
  outside_zone: {
    base_3_4: 1.08,
    base_4_3: 1.0,
    nickel: 1.05,
    dime: 1.15,
  },
  power: {
    nickel: 1.15,
    dime: 1.25,
    base_4_3: 1.0,
    base_3_4: 0.95,
    goal_line: 0.90,
  },
  counter: {
    base_4_3: 1.05,
    base_3_4: 1.10,   // Counter exploits 3-4 over-pursuit
    nickel: 1.08,
  },
  draw: {
    nickel: 1.05,
    dime: 1.10,
    prevent: 1.20,
  },
  sweep: {
    dime: 1.20,
    nickel: 1.10,
    goal_line: 0.75,  // Sweep is terrible vs goal line
    base_4_3: 0.95,
  },
};

// ============================================================================
// SELECTION FUNCTIONS
// ============================================================================

function isManCoverage(coverage?: string): boolean {
  return coverage === 'cover_0' || coverage === 'cover_1' || coverage === 'man_press';
}

function isZoneCoverage(coverage?: string): boolean {
  return coverage === 'cover_2' || coverage === 'cover_3' || coverage === 'cover_4' || coverage === 'cover_6';
}

/**
 * Select protection scheme based on situation and defensive look.
 */
function selectProtection(
  state: GameState,
  formation: Formation,
  defensiveCall: DefensiveCall | undefined,
  rng: SeededRNG,
): ProtectionScheme | null {
  // No protection scheme for run plays (will be checked at call site)
  // Quick/screen passes use simplified protection

  // vs heavy blitz: prefer max protection
  if (defensiveCall && (defensiveCall.blitz === 'all_out' || defensiveCall.blitz === 'db_blitz')) {
    return rng.weightedChoice<ProtectionScheme>([
      { value: 'middle_62', weight: 55 },
      { value: 'base_82', weight: 25 },
      { value: 'sort_83', weight: 15 },
      { value: 'blunt_80', weight: 5 },
    ]);
  }

  // vs 3-4 front: prefer sort protection
  if (defensiveCall && (defensiveCall.personnel === 'base_3_4')) {
    return rng.weightedChoice<ProtectionScheme>([
      { value: 'sort_83', weight: 40 },
      { value: 'base_82', weight: 30 },
      { value: 'middle_62', weight: 20 },
      { value: 'blunt_80', weight: 10 },
    ]);
  }

  // Shotgun/pistol: favor base protection
  if (formation === 'shotgun' || formation === 'pistol' || formation === 'spread') {
    return rng.weightedChoice<ProtectionScheme>([
      { value: 'base_82', weight: 45 },
      { value: 'middle_62', weight: 25 },
      { value: 'sort_83', weight: 15 },
      { value: 'blunt_80', weight: 15 },
    ]);
  }

  // Under center / I-formation: favor waggle/boot
  if (formation === 'under_center' || formation === 'i_formation') {
    return rng.weightedChoice<ProtectionScheme>([
      { value: 'base_82', weight: 30 },
      { value: 'blunt_80', weight: 30 },
      { value: 'middle_62', weight: 25 },
      { value: 'sort_83', weight: 15 },
    ]);
  }

  // Default
  return rng.weightedChoice<ProtectionScheme>([
    { value: 'base_82', weight: 40 },
    { value: 'middle_62', weight: 25 },
    { value: 'sort_83', weight: 20 },
    { value: 'blunt_80', weight: 15 },
  ]);
}

/**
 * Select pre-snap motion based on formation, personnel, and defensive look.
 */
function selectMotion(
  state: GameState,
  formation: Formation,
  personnel: PersonnelGrouping,
  defensiveCall: DefensiveCall | undefined,
  rng: SeededRNG,
): MotionType | null {
  // No motion ~55% of the time
  if (rng.probability(0.55)) return null;

  // Goal line / heavy sets: cut motion for blocking
  if (formation === 'goal_line' || formation === 'i_formation') {
    return rng.weightedChoice<MotionType>([
      { value: 'cut', weight: 35 },
      { value: 'short', weight: 30 },
      { value: 'shift', weight: 20 },
      { value: 'fly', weight: 10 },
      { value: 'peel', weight: 5 },
    ]);
  }

  // Spread/empty: fly motion to create mismatches
  if (formation === 'spread' || formation === 'empty') {
    return rng.weightedChoice<MotionType>([
      { value: 'fly', weight: 40 },
      { value: 'short', weight: 25 },
      { value: 'shift', weight: 20 },
      { value: 'peel', weight: 15 },
      { value: 'cut', weight: 0 },
    ]);
  }

  // vs man coverage: fly motion to stress assignments
  if (defensiveCall && isManCoverage(defensiveCall.coverage)) {
    return rng.weightedChoice<MotionType>([
      { value: 'fly', weight: 35 },
      { value: 'peel', weight: 25 },
      { value: 'short', weight: 20 },
      { value: 'shift', weight: 15 },
      { value: 'cut', weight: 5 },
    ]);
  }

  // Default distribution
  return rng.weightedChoice<MotionType>([
    { value: 'fly', weight: 25 },
    { value: 'short', weight: 25 },
    { value: 'peel', weight: 20 },
    { value: 'shift', weight: 15 },
    { value: 'cut', weight: 15 },
  ]);
}

/**
 * Select run scheme based on formation, personnel, and defensive front.
 */
function selectRunScheme(
  state: GameState,
  formation: Formation,
  personnel: PersonnelGrouping,
  defensiveCall: DefensiveCall | undefined,
  rng: SeededRNG,
): RunScheme {
  // Short yardage: power and inside zone
  if (state.yardsToGo <= 2 && state.down >= 3) {
    return rng.weightedChoice<RunScheme>([
      { value: 'power', weight: 40 },
      { value: 'inside_zone', weight: 30 },
      { value: 'counter', weight: 15 },
      { value: 'draw', weight: 5 },
      { value: 'outside_zone', weight: 5 },
      { value: 'sweep', weight: 5 },
    ]);
  }

  // Heavy personnel (21, 22, 13): power and inside zone
  if (personnel === '21' || personnel === '22' || personnel === '13') {
    return rng.weightedChoice<RunScheme>([
      { value: 'power', weight: 35 },
      { value: 'inside_zone', weight: 25 },
      { value: 'counter', weight: 20 },
      { value: 'outside_zone', weight: 10 },
      { value: 'sweep', weight: 5 },
      { value: 'draw', weight: 5 },
    ]);
  }

  // Shotgun/spread: zone and draw
  if (formation === 'shotgun' || formation === 'spread' || formation === 'pistol') {
    return rng.weightedChoice<RunScheme>([
      { value: 'inside_zone', weight: 25 },
      { value: 'outside_zone', weight: 25 },
      { value: 'draw', weight: 20 },
      { value: 'counter', weight: 15 },
      { value: 'sweep', weight: 10 },
      { value: 'power', weight: 5 },
    ]);
  }

  // Under center: power and counter
  if (formation === 'under_center' || formation === 'i_formation') {
    return rng.weightedChoice<RunScheme>([
      { value: 'power', weight: 30 },
      { value: 'inside_zone', weight: 25 },
      { value: 'counter', weight: 20 },
      { value: 'outside_zone', weight: 15 },
      { value: 'sweep', weight: 5 },
      { value: 'draw', weight: 5 },
    ]);
  }

  // Default balanced
  return rng.weightedChoice<RunScheme>([
    { value: 'inside_zone', weight: 25 },
    { value: 'outside_zone', weight: 20 },
    { value: 'power', weight: 20 },
    { value: 'counter', weight: 15 },
    { value: 'draw', weight: 10 },
    { value: 'sweep', weight: 10 },
  ]);
}

// ============================================================================
// MODIFIER COMPUTATION
// ============================================================================

export interface OffensiveModifiers {
  sackRateMultiplier: number;
  completionModifier: number;     // Additive to completion rate
  runYardMultiplier: number;      // Multiplicative on run yards
  runYardBonus: number;           // Additive run yards
  playActionBonus: number;        // Multiplicative on play-action
  scrambleModifier: number;       // Multiplicative on scramble rate
  bigPlayModifier: number;        // Multiplicative on BIG_PLAY_RATE
  personnelFitBonus: number;      // Additive completion/run bonus from personnel-formation fit
}

/**
 * Compute multiplicative modifiers from the offensive call stack.
 * All layers multiply together, similar to defensive modifier composition.
 */
export function getOffensiveModifiers(
  call: OffensiveCall,
  defensiveCall?: DefensiveCall,
): OffensiveModifiers {
  const mods: OffensiveModifiers = {
    sackRateMultiplier: 1.0,
    completionModifier: 0.0,
    runYardMultiplier: 1.0,
    runYardBonus: 0.0,
    playActionBonus: 1.0,
    scrambleModifier: 1.0,
    bigPlayModifier: 1.0,
    personnelFitBonus: 0.0,
  };

  // Layer 1: Protection scheme
  if (call.protectionScheme) {
    const pMods = PROTECTION_MODIFIERS[call.protectionScheme];
    mods.sackRateMultiplier *= pMods.sackRateMultiplier;
    mods.playActionBonus *= pMods.playActionBonus;
    mods.scrambleModifier *= pMods.scrambleModifier;
  }

  // Layer 2: Pre-snap motion
  if (call.motionType) {
    const mMods = MOTION_MODIFIERS[call.motionType];
    let coverageMultiplier = 1.0;
    if (defensiveCall) {
      if (isManCoverage(defensiveCall.coverage)) {
        coverageMultiplier = mMods.vsManMultiplier;
      } else if (isZoneCoverage(defensiveCall.coverage)) {
        coverageMultiplier = mMods.vsZoneMultiplier;
      }
    }
    mods.completionModifier += mMods.completionBonus * coverageMultiplier;
    mods.runYardBonus += mMods.runYardBonus;
  }

  // Layer 3: Run scheme (for run plays)
  if (call.runScheme) {
    const rMods = RUN_SCHEME_MODIFIERS[call.runScheme];
    mods.runYardMultiplier *= rMods.yardMultiplier;
    mods.bigPlayModifier *= rMods.bigPlayModifier;

    // Short yardage bonus
    if (call.runScheme === 'power' || call.runScheme === 'inside_zone') {
      mods.runYardBonus += rMods.shortYardageBonus;
    }

    // vs blitz bonus
    if (defensiveCall && defensiveCall.blitz !== 'none') {
      mods.runYardBonus += rMods.vsBlitzBonus;
    }

    // vs defensive front interaction
    if (defensiveCall) {
      const frontInteraction = RUN_SCHEME_VS_FRONT[call.runScheme];
      if (frontInteraction) {
        const mult = frontInteraction[defensiveCall.personnel] ?? 1.0;
        mods.runYardMultiplier *= mult;
      }
    }
  }

  // Layer 4: Personnel-formation fit
  const fitBonus = PERSONNEL_FORMATION_FIT[call.personnel]?.[call.formation] ?? 0;
  const fitPenalty = PERSONNEL_FORMATION_MISFIT[call.personnel]?.[call.formation] ?? 0;
  mods.personnelFitBonus = fitBonus + fitPenalty;
  mods.completionModifier += mods.personnelFitBonus;
  mods.runYardBonus += mods.personnelFitBonus * 10; // Scale fit bonus for yards

  // Layer 5: Formation variant bonus
  // Variant modifiers are small additive/multiplicative overlays from the Arians
  // playbook (trips, trey, bunch, etc.) on top of the base formation.
  if (call.formationVariant) {
    const variantMods = getFormationModifiersWithVariant(call.formation, call.formationVariant);
    const baseMods = getFormationModifiersWithVariant(call.formation, null);
    // Apply only the delta from base → variant
    const paBonus = variantMods.playActionBonus / baseMods.playActionBonus;
    mods.playActionBonus *= paBonus;
    mods.runYardBonus += variantMods.runYardBonus - baseMods.runYardBonus;
  }

  return mods;
}

// ============================================================================
// MAIN SELECTION FUNCTION
// ============================================================================

/**
 * Select the complete offensive call for a play.
 *
 * Called from the engine after the play caller determines the play call type.
 * Selects all offensive design layers and returns the complete call.
 */
export function selectOffensiveCall(
  state: GameState,
  playCall: PlayCall,
  personnel: PersonnelGrouping,
  formation: Formation,
  routeConcept: RouteConcept | null,
  defensiveCall: DefensiveCall | undefined,
  rng: SeededRNG,
): OffensiveCall {
  const isRunPlay = playCall.startsWith('run_');
  const isPassPlay = !isRunPlay && playCall !== 'punt' && playCall !== 'field_goal' &&
    playCall !== 'extra_point' && playCall !== 'kickoff_normal' && playCall !== 'onside_kick' &&
    playCall !== 'kneel' && playCall !== 'spike';

  // Select formation variant (named Arians variant of base formation)
  const formationVariant = selectFormationVariant(formation, rng);

  // Select protection (pass plays only)
  const protectionScheme = isPassPlay
    ? selectProtection(state, formation, defensiveCall, rng)
    : null;

  // Select motion
  const motionType = selectMotion(state, formation, personnel, defensiveCall, rng);

  // Select run scheme (run plays only)
  const runScheme = isRunPlay
    ? selectRunScheme(state, formation, personnel, defensiveCall, rng)
    : null;

  return {
    personnel,
    formation,
    formationVariant,
    protectionScheme,
    motionType,
    routeConcept,
    runScheme,
    playCall,
  };
}
