import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { simulateGame } from '@/lib/simulation/engine';
import type { SimulationConfig } from '@/lib/simulation/engine';
import { createTestTeam, createTestRoster } from '../helpers/test-utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildConfig(serverSeed: string, clientSeed: string): SimulationConfig {
  const homeTeam = createTestTeam({ id: 'team-home', name: 'Home Eagles', abbreviation: 'HME' });
  const awayTeam = createTestTeam({ id: 'team-away', name: 'Away Falcons', abbreviation: 'AWY' });

  return {
    homeTeam,
    awayTeam,
    homePlayers: createTestRoster('team-home'),
    awayPlayers: createTestRoster('team-away'),
    gameType: 'regular',
    serverSeed,
    clientSeed,
  };
}

// ---------------------------------------------------------------------------
// Property-based tests
// ---------------------------------------------------------------------------

describe('Simulation Property Tests', () => {
  // -----------------------------------------------------------------------
  // 1. Scores are always >= 0
  // -----------------------------------------------------------------------
  it('final scores are always non-negative', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 16, maxLength: 64 }),
        fc.string({ minLength: 8, maxLength: 32 }),
        (serverSeed: string, clientSeed: string) => {
          const game = simulateGame(buildConfig(serverSeed, clientSeed));
          expect(game.finalScore.home).toBeGreaterThanOrEqual(0);
          expect(game.finalScore.away).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 5 },
    );
  });

  // -----------------------------------------------------------------------
  // 2. Down is always 1-4
  // -----------------------------------------------------------------------
  it('every event has down in range 1-4', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 16, maxLength: 64 }),
        fc.string({ minLength: 8, maxLength: 32 }),
        (serverSeed: string, clientSeed: string) => {
          const game = simulateGame(buildConfig(serverSeed, clientSeed));

          for (const event of game.events) {
            const down = event.gameState.down;
            expect(down).toBeGreaterThanOrEqual(1);
            expect(down).toBeLessThanOrEqual(4);
          }
        },
      ),
      { numRuns: 3 },
    );
  });

  // -----------------------------------------------------------------------
  // 3. Yards to go is always 1-99
  // -----------------------------------------------------------------------
  it('every event has yardsToGo in range 1-99', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 16, maxLength: 64 }),
        fc.string({ minLength: 8, maxLength: 32 }),
        (serverSeed: string, clientSeed: string) => {
          const game = simulateGame(buildConfig(serverSeed, clientSeed));

          for (const event of game.events) {
            const ytg = event.gameState.yardsToGo;
            expect(ytg).toBeGreaterThanOrEqual(1);
            expect(ytg).toBeLessThanOrEqual(99);
          }
        },
      ),
      { numRuns: 3 },
    );
  });

  // -----------------------------------------------------------------------
  // 4. Ball position is always 0-100
  // -----------------------------------------------------------------------
  it('every event has ballPosition in range 0-100', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 16, maxLength: 64 }),
        fc.string({ minLength: 8, maxLength: 32 }),
        (serverSeed: string, clientSeed: string) => {
          const game = simulateGame(buildConfig(serverSeed, clientSeed));

          for (const event of game.events) {
            const bp = event.gameState.ballPosition;
            expect(bp).toBeGreaterThanOrEqual(0);
            expect(bp).toBeLessThanOrEqual(100);
          }
        },
      ),
      { numRuns: 3 },
    );
  });

  // -----------------------------------------------------------------------
  // 5. Clock is always 0-900 (or 0-600 in OT)
  // -----------------------------------------------------------------------
  it('every event has clock in valid range', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 16, maxLength: 64 }),
        fc.string({ minLength: 8, maxLength: 32 }),
        (serverSeed: string, clientSeed: string) => {
          const game = simulateGame(buildConfig(serverSeed, clientSeed));

          for (const event of game.events) {
            const clock = event.gameState.clock;
            expect(clock).toBeGreaterThanOrEqual(0);

            if (event.gameState.quarter === 'OT') {
              expect(clock).toBeLessThanOrEqual(600);
            } else {
              expect(clock).toBeLessThanOrEqual(900);
            }
          }
        },
      ),
      { numRuns: 3 },
    );
  });

  // -----------------------------------------------------------------------
  // 6. Timeouts are always 0-3
  // -----------------------------------------------------------------------
  it('every event has timeouts in range 0-3', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 16, maxLength: 64 }),
        fc.string({ minLength: 8, maxLength: 32 }),
        (serverSeed: string, clientSeed: string) => {
          const game = simulateGame(buildConfig(serverSeed, clientSeed));

          for (const event of game.events) {
            expect(event.gameState.homeTimeouts).toBeGreaterThanOrEqual(0);
            expect(event.gameState.homeTimeouts).toBeLessThanOrEqual(3);
            expect(event.gameState.awayTimeouts).toBeGreaterThanOrEqual(0);
            expect(event.gameState.awayTimeouts).toBeLessThanOrEqual(3);
          }
        },
      ),
      { numRuns: 3 },
    );
  });

  // -----------------------------------------------------------------------
  // 7. Game always terminates within a reasonable number of plays
  // -----------------------------------------------------------------------
  it('game always terminates with totalPlays > 0 and < 500', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 16, maxLength: 64 }),
        fc.string({ minLength: 8, maxLength: 32 }),
        (serverSeed: string, clientSeed: string) => {
          const game = simulateGame(buildConfig(serverSeed, clientSeed));
          expect(game.totalPlays).toBeGreaterThan(0);
          expect(game.totalPlays).toBeLessThan(500);
        },
      ),
      { numRuns: 5 },
    );
  });

  // -----------------------------------------------------------------------
  // 8. Event numbers are sequential starting from 1
  // -----------------------------------------------------------------------
  it('event numbers are sequential', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 16, maxLength: 64 }),
        fc.string({ minLength: 8, maxLength: 32 }),
        (serverSeed: string, clientSeed: string) => {
          const game = simulateGame(buildConfig(serverSeed, clientSeed));

          for (let i = 0; i < game.events.length; i++) {
            expect(game.events[i].eventNumber).toBe(i + 1);
          }
        },
      ),
      { numRuns: 3 },
    );
  });

  // -----------------------------------------------------------------------
  // 9. Determinism: same inputs always produce the same output
  // -----------------------------------------------------------------------
  it('same seeds produce identical final scores', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 16, maxLength: 64 }),
        fc.string({ minLength: 8, maxLength: 32 }),
        (serverSeed: string, clientSeed: string) => {
          const game1 = simulateGame(buildConfig(serverSeed, clientSeed));
          const game2 = simulateGame(buildConfig(serverSeed, clientSeed));

          expect(game1.finalScore.home).toBe(game2.finalScore.home);
          expect(game1.finalScore.away).toBe(game2.finalScore.away);
          expect(game1.totalPlays).toBe(game2.totalPlays);
        },
      ),
      { numRuns: 3 },
    );
  });

  // -----------------------------------------------------------------------
  // 10. Interception rate is within realistic NFL bounds (1.5%–4.0%)
  // -----------------------------------------------------------------------
  it('aggregate interception rate is within NFL-realistic bounds', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.string({ minLength: 16, maxLength: 64 }),
            fc.string({ minLength: 8, maxLength: 32 }),
          ),
          { minLength: 10, maxLength: 10 },
        ),
        (seedPairs) => {
          let totalPassAttempts = 0;
          let totalInterceptions = 0;

          for (const [serverSeed, clientSeed] of seedPairs) {
            const game = simulateGame(buildConfig(serverSeed, clientSeed));

            for (const event of game.events) {
              const { type, turnover } = event.playResult;

              // Count pass attempts: completions, incompletions (includes INTs and drops)
              if (type === 'pass_complete' || type === 'pass_incomplete') {
                totalPassAttempts++;
              }

              // Count interceptions
              if (turnover?.type === 'interception') {
                totalInterceptions++;
              }
            }
          }

          // Need a minimum sample size for statistical significance
          expect(totalPassAttempts).toBeGreaterThan(100);

          const intRate = totalInterceptions / totalPassAttempts;

          // NFL average INT rate is ~2.3-2.5%; allow 1.5%-4.0% for simulation variance
          expect(intRate).toBeGreaterThanOrEqual(0.015);
          expect(intRate).toBeLessThanOrEqual(0.04);
        },
      ),
      { numRuns: 3 },
    );
  });

  // -----------------------------------------------------------------------
  // 11. Dropped pass rate is within realistic NFL bounds (1%–7%)
  // -----------------------------------------------------------------------
  it('aggregate drop rate is within NFL-realistic bounds', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.string({ minLength: 16, maxLength: 64 }),
            fc.string({ minLength: 8, maxLength: 32 }),
          ),
          { minLength: 10, maxLength: 10 },
        ),
        (seedPairs) => {
          let totalCatchable = 0; // completions + drops (passes that reached the receiver)
          let totalDrops = 0;

          for (const [serverSeed, clientSeed] of seedPairs) {
            const game = simulateGame(buildConfig(serverSeed, clientSeed));

            for (const event of game.events) {
              const { type, dropped } = event.playResult;

              // Completions count as catchable
              if (type === 'pass_complete') {
                totalCatchable++;
              }

              // Drops are catchable passes that were not held onto
              if (dropped) {
                totalCatchable++;
                totalDrops++;
              }
            }
          }

          // Need a minimum sample size for statistical significance
          expect(totalCatchable).toBeGreaterThan(100);

          const dropRate = totalDrops / totalCatchable;

          // NFL average drop rate is ~3.5%; allow 1%-7% for simulation variance
          expect(dropRate).toBeGreaterThanOrEqual(0.01);
          expect(dropRate).toBeLessThanOrEqual(0.07);
        },
      ),
      { numRuns: 3 },
    );
  });
});
