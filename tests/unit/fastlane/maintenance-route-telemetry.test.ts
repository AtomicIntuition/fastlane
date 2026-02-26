import { describe, expect, it } from 'vitest';
import { createMaintenanceRouteRows } from '@/lib/fastlane/maintenance-route-telemetry';

describe('createMaintenanceRouteRows', () => {
  const now = Date.parse('2026-02-26T20:00:00.000Z');

  it('returns rows in replay/throttle/run order', () => {
    const rows = createMaintenanceRouteRows(
      {
        replay: { successCount: 1, failureCount: 2, lastEventAt: null },
        throttle: { successCount: 3, failureCount: 4, lastEventAt: null },
        run: { successCount: 5, failureCount: 6, lastEventAt: null },
      },
      now,
    );

    expect(rows.map((row) => row.key)).toEqual(['replay', 'throttle', 'run']);
    expect(rows.map((row) => row.routeLabel)).toEqual([
      'Replay cleanup',
      'Throttle cleanup',
      'Unified run',
    ]);
  });

  it('returns n/a freshness with null tone when no telemetry timestamp exists', () => {
    const rows = createMaintenanceRouteRows(
      {
        replay: { successCount: 2, failureCount: 1, lastEventAt: null },
        throttle: { successCount: 0, failureCount: 0, lastEventAt: null },
        run: { successCount: 7, failureCount: 3, lastEventAt: null },
      },
      now,
    );

    for (const row of rows) {
      expect(row.freshnessLabel).toBe('n/a');
      expect(row.freshnessTone).toBeNull();
    }
  });

  it('maps recent and stale timestamps to expected freshness labels/tones', () => {
    const rows = createMaintenanceRouteRows(
      {
        replay: {
          successCount: 4,
          failureCount: 1,
          lastEventAt: '2026-02-26T19:58:00.000Z',
        },
        throttle: {
          successCount: 5,
          failureCount: 0,
          lastEventAt: '2026-02-26T19:48:00.000Z',
        },
        run: {
          successCount: 3,
          failureCount: 2,
          lastEventAt: '2026-02-26T18:40:00.000Z',
        },
      },
      now,
    );

    expect(rows).toMatchObject([
      { key: 'replay', freshnessLabel: '<5m', freshnessTone: 'ok' },
      { key: 'throttle', freshnessLabel: '12m', freshnessTone: 'ok' },
      { key: 'run', freshnessLabel: '1h', freshnessTone: 'warn' },
    ]);
  });
});
