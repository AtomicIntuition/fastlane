import { describe, it, expect } from 'vitest';
import {
  initializeOvertime,
  checkOvertimeEnd,
  updateOvertimeState,
  createOvertimeGameState,
  getOvertimePeriodLength,
  getOvertimeTimeouts,
} from '@/lib/simulation/overtime';
import type { OvertimeState } from '@/lib/simulation/overtime';
import { createTestGameState, createTestRNG } from '../../helpers/test-utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createBaseOTState(overrides: Partial<OvertimeState> = {}): OvertimeState {
  return {
    coinTossWinner: 'home',
    coinTossChoice: 'receive',
    homePossessed: false,
    awayPossessed: false,
    firstPossessionResult: null,
    isComplete: false,
    isSuddenDeath: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Overtime Engine', () => {
  // -----------------------------------------------------------------------
  // 1. Both teams get at least one possession
  // -----------------------------------------------------------------------
  describe('guaranteed possessions', () => {
    it('does not end the game if only one team has possessed', () => {
      // Home scored a TD on first possession, but away has not possessed yet
      const otState = createBaseOTState({
        homePossessed: true,
        awayPossessed: false,
        firstPossessionResult: 'touchdown',
      });
      const gameState = createTestGameState({
        quarter: 'OT',
        clock: 400,
        homeScore: 27,
        awayScore: 20,
      });

      const result = checkOvertimeEnd(otState, gameState, 'regular');
      expect(result.isOver).toBe(false);
      expect(result.winner).toBeNull();
    });

    it('does not end the game when first team scores a FG and second has not possessed', () => {
      const otState = createBaseOTState({
        homePossessed: true,
        awayPossessed: false,
        firstPossessionResult: 'field_goal',
      });
      const gameState = createTestGameState({
        quarter: 'OT',
        clock: 500,
        homeScore: 23,
        awayScore: 20,
      });

      const result = checkOvertimeEnd(otState, gameState, 'regular');
      expect(result.isOver).toBe(false);
    });

    it('ends the game once both teams possess and scores differ', () => {
      const otState = createBaseOTState({
        homePossessed: true,
        awayPossessed: true,
        firstPossessionResult: 'touchdown',
      });
      const gameState = createTestGameState({
        quarter: 'OT',
        clock: 300,
        homeScore: 27,
        awayScore: 20,
      });

      const result = checkOvertimeEnd(otState, gameState, 'regular');
      expect(result.isOver).toBe(true);
      expect(result.winner).toBe('home');
    });

    it('updates possession tracking correctly', () => {
      const otState = createBaseOTState();

      // Home possession ends with a FG
      const afterHome = updateOvertimeState(otState, 'home', 'field_goal');
      expect(afterHome.homePossessed).toBe(true);
      expect(afterHome.awayPossessed).toBe(false);
      expect(afterHome.firstPossessionResult).toBe('field_goal');

      // Away possession ends with a touchdown
      const afterAway = updateOvertimeState(afterHome, 'away', 'touchdown');
      expect(afterAway.homePossessed).toBe(true);
      expect(afterAway.awayPossessed).toBe(true);
      expect(afterAway.isSuddenDeath).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // 2. Sudden death after both teams possess
  // -----------------------------------------------------------------------
  describe('sudden death', () => {
    it('enters sudden death when both teams have possessed and score is tied', () => {
      const otState = createBaseOTState({
        homePossessed: true,
        awayPossessed: false,
      });

      // Away finishes their possession (tied scores)
      const updated = updateOvertimeState(otState, 'away', 'field_goal');
      expect(updated.isSuddenDeath).toBe(true);
    });

    it('ends the game on any score in sudden death', () => {
      const otState = createBaseOTState({
        homePossessed: true,
        awayPossessed: true,
        isSuddenDeath: true,
      });
      const gameState = createTestGameState({
        quarter: 'OT',
        clock: 200,
        homeScore: 30,
        awayScore: 27,
      });

      const result = checkOvertimeEnd(otState, gameState, 'regular');
      expect(result.isOver).toBe(true);
      expect(result.winner).toBe('home');
    });

    it('game continues in sudden death while scores remain tied', () => {
      const otState = createBaseOTState({
        homePossessed: true,
        awayPossessed: true,
        isSuddenDeath: true,
      });
      const gameState = createTestGameState({
        quarter: 'OT',
        clock: 200,
        homeScore: 27,
        awayScore: 27,
      });

      const result = checkOvertimeEnd(otState, gameState, 'regular');
      expect(result.isOver).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // 3. Time expiration
  // -----------------------------------------------------------------------
  describe('time expiration', () => {
    it('regular season ends in a tie when clock expires with tied score', () => {
      const otState = createBaseOTState({
        homePossessed: true,
        awayPossessed: true,
        isSuddenDeath: true,
      });
      const gameState = createTestGameState({
        quarter: 'OT',
        clock: 0,
        homeScore: 20,
        awayScore: 20,
      });

      const result = checkOvertimeEnd(otState, gameState, 'regular');
      expect(result.isOver).toBe(true);
      expect(result.winner).toBe('tie');
    });

    it('playoff game does not end in a tie when clock expires tied', () => {
      const otState = createBaseOTState({
        homePossessed: true,
        awayPossessed: true,
        isSuddenDeath: true,
      });
      const gameState = createTestGameState({
        quarter: 'OT',
        clock: 0,
        homeScore: 20,
        awayScore: 20,
      });

      const result = checkOvertimeEnd(otState, gameState, 'wild_card');
      expect(result.isOver).toBe(false);
      expect(result.winner).toBeNull();
    });

    it('determines winner at time expiration when scores differ', () => {
      const otState = createBaseOTState({
        homePossessed: true,
        awayPossessed: true,
      });
      const gameState = createTestGameState({
        quarter: 'OT',
        clock: 0,
        homeScore: 20,
        awayScore: 23,
      });

      const result = checkOvertimeEnd(otState, gameState, 'regular');
      expect(result.isOver).toBe(true);
      expect(result.winner).toBe('away');
    });
  });

  // -----------------------------------------------------------------------
  // 4. Initialization and game state creation
  // -----------------------------------------------------------------------
  describe('initialization', () => {
    it('initializes OT state with coin toss winner', () => {
      const rng = createTestRNG();
      const otState = initializeOvertime('home', rng);

      expect(otState.coinTossWinner).toBe('home');
      expect(['receive', 'defer']).toContain(otState.coinTossChoice);
      expect(otState.homePossessed).toBe(false);
      expect(otState.awayPossessed).toBe(false);
      expect(otState.isComplete).toBe(false);
      expect(otState.isSuddenDeath).toBe(false);
    });

    it('creates regular season OT with 10-minute clock and 2 timeouts', () => {
      const rng = createTestRNG();
      const otState = initializeOvertime('home', rng);
      const baseState = createTestGameState({
        quarter: 4,
        clock: 0,
        homeScore: 17,
        awayScore: 17,
      });

      const otGameState = createOvertimeGameState(baseState, otState, 'regular');

      expect(otGameState.quarter).toBe('OT');
      expect(otGameState.clock).toBe(600); // 10-minute OT period (Rule 16-1-3)
      expect(otGameState.homeTimeouts).toBe(2); // 2 timeouts in regular season OT
      expect(otGameState.awayTimeouts).toBe(2);
      expect(otGameState.kickoff).toBe(true);
      expect(otGameState.ballPosition).toBe(35);
      expect(otGameState.twoMinuteWarning).toBe(true); // disabled in OT
    });

    it('creates playoff OT with 15-minute clock and 3 timeouts', () => {
      const rng = createTestRNG();
      const otState = initializeOvertime('away', rng);
      const baseState = createTestGameState({
        quarter: 4,
        clock: 0,
        homeScore: 24,
        awayScore: 24,
      });

      const otGameState = createOvertimeGameState(baseState, otState, 'wild_card');

      expect(otGameState.quarter).toBe('OT');
      expect(otGameState.clock).toBe(900); // 15-minute OT period (Rule 16-1-4)
      expect(otGameState.homeTimeouts).toBe(3); // 3 timeouts in playoff OT
      expect(otGameState.awayTimeouts).toBe(3);
      expect(otGameState.kickoff).toBe(true);
      expect(otGameState.ballPosition).toBe(35);
    });

    it('getOvertimePeriodLength returns correct values per game type', () => {
      expect(getOvertimePeriodLength('regular')).toBe(600);
      expect(getOvertimePeriodLength('wild_card')).toBe(900);
      expect(getOvertimePeriodLength('divisional')).toBe(900);
      expect(getOvertimePeriodLength('conference_championship')).toBe(900);
      expect(getOvertimePeriodLength('super_bowl')).toBe(900);
    });

    it('getOvertimeTimeouts returns correct values per game type', () => {
      expect(getOvertimeTimeouts('regular')).toBe(2);
      expect(getOvertimeTimeouts('wild_card')).toBe(3);
      expect(getOvertimeTimeouts('divisional')).toBe(3);
      expect(getOvertimeTimeouts('conference_championship')).toBe(3);
      expect(getOvertimeTimeouts('super_bowl')).toBe(3);
    });
  });

  // -----------------------------------------------------------------------
  // 5. Game terminates (integration-style via the full simulation)
  // -----------------------------------------------------------------------
  describe('game termination', () => {
    it('OT always produces a final result via checkOvertimeEnd', () => {
      // Simulate the logic: both teams possess, then score differs
      const otState = createBaseOTState();

      // First team possesses and scores FG
      const after1 = updateOvertimeState(otState, 'home', 'field_goal');

      // Second team possesses and scores TD
      const after2 = updateOvertimeState(after1, 'away', 'touchdown');

      const gameState = createTestGameState({
        quarter: 'OT',
        clock: 250,
        homeScore: 23,
        awayScore: 27,
      });

      const result = checkOvertimeEnd(after2, gameState, 'regular');
      expect(result.isOver).toBe(true);
      expect(result.winner).toBe('away');
    });
  });
});
