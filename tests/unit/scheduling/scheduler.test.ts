import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { determineNextAction, getBroadcastState } from '@/lib/scheduling/scheduler';
import type { Season, ScheduledGame, WeekSchedule } from '@/lib/simulation/types';

// ---------------------------------------------------------------------------
// Helpers — minimal stubs cast to full types (only fields the scheduler
// actually inspects are populated).
// ---------------------------------------------------------------------------

function makeGame(overrides: Partial<{ id: string; status: string; homeTeamId: string; awayTeamId: string }> = {}): ScheduledGame {
  return {
    id: overrides.id ?? 'game-1',
    status: overrides.status ?? 'scheduled',
    homeTeamId: overrides.homeTeamId ?? 'team-a',
    awayTeamId: overrides.awayTeamId ?? 'team-b',
    homeTeam: { abbreviation: 'HME' },
    awayTeam: { abbreviation: 'AWY' },
  } as ScheduledGame;
}

function makeWeek(games: ScheduledGame[], featuredGameId?: string): WeekSchedule {
  return {
    week: 1,
    games,
    featuredGameId: featuredGameId ?? null,
    status: 'upcoming',
  } as WeekSchedule;
}

function makeSeason(overrides: Partial<Season> = {}): Season {
  return {
    id: 'season-1',
    seasonNumber: 1,
    status: 'regular_season',
    currentWeek: 1,
    totalWeeks: 22,
    schedule: [makeWeek([makeGame()])],
    completedAt: null,
    champion: null,
    ...overrides,
  } as Season;
}

// ---------------------------------------------------------------------------
// Tests: determineNextAction
// ---------------------------------------------------------------------------

describe('determineNextAction', () => {
  describe('no season', () => {
    it('returns create_season when season is null', () => {
      const action = determineNextAction(null);
      expect(action.type).toBe('create_season');
    });
  });

  describe('offseason', () => {
    it('returns create_season after offseason duration elapses', () => {
      const season = makeSeason({
        status: 'offseason' as Season['status'],
        completedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      });
      const action = determineNextAction(season);
      expect(action.type).toBe('create_season');
    });

    it('returns no_action during active offseason', () => {
      const season = makeSeason({
        status: 'offseason' as Season['status'],
        completedAt: new Date(Date.now() - 1000), // 1 second ago
      });
      const action = determineNextAction(season);
      expect(action.type).toBe('no_action');
      expect(action.message).toContain('Offseason in progress');
    });

    it('returns create_season if offseason has no completedAt', () => {
      const season = makeSeason({
        status: 'offseason' as Season['status'],
        completedAt: null,
      });
      const action = determineNextAction(season);
      expect(action.type).toBe('create_season');
    });
  });

  describe('broadcasting game', () => {
    it('returns no_action when a game is broadcasting', () => {
      const season = makeSeason({
        schedule: [makeWeek([
          makeGame({ id: 'game-live', status: 'broadcasting' }),
          makeGame({ id: 'game-2', status: 'scheduled' }),
        ])],
      });
      const action = determineNextAction(season);
      expect(action.type).toBe('no_action');
      expect(action.gameId).toBe('game-live');
      expect(action.message).toContain('broadcasting');
    });
  });

  describe('simulating games', () => {
    it('returns no_action when games are simulating and none scheduled', () => {
      const season = makeSeason({
        schedule: [makeWeek([
          makeGame({ id: 'game-sim', status: 'simulating' }),
        ])],
      });
      const action = determineNextAction(season);
      expect(action.type).toBe('no_action');
      expect(action.message).toContain('simulating');
    });
  });

  describe('scheduled games', () => {
    it('returns start_game for the next scheduled game', () => {
      const season = makeSeason({
        schedule: [makeWeek([
          makeGame({ id: 'game-1', status: 'completed' }),
          makeGame({ id: 'game-2', status: 'scheduled' }),
        ])],
      });
      const action = determineNextAction(season);
      expect(action.type).toBe('start_game');
      expect(action.gameId).toBe('game-2');
    });

    it('prioritizes the featured game', () => {
      const season = makeSeason({
        schedule: [makeWeek(
          [
            makeGame({ id: 'game-1', status: 'scheduled' }),
            makeGame({ id: 'game-featured', status: 'scheduled' }),
          ],
          'game-featured',
        )],
      });
      const action = determineNextAction(season);
      expect(action.type).toBe('start_game');
      expect(action.gameId).toBe('game-featured');
    });
  });

  describe('all games complete', () => {
    it('returns advance_week for regular season week', () => {
      const season = makeSeason({
        currentWeek: 5,
        schedule: [
          ...Array(4).fill(null).map(() => makeWeek([makeGame({ status: 'completed' })])),
          makeWeek([makeGame({ status: 'completed' })]),
        ],
      });
      const action = determineNextAction(season);
      expect(action.type).toBe('advance_week');
    });

    it('returns start_playoffs after week 18', () => {
      const season = makeSeason({
        currentWeek: 18,
        schedule: Array(18).fill(null).map(() => makeWeek([makeGame({ status: 'completed' })])),
      });
      const action = determineNextAction(season);
      expect(action.type).toBe('start_playoffs');
    });

    it('returns end_season after super bowl', () => {
      const season = makeSeason({
        status: 'super_bowl' as Season['status'],
        currentWeek: 22,
        schedule: Array(22).fill(null).map(() => makeWeek([makeGame({ status: 'completed' })])),
      });
      const action = determineNextAction(season);
      expect(action.type).toBe('end_season');
    });

    it('returns advance_playoffs after wild card round', () => {
      const season = makeSeason({
        status: 'wild_card' as Season['status'],
        currentWeek: 19,
        schedule: Array(19).fill(null).map(() => makeWeek([makeGame({ status: 'completed' })])),
      });
      const action = determineNextAction(season);
      expect(action.type).toBe('advance_playoffs');
    });

    it('returns advance_playoffs after divisional round', () => {
      const season = makeSeason({
        status: 'divisional' as Season['status'],
        currentWeek: 20,
        schedule: Array(20).fill(null).map(() => makeWeek([makeGame({ status: 'completed' })])),
      });
      const action = determineNextAction(season);
      expect(action.type).toBe('advance_playoffs');
    });

    it('returns advance_playoffs after conference championship', () => {
      const season = makeSeason({
        status: 'conference_championship' as Season['status'],
        currentWeek: 21,
        schedule: Array(21).fill(null).map(() => makeWeek([makeGame({ status: 'completed' })])),
      });
      const action = determineNextAction(season);
      expect(action.type).toBe('advance_playoffs');
    });
  });

  describe('edge cases', () => {
    it('handles empty week gracefully', () => {
      const season = makeSeason({
        schedule: [makeWeek([])],
      });
      const action = determineNextAction(season);
      // Should advance past an empty week
      expect(action.type).toBe('advance_week');
    });

    it('handles out-of-bounds currentWeek', () => {
      const season = makeSeason({
        currentWeek: 99,
        schedule: [makeWeek([makeGame()])],
      });
      const action = determineNextAction(season);
      // With no valid week, should handle gracefully
      expect(action.type).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: getBroadcastState
// ---------------------------------------------------------------------------

describe('getBroadcastState', () => {
  it('returns offseason when no season exists', () => {
    const state = getBroadcastState(null);
    expect(state.status).toBe('offseason');
    expect(state.currentGameId).toBeNull();
  });

  it('returns offseason for completed season', () => {
    const season = makeSeason({
      status: 'offseason' as Season['status'],
      completedAt: new Date(),
    });
    const state = getBroadcastState(season);
    expect(state.status).toBe('offseason');
  });

  it('returns live when a game is broadcasting', () => {
    const season = makeSeason({
      schedule: [makeWeek([
        makeGame({ id: 'game-live', status: 'broadcasting' }),
        makeGame({ id: 'game-2', status: 'scheduled' }),
      ])],
    });
    const state = getBroadcastState(season);
    expect(state.status).toBe('live');
    expect(state.currentGameId).toBe('game-live');
    expect(state.nextGameId).toBe('game-2');
    expect(state.countdown).toBe(0);
  });

  it('returns intermission between games', () => {
    const season = makeSeason({
      schedule: [makeWeek([
        makeGame({ id: 'game-1', status: 'completed' }),
        makeGame({ id: 'game-2', status: 'scheduled' }),
      ])],
    });
    const state = getBroadcastState(season);
    expect(state.status).toBe('intermission');
    expect(state.nextGameId).toBe('game-2');
  });

  it('returns intermission when all games complete', () => {
    const season = makeSeason({
      schedule: [makeWeek([
        makeGame({ id: 'game-1', status: 'completed' }),
      ])],
    });
    const state = getBroadcastState(season);
    expect(state.status).toBe('intermission');
    expect(state.message).toContain('complete');
  });

  it('returns intermission when no games have started yet (scheduled games waiting)', () => {
    const season = makeSeason({
      schedule: [makeWeek([
        makeGame({ id: 'game-1', status: 'scheduled' }),
        makeGame({ id: 'game-2', status: 'scheduled' }),
      ])],
    });
    const state = getBroadcastState(season);
    // With scheduled games present and no completed games, the broadcast
    // treats this as an intermission state (games are queued but not yet live)
    expect(state.status).toBe('intermission');
    expect(state.nextGameId).toBeDefined();
  });

  it('uses featured game as nextGameId when available', () => {
    const season = makeSeason({
      schedule: [makeWeek(
        [
          makeGame({ id: 'game-1', status: 'completed' }),
          makeGame({ id: 'game-featured', status: 'scheduled' }),
          makeGame({ id: 'game-3', status: 'scheduled' }),
        ],
        'game-featured',
      )],
    });
    const state = getBroadcastState(season);
    expect(state.nextGameId).toBe('game-featured');
  });
});
