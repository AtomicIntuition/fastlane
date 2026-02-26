import { expect, test } from '@playwright/test';
import type { FastLaneState } from '@/lib/fastlane/types';
import { gotoWithTransient404Retry } from './utils/navigation';

const baseState: FastLaneState = {
  onboarded: false,
  tier: 'free',
  profile: {
    goal: 'energy',
    experience: 'new',
    protocolId: '16_8',
    wakeTime: '07:00',
    sleepTime: '23:00',
    reminders: true,
  },
  activeFastStartAt: null,
  sessions: [],
  checkIns: [],
  flags: {
    firstFastStartedTracked: false,
    firstFastCompletedTracked: false,
    postOnboardingPaywallSeen: false,
  },
};

test.describe('FastLane Landing', () => {
  test('landing shows conversion sections and CTA', async ({ page }) => {
    await gotoWithTransient404Retry(page, '/fastlane');
    await expect(page.getByRole('heading', { name: /make fasting feel premium/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /start free now/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /pricing/i })).toBeVisible();
    await expect(page.locator('body')).toContainText(/is this medical advice\?/i);
  });

  test('landing CTA emits analytics event', async ({ page }) => {
    const analyticsEvents: Array<{ name?: string; props?: Record<string, unknown> }> = [];

    await page.route('**/api/fastlane/analytics', async (route) => {
      analyticsEvents.push(route.request().postDataJSON() as { name?: string; props?: Record<string, unknown> });
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    });

    await gotoWithTransient404Retry(page, '/fastlane');
    await page.getByRole('link', { name: /see pricing/i }).click();

    await expect.poll(() => analyticsEvents.length).toBeGreaterThan(0);
    expect(analyticsEvents.some((event) => event.name === 'landing_cta_clicked')).toBeTruthy();
    expect(
      analyticsEvents.some(
        (event) => event.name === 'landing_cta_clicked' && event.props?.source === 'hero_pricing',
      ),
    ).toBeTruthy();
  });
});

test.describe('FastLane App Flow', () => {
  test('onboards user and reaches dashboard with paywall modal', async ({ page }) => {
    let state = { ...baseState };
    let firstStateAttempt = true;

    await page.route('**/api/fastlane/auth/guest', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ userId: 'test-user' }),
      });
    });

    await page.route('**/api/fastlane/state', async (route) => {
      const req = route.request();
      if (req.method() === 'GET') {
        if (firstStateAttempt) {
          firstStateAttempt = false;
          await route.fulfill({
            status: 401,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Authentication required' }),
          });
          return;
        }

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ state }),
        });
        return;
      }

      if (req.method() === 'PUT') {
        const patch = req.postDataJSON() as Record<string, unknown>;
        const profilePatch: Partial<FastLaneState['profile']> = {
          ...(patch.goal !== undefined ? { goal: patch.goal as FastLaneState['profile']['goal'] } : {}),
          ...(patch.experience !== undefined
            ? { experience: patch.experience as FastLaneState['profile']['experience'] }
            : {}),
          ...(patch.protocolId !== undefined ? { protocolId: patch.protocolId as string } : {}),
          ...(patch.wakeTime !== undefined ? { wakeTime: patch.wakeTime as string } : {}),
          ...(patch.sleepTime !== undefined ? { sleepTime: patch.sleepTime as string } : {}),
          ...(patch.reminders !== undefined ? { reminders: Boolean(patch.reminders) } : {}),
        };

        state = {
          ...state,
          profile: {
            ...state.profile,
            ...profilePatch,
          },
          ...(patch.onboarded !== undefined ? { onboarded: Boolean(patch.onboarded) } : {}),
        };

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ state }),
        });
      }
    });

    await gotoWithTransient404Retry(page, '/fastlane/app');

    await expect(page.getByRole('heading', { name: /build your fasting plan/i })).toBeVisible();
    await page.getByRole('button', { name: /^continue$/i }).click();
    await page.getByRole('button', { name: /^continue$/i }).click();
    await page.getByRole('button', { name: /enter fastlane/i }).click();

    await expect(page.getByText(/fastlane dashboard/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: /go pro/i })).toBeVisible();
    await page.getByRole('button', { name: /not now/i }).click();
  });

  test('starts and ends a fast with mocked API', async ({ page }) => {
    const startIso = '2026-02-25T10:00:00.000Z';
    const endIso = '2026-02-25T18:00:00.000Z';

    let state = {
      ...baseState,
      onboarded: true,
      flags: {
        firstFastStartedTracked: true,
        firstFastCompletedTracked: false,
        postOnboardingPaywallSeen: true,
      },
    };

    await page.route('**/api/fastlane/state', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ state }),
      });
    });

    await page.route('**/api/fastlane/session/start', async (route) => {
      state = {
        ...state,
        activeFastStartAt: startIso,
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ state }),
      });
    });

    await page.route('**/api/fastlane/session/end', async (route) => {
      state = {
        ...state,
        activeFastStartAt: null,
        sessions: [
          {
            id: 'sess_1',
            startAt: startIso,
            endAt: endIso,
            durationMinutes: 480,
            protocolId: '16_8',
          },
        ],
      };

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ state, durationMinutes: 480 }),
      });
    });

    await gotoWithTransient404Retry(page, '/fastlane/app');
    await page.getByRole('button', { name: /start fast/i }).click();
    await expect(page.getByRole('button', { name: /end fast/i })).toBeVisible();

    await page.getByRole('button', { name: /end fast/i }).click();
    await expect(page.locator('body')).toContainText(/total fasts/i);
    await expect(page.locator('body')).toContainText('1');
  });

  test('reset session returns user to onboarding after dashboard', async ({ page }) => {
    const onboardedState: FastLaneState = {
      ...baseState,
      onboarded: true,
      flags: {
        firstFastStartedTracked: true,
        firstFastCompletedTracked: false,
        postOnboardingPaywallSeen: true,
      },
    };
    const freshState: FastLaneState = {
      ...baseState,
      onboarded: false,
    };

    let state = onboardedState;
    let resetHappened = false;

    await page.route('**/api/fastlane/auth/guest', async (route) => {
      const method = route.request().method();
      if (method === 'DELETE') {
        resetHappened = true;
        state = freshState;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ userId: 'new-guest-user' }),
      });
    });

    await page.route('**/api/fastlane/state', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ state }),
      });
    });

    await gotoWithTransient404Retry(page, '/fastlane/app');
    await expect(page.getByText(/fastlane dashboard/i)).toBeVisible();
    await page.getByRole('button', { name: /reset session/i }).click();

    await expect.poll(() => resetHappened).toBeTruthy();
    await expect(page.getByRole('heading', { name: /build your fasting plan/i })).toBeVisible();
  });

  test('refresh keeps session and dashboard state', async ({ page }) => {
    const state: FastLaneState = {
      ...baseState,
      onboarded: true,
      flags: {
        firstFastStartedTracked: true,
        firstFastCompletedTracked: false,
        postOnboardingPaywallSeen: true,
      },
    };

    await page.route('**/api/fastlane/state', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ state }),
      });
    });

    await gotoWithTransient404Retry(page, '/fastlane/app');
    await expect(page.getByText(/fastlane dashboard/i)).toBeVisible();

    await page.reload({ waitUntil: 'load' });
    await expect(page.getByText(/fastlane dashboard/i)).toBeVisible();
  });

  test('dashboard shows notification plan and supports reminder toggle', async ({ page }) => {
    let state: FastLaneState = {
      ...baseState,
      onboarded: true,
      flags: {
        firstFastStartedTracked: true,
        firstFastCompletedTracked: true,
        postOnboardingPaywallSeen: true,
      },
    };
    let reminderPatchCount = 0;

    await page.route('**/api/fastlane/state', async (route) => {
      const req = route.request();
      if (req.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ state }),
        });
        return;
      }

      if (req.method() === 'PUT') {
        const patch = req.postDataJSON() as Record<string, unknown>;
        if (typeof patch.reminders === 'boolean') {
          reminderPatchCount += 1;
          state = {
            ...state,
            profile: {
              ...state.profile,
              reminders: patch.reminders,
            },
          };
        }

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ state }),
        });
      }
    });

    await page.route('**/api/fastlane/notifications/plan', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: state.profile.reminders,
          generatedAt: '2026-02-26T10:00:00.000Z',
          next: state.profile.reminders
            ? [
                {
                  id: 'start-window',
                  title: 'Start your fast window',
                  body: 'Kick off your next fast during your planned routine window.',
                  sendAt: '2026-02-27T07:00:00.000Z',
                  channel: 'in_app',
                  priority: 'normal',
                },
              ]
            : [],
        }),
      });
    });

    await gotoWithTransient404Retry(page, '/fastlane/app');
    await expect(page.getByRole('heading', { name: /notification plan/i })).toBeVisible();
    await expect(page.locator('body')).toContainText(/start your fast window/i);

    await page.getByRole('button', { name: /pause reminders/i }).click();
    await expect.poll(() => reminderPatchCount).toBe(1);
    await expect(page.getByRole('button', { name: /enable reminders/i })).toBeVisible();
  });

  test('onboarding emits analytics conversion events', async ({ page }) => {
    let state = { ...baseState };
    const analyticsEvents: Array<{ name?: string; props?: Record<string, unknown> }> = [];

    await page.route('**/api/fastlane/analytics', async (route) => {
      analyticsEvents.push(route.request().postDataJSON() as { name?: string; props?: Record<string, unknown> });
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.route('**/api/fastlane/auth/guest', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ userId: 'analytics-user' }),
      });
    });

    await page.route('**/api/fastlane/state', async (route) => {
      const req = route.request();
      if (req.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ state }),
        });
        return;
      }

      if (req.method() === 'PUT') {
        const patch = req.postDataJSON() as Record<string, unknown>;
        state = {
          ...state,
          profile: {
            ...state.profile,
            ...(patch.goal !== undefined ? { goal: patch.goal as FastLaneState['profile']['goal'] } : {}),
            ...(patch.experience !== undefined
              ? { experience: patch.experience as FastLaneState['profile']['experience'] }
              : {}),
            ...(patch.protocolId !== undefined ? { protocolId: patch.protocolId as string } : {}),
            ...(patch.wakeTime !== undefined ? { wakeTime: patch.wakeTime as string } : {}),
            ...(patch.sleepTime !== undefined ? { sleepTime: patch.sleepTime as string } : {}),
            ...(patch.reminders !== undefined ? { reminders: Boolean(patch.reminders) } : {}),
          },
          ...(patch.onboarded !== undefined ? { onboarded: Boolean(patch.onboarded) } : {}),
        };

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ state }),
        });
      }
    });

    await gotoWithTransient404Retry(page, '/fastlane/app');
    await page.getByRole('button', { name: /^continue$/i }).click();
    await page.getByRole('button', { name: /^continue$/i }).click();
    await page.getByRole('button', { name: /enter fastlane/i }).click();
    await expect(page.getByText(/fastlane dashboard/i)).toBeVisible();

    await expect.poll(() => analyticsEvents.length).toBeGreaterThan(0);
    expect(analyticsEvents.some((event) => event.name === 'signup_started')).toBeTruthy();
    expect(analyticsEvents.some((event) => event.name === 'onboarding_completed')).toBeTruthy();
    expect(
      analyticsEvents.some(
        (event) => event.name === 'paywall_viewed' && event.props?.context === 'post_onboarding',
      ),
    ).toBeTruthy();
  });

  test('account panel links email and manages account session token flow', async ({ page }) => {
    const state: FastLaneState = {
      ...baseState,
      onboarded: true,
      flags: {
        firstFastStartedTracked: true,
        firstFastCompletedTracked: false,
        postOnboardingPaywallSeen: true,
      },
    };

    let linkedEmail: string | null = null;
    let authenticated = false;
    const devToken = 'dev-login-token-123';

    await page.route('**/api/fastlane/state', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ state }),
      });
    });

    await page.route('**/api/fastlane/auth/link', async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ linked: Boolean(linkedEmail), email: linkedEmail }),
        });
        return;
      }

      if (method === 'POST') {
        const body = route.request().postDataJSON() as { email?: string };
        linkedEmail = (body.email ?? '').trim().toLowerCase();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, linked: true, email: linkedEmail }),
        });
        return;
      }

      await route.fallback();
    });

    await page.route('**/api/fastlane/auth/session/request', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, devLoginToken: devToken, expiresInSeconds: 600 }),
      });
    });

    await page.route('**/api/fastlane/auth/session/verify', async (route) => {
      const body = route.request().postDataJSON() as { token?: string };
      if (body.token === devToken) {
        authenticated = true;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          authenticated,
          userId: 'user_1',
          email: linkedEmail ?? 'user@example.com',
        }),
      });
    });

    await page.route('**/api/fastlane/auth/session', async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            authenticated
              ? { authenticated: true, userId: 'user_1', email: linkedEmail ?? 'user@example.com' }
              : { authenticated: false },
          ),
        });
        return;
      }

      if (method === 'DELETE') {
        authenticated = false;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
        return;
      }

      await route.fallback();
    });

    await gotoWithTransient404Retry(page, '/fastlane/app');
    await expect(page.getByRole('heading', { name: /account/i })).toBeVisible();

    await page.getByLabel(/account email/i).fill('User@Example.com');
    await page.getByRole('button', { name: /link account email/i }).click();
    await expect(page.locator('body')).toContainText(/Linked email:\s*user@example.com/i);

    await page.getByRole('button', { name: /request sign-in token/i }).click();
    await expect(page.getByLabel(/sign-in token/i)).toHaveValue(devToken);

    await page.getByRole('button', { name: /verify token/i }).click();
    await expect(page.locator('body')).toContainText(/Session:\s*Active/i);

    await page.getByRole('button', { name: /sign out account/i }).click();
    await expect(page.locator('body')).toContainText(/Session:\s*Guest only/i);
  });

  test('auto-verifies login_token query param on app load and clears url token', async ({ page }) => {
    const state: FastLaneState = {
      ...baseState,
      onboarded: true,
      flags: {
        firstFastStartedTracked: true,
        firstFastCompletedTracked: false,
        postOnboardingPaywallSeen: true,
      },
    };

    const loginToken = 'auto-login-token-xyz';
    let verified = false;

    await page.route('**/api/fastlane/state', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ state }),
      });
    });

    await page.route('**/api/fastlane/auth/link', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ linked: true, email: 'user@example.com' }),
      });
    });

    await page.route('**/api/fastlane/auth/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ authenticated: false }),
      });
    });

    await page.route('**/api/fastlane/auth/session/verify', async (route) => {
      const body = route.request().postDataJSON() as { token?: string };
      verified = body.token === loginToken;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          authenticated: true,
          userId: 'user_1',
          email: 'user@example.com',
        }),
      });
    });

    await gotoWithTransient404Retry(page, `/fastlane/app?login_token=${encodeURIComponent(loginToken)}`);

    await expect.poll(() => verified).toBeTruthy();
    await expect(page.locator('body')).toContainText(/Session:\s*Active/i);
    await expect(page.locator('body')).toContainText(/Signed in from magic link\./i);
    await expect(page).toHaveURL(/\/fastlane\/app$/);
  });
});

test.describe('FastLane Admin', () => {
  test('overview renders command center and primary links', async ({ page }) => {
    await gotoWithTransient404Retry(page, '/admin/fastlane');

    await expect(page.getByRole('heading', { name: /fastlane operations command center/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /live operations snapshot/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /open readiness/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /open kpi dashboard/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /open recovery console/i })).toBeVisible();
  });

  test('admin routes are reachable and nav links point to each destination', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: /fastlane admin navigation/i });
    const overviewLink = nav.getByRole('link', { name: 'Overview', exact: true });
    const webhooksLink = nav.getByRole('link', { name: 'Webhook Recovery', exact: true });
    const kpiLink = nav.getByRole('link', { name: 'KPI Dashboard', exact: true });
    const readinessLink = nav.getByRole('link', { name: 'Readiness', exact: true });

    await gotoWithTransient404Retry(page, '/admin/fastlane/webhooks');
    await expect(page.getByRole('heading', { name: /fastlane webhook recovery console/i })).toBeVisible();
    await expect(overviewLink).toHaveAttribute('href', '/admin/fastlane');
    await expect(webhooksLink).toHaveAttribute('href', '/admin/fastlane/webhooks');
    await expect(kpiLink).toHaveAttribute('href', '/admin/fastlane/kpi');
    await expect(readinessLink).toHaveAttribute('href', '/admin/fastlane/readiness');
    await expect(webhooksLink).toHaveAttribute('aria-current', 'page');

    await gotoWithTransient404Retry(page, '/admin/fastlane/kpi');
    await expect(page.getByRole('heading', { name: /fastlane kpi dashboard/i })).toBeVisible();
    await expect(kpiLink).toHaveAttribute('aria-current', 'page');

    await gotoWithTransient404Retry(page, '/admin/fastlane/readiness');
    await expect(page.getByRole('heading', { name: /fastlane readiness console/i })).toBeVisible();
    await expect(readinessLink).toHaveAttribute('aria-current', 'page');

    await gotoWithTransient404Retry(page, '/admin/fastlane');
    await expect(page.getByRole('heading', { name: /fastlane operations command center/i })).toBeVisible();
    await expect(overviewLink).toHaveAttribute('aria-current', 'page');
  });

  test('overview snapshot can authenticate and load live metrics', async ({ page }) => {
    let authenticated = false;
    const overviewDays: number[] = [];

    await page.route('**/api/admin/fastlane/auth', async (route) => {
      const method = route.request().method();

      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ authenticated }),
        });
        return;
      }

      if (method === 'POST') {
        authenticated = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
        return;
      }

      if (method === 'DELETE') {
        authenticated = false;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
        return;
      }

      await route.fallback();
    });

    await page.route('**/api/admin/fastlane/overview?days=*', async (route) => {
      const url = new URL(route.request().url());
      const days = Number(url.searchParams.get('days') ?? '7');
      overviewDays.push(days);
      const nowIso = new Date().toISOString();
      const successIso = new Date(Date.now() - (48 * 60 * 60 * 1000)).toISOString();
      const failureIso = new Date(Date.now() - (72 * 60 * 60 * 1000)).toISOString();
      const maintenanceHealth = days === 30 ? 'warning' : 'healthy';
      const maintenanceRouteSummary =
        days === 30
          ? {
              replay: { successCount: 4, failureCount: 1 },
              throttle: { successCount: 5, failureCount: 2 },
              run: { successCount: 3, failureCount: 0 },
              worstFailureRoute: 'throttle',
            }
          : {
              replay: { successCount: 4, failureCount: 0 },
              throttle: { successCount: 5, failureCount: 0 },
              run: { successCount: 3, failureCount: 0 },
              worstFailureRoute: null,
            };

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          timestamp: nowIso,
          readiness: {
            status: 'ready',
            failedWebhookEvents: 0,
            maintenanceActionSuccessCount: 12,
            maintenanceActionFailureCount: 1,
            lastMaintenanceSuccessAt: successIso,
            lastMaintenanceFailureAt: failureIso,
            lastMaintenanceTelemetryAt: successIso,
            maintenanceHealth,
            maintenanceRouteSummary,
            sourceTimestamp: nowIso,
          },
          kpi: {
            windowDays: days,
            paywallToTrialRate: 24.2,
            trialStarted: 19,
            onboardingCompleted: 44,
          },
        }),
      });
    });

    await gotoWithTransient404Retry(page, '/admin/fastlane');

    await page.getByLabel(/admin token \(cron_secret\)/i).fill('test-secret');
    await page.getByRole('button', { name: /^login$/i }).click();
    await expect(page.getByText(/session auth is active/i)).toBeVisible();

    await page.getByRole('button', { name: /refresh snapshot/i }).click();
    await page.getByLabel(/kpi window \(days\)/i).selectOption('30');
    await page.getByRole('button', { name: /refresh snapshot/i }).click();

    await expect.poll(() => overviewDays.includes(30)).toBeTruthy();
    await expect(page.getByText('READY')).toBeVisible();
    await expect(page.getByText('24.2%')).toBeVisible();
    const trialMetric = page.locator('article').filter({ hasText: /trial starts \(30d\)/i });
    const onboardingMetric = page.locator('article').filter({ hasText: /onboarding completions \(30d\)/i });
    const maintenanceHealthMetric = page.locator('article').filter({ hasText: /last maintenance health/i });
    const routeFailuresMetric = page.locator('article').filter({ hasText: /route failures \(r\/t\/u\)/i });
    const worstRouteMetric = page.locator('article').filter({ hasText: /worst failure route/i });
    const telemetryUpdateMetric = page.locator('article').filter({ hasText: /last telemetry update/i });
    const maintenanceCountMetric = page.locator('article').filter({ hasText: /maintenance actions \(s\/f\)/i });
    const maintenanceLastRunMetric = page.locator('article').filter({ hasText: /last maintenance \(s\/f\)/i });
    await expect(trialMetric.getByText(/^19$/)).toBeVisible();
    await expect(onboardingMetric.getByText(/^44$/)).toBeVisible();
    await expect(maintenanceHealthMetric.getByText(/^WARNING$/)).toBeVisible();
    await expect(routeFailuresMetric.getByText(/^1\/2\/0$/)).toBeVisible();
    await expect(worstRouteMetric.getByText(/^THROTTLE$/)).toBeVisible();
    await expect(telemetryUpdateMetric).not.toContainText(/n\/a/i);
    await expect(telemetryUpdateMetric).toContainText(/freshness:\s*stale/i);
    await expect(page.getByText(/next action: run throttle cleanup dry-run/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /open readiness actions/i })).toHaveAttribute(
      'href',
      '/admin/fastlane/readiness',
    );
    await expect(maintenanceCountMetric.getByText(/^12\/1$/)).toBeVisible();
    await expect(maintenanceLastRunMetric).toContainText('/');
    await expect(maintenanceLastRunMetric).not.toContainText(/n\/a/i);
    await expect(page.getByText(/maintenance health changed: healthy -> warning/i)).toBeVisible();
    await expect(page.getByText(/health legend:/i)).toBeVisible();
    await expect(page.getByText(/data age:/i)).toBeVisible();
    await expect(page.getByText(/last refreshed:/i)).toBeVisible();

    await gotoWithTransient404Retry(page, '/admin/fastlane');
    await expect(page.getByLabel(/kpi window \(days\)/i)).toHaveValue('30');
  });

  test('readiness console runs auth throttle cleanup with configured retention', async ({ page }) => {
    let authenticated = false;
    const throttleCleanupCalls: Array<{ dryRun?: boolean; limit?: number; retentionDays?: number }> = [];

    await page.route('**/api/admin/fastlane/auth', async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ authenticated }),
        });
        return;
      }
      if (method === 'POST') {
        authenticated = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
        return;
      }
      if (method === 'DELETE') {
        authenticated = false;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
        return;
      }
      await route.fallback();
    });

    await page.route('**/api/admin/fastlane/readiness', async (route) => {
      const replayLastIso = new Date(Date.now() - (48 * 60 * 60 * 1000)).toISOString();
      const throttleLastIso = new Date(Date.now() - (3 * 60 * 1000)).toISOString();
      const runLastIso = new Date(Date.now() - (70 * 60 * 1000)).toISOString();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ready',
          timestamp: new Date().toISOString(),
          readiness: {
            databaseConfigured: true,
            authConfigured: true,
            authEmailConfigured: true,
            billingConfigured: true,
            monitoring: {
              sentryServerDsnConfigured: true,
              sentryClientDsnConfigured: true,
              alertsRoutingConfigured: true,
              readyForProduction: true,
            },
            readyForProduction: true,
          },
          operations: {
            failedWebhookEvents: 0,
            linkedAccounts: 9,
            activeLoginReplayMarkers: 2,
            expiredLoginReplayMarkers: 1,
            billingAtRiskSubscriptions: 0,
            scheduledCancellations: 3,
            oldestFailedWebhookAgeMinutes: 0,
            authThrottleActiveRows: 8,
            authThrottleStaleRows: 2,
            maintenanceActionSuccessCount: 12,
            maintenanceActionFailureCount: 1,
            lastMaintenanceSuccessAt: '2026-02-25T08:00:00.000Z',
            lastMaintenanceFailureAt: '2026-02-24T21:15:00.000Z',
            maintenanceReplaySuccessCount: 4,
            maintenanceReplayFailureCount: 1,
            maintenanceReplayLastEventAt: replayLastIso,
            maintenanceThrottleSuccessCount: 5,
            maintenanceThrottleFailureCount: 0,
            maintenanceThrottleLastEventAt: throttleLastIso,
            maintenanceRunSuccessCount: 3,
            maintenanceRunFailureCount: 0,
            maintenanceRunLastEventAt: runLastIso,
          },
        }),
      });
    });

    await page.route('**/api/admin/fastlane/maintenance/auth-request-throttle', async (route) => {
      const payload = route.request().postDataJSON() as {
        dryRun?: boolean;
        limit?: number;
        retentionDays?: number;
      };
      throttleCleanupCalls.push(payload);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          dryRun: payload.dryRun === true,
          scanned: payload.dryRun ? 5 : 5,
          deleted: payload.dryRun ? 0 : 4,
          retentionDays: payload.retentionDays ?? 30,
        }),
      });
    });

    await gotoWithTransient404Retry(page, '/admin/fastlane/readiness');

    await page.getByLabel(/admin token \(cron_secret\)/i).fill('test-secret');
    await page.getByRole('button', { name: /^login$/i }).click();
    await expect(page.getByText(/session auth is active/i)).toBeVisible();

    await page.getByRole('button', { name: /refresh readiness/i }).click();
    await expect(page.locator('body')).toContainText(/auth throttle rows \(active\/stale\)/i);
    await expect(page.locator('body')).toContainText('8/2');
    await expect(page.locator('body')).toContainText(/maintenance route telemetry/i);
    await expect(page.locator('body')).toContainText(/freshness legend: fresh <60m, stale (>=|≥)60m or unknown/i);
    await expect(page.locator('body')).toContainText(/preferences status:\s*default/i);
    await expect(page.locator('body')).toContainText(/reset restores default route ordering and clears this page session preference/i);
    await expect(page.locator('body')).toContainText(/rate-limited to one update every 0\.75 seconds/i);
    const routeTelemetryCard = page.locator('section').filter({ hasText: /maintenance route telemetry/i });
    const routeRows = routeTelemetryCard.locator('tbody tr');
    await expect(routeRows.nth(1)).toContainText(/throttle cleanup/i);
    await page.getByLabel(/stale first ordering/i).check();
    await expect(page.locator('body')).toContainText(/preferences updated:/i);
    await expect(page.locator('body')).toContainText(/action:\s*toggle/i);
    await expect(page.getByRole('status').filter({ hasText: /preferences updated:/i })).toHaveAttribute(
      'aria-live',
      'polite',
    );
    await expect(page.locator('body')).toContainText(/preferences status:\s*customized/i);
    await expect(routeRows.nth(1)).toContainText(/unified run/i);
    await page.getByRole('button', { name: /reset telemetry preferences/i }).click();
    await expect(page.getByLabel(/stale first ordering/i)).not.toBeChecked();
    await expect(page.locator('body')).toContainText(/action:\s*reset/i);
    await expect(page.locator('body')).toContainText(/preferences status:\s*default/i);
    await expect(routeRows.nth(1)).toContainText(/throttle cleanup/i);
    await gotoWithTransient404Retry(page, '/admin/fastlane');
    await gotoWithTransient404Retry(page, '/admin/fastlane/readiness');
    await page.getByRole('button', { name: /refresh readiness/i }).click();
    await expect(page.getByLabel(/stale first ordering/i)).not.toBeChecked();
    const routeRowsAfterNav = page
      .locator('section')
      .filter({ hasText: /maintenance route telemetry/i })
      .locator('tbody tr');
    await expect(routeRowsAfterNav.nth(1)).toContainText(/throttle cleanup/i);
    const replayRouteRow = page.locator('tr').filter({ hasText: /replay cleanup/i });
    const throttleRouteRow = page.locator('tr').filter({ hasText: /throttle cleanup/i });
    const runRouteRow = page.locator('tr').filter({ hasText: /unified run/i });
    await expect(replayRouteRow).toContainText('4');
    await expect(replayRouteRow).toContainText('1');
    await expect(replayRouteRow).toContainText(/stale/i);
    await expect(throttleRouteRow).toContainText(/<5m|[0-9]+m/i);
    await expect(runRouteRow).toContainText(/1h/i);

    await page.getByLabel(/throttle retention days/i).fill('45');
    await page.getByRole('button', { name: /throttle cleanup dry-run/i }).click();
    await page.getByRole('button', { name: /purge stale throttle rows/i }).click();

    await expect.poll(() => throttleCleanupCalls.length).toBeGreaterThanOrEqual(2);
    expect(throttleCleanupCalls[0]).toMatchObject({ dryRun: true, limit: 1000, retentionDays: 45 });
    expect(throttleCleanupCalls[1]).toMatchObject({ dryRun: false, limit: 1000, retentionDays: 45 });
    await expect(page.locator('body')).toContainText(/retention 45d/i);
  });

  test('readiness console runs replay cleanup actions', async ({ page }) => {
    let authenticated = false;
    const replayCleanupCalls: Array<{ dryRun?: boolean; limit?: number }> = [];

    await page.route('**/api/admin/fastlane/auth', async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ authenticated }),
        });
        return;
      }
      if (method === 'POST') {
        authenticated = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
        return;
      }
      await route.fallback();
    });

    await page.route('**/api/admin/fastlane/readiness', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ready',
          timestamp: new Date().toISOString(),
          readiness: {
            databaseConfigured: true,
            authConfigured: true,
            authEmailConfigured: true,
            billingConfigured: true,
            monitoring: {
              sentryServerDsnConfigured: true,
              sentryClientDsnConfigured: true,
              alertsRoutingConfigured: true,
              readyForProduction: true,
            },
            readyForProduction: true,
          },
          operations: {
            failedWebhookEvents: 0,
            linkedAccounts: 6,
            activeLoginReplayMarkers: 3,
            expiredLoginReplayMarkers: 2,
            billingAtRiskSubscriptions: 0,
            scheduledCancellations: 1,
            oldestFailedWebhookAgeMinutes: 0,
            authThrottleActiveRows: 4,
            authThrottleStaleRows: 0,
            maintenanceActionSuccessCount: 7,
            maintenanceActionFailureCount: 2,
            lastMaintenanceSuccessAt: '2026-02-25T08:00:00.000Z',
            lastMaintenanceFailureAt: '2026-02-24T21:15:00.000Z',
            maintenanceReplaySuccessCount: 2,
            maintenanceReplayFailureCount: 1,
            maintenanceReplayLastEventAt: null,
            maintenanceThrottleSuccessCount: 1,
            maintenanceThrottleFailureCount: 1,
            maintenanceThrottleLastEventAt: null,
            maintenanceRunSuccessCount: 4,
            maintenanceRunFailureCount: 0,
            maintenanceRunLastEventAt: null,
          },
        }),
      });
    });

    await page.route('**/api/admin/fastlane/maintenance/auth-replay', async (route) => {
      const payload = route.request().postDataJSON() as { dryRun?: boolean; limit?: number };
      replayCleanupCalls.push(payload);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          dryRun: payload.dryRun === true,
          scanned: payload.dryRun ? 7 : 7,
          deleted: payload.dryRun ? 0 : 5,
        }),
      });
    });

    await gotoWithTransient404Retry(page, '/admin/fastlane/readiness');

    await page.getByLabel(/admin token \(cron_secret\)/i).fill('test-secret');
    await page.getByRole('button', { name: /^login$/i }).click();
    await page.getByRole('button', { name: /refresh readiness/i }).click();

    await expect(page.locator('body')).toContainText(/login replay markers \(active\/expired\)/i);
    await expect(page.locator('body')).toContainText('3/2');

    await page.getByRole('button', { name: /replay cleanup dry-run/i }).click();
    await page.getByRole('button', { name: /purge expired replay markers/i }).click();

    await expect.poll(() => replayCleanupCalls.length).toBeGreaterThanOrEqual(2);
    expect(replayCleanupCalls[0]).toMatchObject({ dryRun: true, limit: 1000 });
    expect(replayCleanupCalls[1]).toMatchObject({ dryRun: false, limit: 1000 });
    await expect(page.locator('body')).toContainText(/cleanup: scanned 7, deleted 5/i);
  });

  test('readiness console runs unified maintenance actions', async ({ page }) => {
    let authenticated = false;
    const maintenanceRunCalls: Array<{
      dryRun?: boolean;
      replayLimit?: number;
      throttleLimit?: number;
      throttleRetentionDays?: number;
    }> = [];

    await page.route('**/api/admin/fastlane/auth', async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ authenticated }),
        });
        return;
      }
      if (method === 'POST') {
        authenticated = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
        return;
      }
      await route.fallback();
    });

    await page.route('**/api/admin/fastlane/readiness', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ready',
          timestamp: new Date().toISOString(),
          readiness: {
            databaseConfigured: true,
            authConfigured: true,
            authEmailConfigured: true,
            billingConfigured: true,
            monitoring: {
              sentryServerDsnConfigured: true,
              sentryClientDsnConfigured: true,
              alertsRoutingConfigured: true,
              readyForProduction: true,
            },
            readyForProduction: true,
          },
          operations: {
            failedWebhookEvents: 0,
            linkedAccounts: 4,
            activeLoginReplayMarkers: 1,
            expiredLoginReplayMarkers: 0,
            billingAtRiskSubscriptions: 0,
            scheduledCancellations: 2,
            oldestFailedWebhookAgeMinutes: 0,
            authThrottleActiveRows: 5,
            authThrottleStaleRows: 1,
            maintenanceActionSuccessCount: 6,
            maintenanceActionFailureCount: 1,
            lastMaintenanceSuccessAt: '2026-02-25T08:00:00.000Z',
            lastMaintenanceFailureAt: '2026-02-24T21:15:00.000Z',
            maintenanceReplaySuccessCount: 2,
            maintenanceReplayFailureCount: 0,
            maintenanceReplayLastEventAt: null,
            maintenanceThrottleSuccessCount: 2,
            maintenanceThrottleFailureCount: 1,
            maintenanceThrottleLastEventAt: null,
            maintenanceRunSuccessCount: 2,
            maintenanceRunFailureCount: 0,
            maintenanceRunLastEventAt: null,
          },
        }),
      });
    });

    await page.route('**/api/admin/fastlane/maintenance/run', async (route) => {
      const payload = route.request().postDataJSON() as {
        dryRun?: boolean;
        replayLimit?: number;
        throttleLimit?: number;
        throttleRetentionDays?: number;
      };
      maintenanceRunCalls.push(payload);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          dryRun: payload.dryRun === true,
          maintenance: {
            replay: { scanned: 6, deleted: payload.dryRun ? 0 : 4 },
            throttle: { scanned: 3, deleted: payload.dryRun ? 0 : 2 },
          },
        }),
      });
    });

    await gotoWithTransient404Retry(page, '/admin/fastlane/readiness');

    await page.getByLabel(/admin token \(cron_secret\)/i).fill('test-secret');
    await page.getByRole('button', { name: /^login$/i }).click();
    await page.getByLabel(/throttle retention days/i).fill('60');

    await page.getByRole('button', { name: /run all maintenance dry-run/i }).click();
    await page.getByRole('button', { name: /run all maintenance now/i }).click();

    await expect.poll(() => maintenanceRunCalls.length).toBeGreaterThanOrEqual(2);
    expect(maintenanceRunCalls[0]).toMatchObject({
      dryRun: true,
      replayLimit: 1000,
      throttleLimit: 1000,
      throttleRetentionDays: 60,
    });
    expect(maintenanceRunCalls[1]).toMatchObject({
      dryRun: false,
      replayLimit: 1000,
      throttleLimit: 1000,
      throttleRetentionDays: 60,
    });
    await expect(page.locator('body')).toContainText(/all maintenance cleanup: replay 6\/4, throttle 3\/2, retention 60d/i);
  });
});
