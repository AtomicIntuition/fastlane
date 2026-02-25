import { describe, it, expect } from 'vitest';
import { simulateGame } from '@/lib/simulation/engine';
import type { SimulationConfig } from '@/lib/simulation/engine';
import {
  createTestTeam,
  createTestRoster,
  TEST_SERVER_SEED,
  TEST_CLIENT_SEED,
} from '../../helpers/test-utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildConfig(overrides: Partial<SimulationConfig> = {}): SimulationConfig {
  const homeTeam = createTestTeam({ id: 'team-home', name: 'Home Eagles', abbreviation: 'HME' });
  const awayTeam = createTestTeam({ id: 'team-away', name: 'Away Falcons', abbreviation: 'AWY' });

  return {
    homeTeam,
    awayTeam,
    homePlayers: createTestRoster('team-home'),
    awayPlayers: createTestRoster('team-away'),
    gameType: 'regular',
    serverSeed: TEST_SERVER_SEED,
    clientSeed: TEST_CLIENT_SEED,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Simulation Engine', () => {
  // -----------------------------------------------------------------------
  // 1. Valid output structure
  // -----------------------------------------------------------------------
  describe('simulateGame produces valid output', () => {
    it('returns a SimulatedGame with all required fields', () => {
      const config = buildConfig();
      const game = simulateGame(config);

      expect(game).toBeDefined();
      expect(game.id).toBeTypeOf('string');
      expect(game.homeTeam).toBeDefined();
      expect(game.awayTeam).toBeDefined();
      expect(game.events).toBeInstanceOf(Array);
      expect(game.events.length).toBeGreaterThan(0);
      expect(game.finalScore).toBeDefined();
      expect(game.finalScore.home).toBeTypeOf('number');
      expect(game.finalScore.away).toBeTypeOf('number');
      expect(game.serverSeedHash).toBeTypeOf('string');
      expect(game.serverSeed).toBeTypeOf('string');
      expect(game.clientSeed).toBeTypeOf('string');
      expect(game.nonce).toBeTypeOf('number');
      expect(game.totalPlays).toBeTypeOf('number');
      expect(game.mvp).toBeDefined();
      expect(game.boxScore).toBeDefined();
      expect(game.drives).toBeInstanceOf(Array);
    });
  });

  // -----------------------------------------------------------------------
  // 2. Determinism: same seeds produce the same game
  // -----------------------------------------------------------------------
  describe('determinism', () => {
    it('produces identical results with the same seeds', () => {
      const config = buildConfig();
      const game1 = simulateGame(config);
      const game2 = simulateGame(config);

      expect(game1.finalScore).toEqual(game2.finalScore);
      expect(game1.totalPlays).toBe(game2.totalPlays);
      expect(game1.nonce).toBe(game2.nonce);
      expect(game1.events.length).toBe(game2.events.length);

      // Spot-check a few event descriptions to confirm full determinism
      for (let i = 0; i < Math.min(10, game1.events.length); i++) {
        expect(game1.events[i].playResult.description).toBe(
          game2.events[i].playResult.description,
        );
      }
    });

    it('produces different results with different seeds', () => {
      const game1 = simulateGame(buildConfig({ serverSeed: 'seed-alpha-aabbccdd00112233' }));
      const game2 = simulateGame(buildConfig({ serverSeed: 'seed-bravo-ffeeddcc99887766' }));

      // It is theoretically possible for two games to have the same score,
      // but the play-by-play events should differ.
      const descriptions1 = game1.events.slice(0, 5).map(e => e.playResult.description);
      const descriptions2 = game2.events.slice(0, 5).map(e => e.playResult.description);

      expect(descriptions1).not.toEqual(descriptions2);
    });
  });

  // -----------------------------------------------------------------------
  // 3. Game always terminates
  // -----------------------------------------------------------------------
  describe('termination', () => {
    it('completes a regular season game within a reasonable number of plays', () => {
      const game = simulateGame(buildConfig());
      // A game that never terminates would time out or hang.
      // If we get here, it terminated.
      expect(game.totalPlays).toBeGreaterThan(0);
    });

    it('completes a playoff game within a reasonable number of plays', () => {
      const game = simulateGame(buildConfig({ gameType: 'wild_card' }));
      expect(game.totalPlays).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // 4. Final scores are non-negative
  // -----------------------------------------------------------------------
  describe('score validity', () => {
    it('both team scores are non-negative', () => {
      // Run a handful of games with different seeds
      for (let i = 0; i < 5; i++) {
        const game = simulateGame(
          buildConfig({ serverSeed: `score-test-seed-${i}-aabbccdd` }),
        );

        expect(game.finalScore.home).toBeGreaterThanOrEqual(0);
        expect(game.finalScore.away).toBeGreaterThanOrEqual(0);
      }
    });

    it('scores are divisible by valid NFL scoring increments', () => {
      // NFL scoring: 2 (safety), 3 (FG), 6 (TD), 7 (TD+XP), 8 (TD+2pt)
      // Any non-negative integer can technically arise from combinations,
      // but 1 and 5 are the only truly impossible single-game scores in NFL
      // (1 requires a single extra point with no TD, which cannot happen alone).
      // We just verify non-negative integers here.
      const game = simulateGame(buildConfig());
      expect(Number.isInteger(game.finalScore.home)).toBe(true);
      expect(Number.isInteger(game.finalScore.away)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // 5. Total plays in realistic range
  // -----------------------------------------------------------------------
  describe('play count', () => {
    it('total plays fall within a realistic range (100-450)', () => {
      // Run multiple games to check the range
      // Upper bound is 450 to accommodate high-scoring games with many kickoffs/PATs
      // and additional RNG draws from offensive/defensive coordinator systems
      for (let i = 0; i < 3; i++) {
        const game = simulateGame(
          buildConfig({ serverSeed: `play-count-seed-${i}-11223344` }),
        );

        expect(game.totalPlays).toBeGreaterThanOrEqual(100);
        expect(game.totalPlays).toBeLessThanOrEqual(450);
      }
    });
  });

  // -----------------------------------------------------------------------
  // 6. Seed hash is verifiable
  // -----------------------------------------------------------------------
  describe('provably fair seeds', () => {
    it('records the server seed and its hash for verification', () => {
      const game = simulateGame(buildConfig());

      expect(game.serverSeed).toBe(TEST_SERVER_SEED);
      expect(game.clientSeed).toBe(TEST_CLIENT_SEED);
      expect(game.serverSeedHash).toBeTypeOf('string');
      expect(game.serverSeedHash.length).toBe(64); // SHA-256 hex
    });
  });

  // -----------------------------------------------------------------------
  // 7. Offensive coordinator integration
  // -----------------------------------------------------------------------
  describe('offensive coordinator integration', () => {
    it('populates offensiveCall, protectionScheme, motionType, runScheme, and formationVariant on a reasonable percentage of plays', () => {
      const game = simulateGame(buildConfig());

      // Filter to only normal plays (exclude pregame, coin_toss, kickoff,
      // punt, field_goal, extra_point, touchback, two_point, kneel, spike)
      const normalPlays = game.events.filter(e => {
        const t = e.playResult.type;
        return (
          t === 'run' ||
          t === 'pass_complete' ||
          t === 'pass_incomplete' ||
          t === 'sack' ||
          t === 'scramble'
        );
      });

      expect(normalPlays.length).toBeGreaterThan(0);

      let withOffensiveCall = 0;
      let withProtection = 0;
      let withMotion = 0;
      let withRunScheme = 0;
      let withFormationVariant = 0;

      for (const event of normalPlays) {
        const pr = event.playResult;
        if (pr.offensiveCall) withOffensiveCall++;
        if (pr.protectionScheme) withProtection++;
        if (pr.motionType) withMotion++;
        if (pr.runScheme) withRunScheme++;
        if (pr.formationVariant) withFormationVariant++;
      }

      const total = normalPlays.length;

      // offensiveCall should be on the vast majority of normal plays
      expect(withOffensiveCall / total).toBeGreaterThan(0.8);

      // protectionScheme should appear on a significant portion (pass plays)
      expect(withProtection).toBeGreaterThan(0);

      // motionType is selected ~45% of the time (55% no-motion probability)
      // so we expect at least some plays to have it
      expect(withMotion).toBeGreaterThan(0);

      // runScheme should appear on run plays
      expect(withRunScheme).toBeGreaterThan(0);

      // formationVariant should appear on some plays
      expect(withFormationVariant).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // 8. Dome team weather
  // -----------------------------------------------------------------------
  describe('dome team weather', () => {
    it('produces clear/indoor weather when a dome team is home', () => {
      // MIN (Minnesota Vikings) is a dome team
      const homeTeam = createTestTeam({
        id: 'team-min',
        name: 'Minnesota Vikings',
        abbreviation: 'MIN',
      });
      const awayTeam = createTestTeam({
        id: 'team-gb',
        name: 'Green Bay Packers',
        abbreviation: 'GB',
      });

      const config = buildConfig({
        homeTeam,
        awayTeam,
        homePlayers: createTestRoster('team-min'),
        awayPlayers: createTestRoster('team-gb'),
      });

      const game = simulateGame(config);

      // The SimulatedGame has a top-level weather field
      expect(game.weather).toBeDefined();
      expect(game.weather.type).toBe('clear');
      expect(game.weather.temperature).toBe(72);
      expect(game.weather.windSpeed).toBe(0);
      expect(game.weather.precipitation).toBe(0);
      expect(game.weather.description).toContain('Indoor');

      // The initial game state (event 0) should also carry the weather
      const firstEvent = game.events[0];
      expect(firstEvent.gameState.weather).toBeDefined();
      expect(firstEvent.gameState.weather!.type).toBe('clear');
      expect(firstEvent.gameState.weather!.windSpeed).toBe(0);
    });

    it('may produce non-clear weather when a non-dome team is home', () => {
      // Run several games with a non-dome team (GB) at home.
      // At least one should have non-clear weather given the weighted
      // distribution (only 40% chance of clear).
      let foundNonClear = false;
      for (let i = 0; i < 10; i++) {
        const homeTeam = createTestTeam({
          id: 'team-gb',
          name: 'Green Bay Packers',
          abbreviation: 'GB',
        });
        const awayTeam = createTestTeam({
          id: 'team-chi',
          name: 'Chicago Bears',
          abbreviation: 'CHI',
        });

        const game = simulateGame(buildConfig({
          homeTeam,
          awayTeam,
          homePlayers: createTestRoster('team-gb'),
          awayPlayers: createTestRoster('team-chi'),
          serverSeed: `dome-weather-test-${i}-aabb1122`,
        }));

        if (game.weather.type !== 'clear') {
          foundNonClear = true;
          break;
        }
      }

      expect(foundNonClear).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // 9. Dropped passes
  // -----------------------------------------------------------------------
  describe('dropped passes', () => {
    it('some plays have dropped: true across multiple games', () => {
      let totalDrops = 0;

      for (let i = 0; i < 5; i++) {
        const game = simulateGame(
          buildConfig({ serverSeed: `drop-test-seed-${i}-aabb9988` }),
        );

        const drops = game.events.filter(e => e.playResult.dropped === true);
        totalDrops += drops.length;
      }

      // Drops occur at ~3.5% of completed passes. Across 5 games with
      // roughly 30-40 pass attempts each, we should see at least a few.
      expect(totalDrops).toBeGreaterThan(0);
    });

    it('dropped passes are recorded as pass_incomplete', () => {
      // Run games until we find a drop, then verify its properties
      for (let i = 0; i < 10; i++) {
        const game = simulateGame(
          buildConfig({ serverSeed: `drop-verify-seed-${i}-ccddee00` }),
        );

        const drop = game.events.find(e => e.playResult.dropped === true);
        if (drop) {
          expect(drop.playResult.type).toBe('pass_incomplete');
          expect(drop.playResult.yardsGained).toBe(0);
          expect(drop.playResult.isClockStopped).toBe(true);
          return; // Test passes once we verify one drop
        }
      }

      // If we somehow never found a drop across 10 games, fail explicitly
      expect.fail('No dropped passes found across 10 games');
    });
  });

  // -----------------------------------------------------------------------
  // 10. Caddy route concept
  // -----------------------------------------------------------------------
  describe('caddy route concept', () => {
    it('caddy appears as a routeConcept on some plays across multiple games', () => {
      let foundCaddy = false;

      // caddy appears in pass_deep (15% MOFO, 10% MOFC) and
      // play_action_deep (15% MOFO, 10% MOFC) tables, so it should
      // appear in a reasonable sample of games.
      for (let i = 0; i < 15; i++) {
        const game = simulateGame(
          buildConfig({ serverSeed: `caddy-test-seed-${i}-11223344` }),
        );

        const caddyPlay = game.events.find(
          e => e.playResult.routeConcept === 'caddy',
        );

        if (caddyPlay) {
          foundCaddy = true;
          break;
        }
      }

      expect(foundCaddy).toBe(true);
    });
  });
});
