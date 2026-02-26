import { expect, test, type Page } from '@playwright/test';
import type { FastLaneState } from '@/lib/fastlane/types';
import { gotoWithTransient404Retry } from './utils/navigation';

async function runA11yAudit(page: Page) {
  return page.evaluate(() => {
    const missingControlLabels: string[] = [];
    const unlabeledInteractive: string[] = [];
    const duplicateIds: string[] = [];

    const idCounts = new Map<string, number>();
    for (const element of Array.from(document.querySelectorAll('[id]'))) {
      const id = element.getAttribute('id');
      if (!id) continue;
      idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
    }

    for (const [id, count] of idCounts.entries()) {
      if (count > 1) duplicateIds.push(id);
    }

    const controls = Array.from(document.querySelectorAll('input, select, textarea')) as Array<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >;

    for (const control of controls) {
      if (control instanceof HTMLInputElement && control.type === 'hidden') continue;

      const id = control.id;
      const ariaLabel = control.getAttribute('aria-label')?.trim();
      const ariaLabelledBy = control.getAttribute('aria-labelledby')?.trim();

      let hasProgrammaticLabel = false;
      if (ariaLabel) hasProgrammaticLabel = true;

      if (!hasProgrammaticLabel && ariaLabelledBy) {
        const refIds = ariaLabelledBy.split(/\s+/g).filter(Boolean);
        hasProgrammaticLabel = refIds.some((refId) => {
          const ref = document.getElementById(refId);
          return !!ref?.textContent?.trim();
        });
      }

      const wrappedByLabel = !!control.closest('label');
      const explicitLabel = !!(id && document.querySelector(`label[for="${id}"]`));

      if (!hasProgrammaticLabel && !wrappedByLabel && !explicitLabel) {
        missingControlLabels.push(control.tagName.toLowerCase() + (id ? `#${id}` : ''));
      }
    }

    const interactive = Array.from(document.querySelectorAll('button, a[href], [role="button"], [role="link"]')) as HTMLElement[];
    for (const node of interactive) {
      const ariaLabel = node.getAttribute('aria-label')?.trim() ?? '';
      const ariaLabelledBy = node.getAttribute('aria-labelledby')?.trim() ?? '';
      const text = node.textContent?.trim() ?? '';

      let hasAccessibleName = text.length > 0 || ariaLabel.length > 0;
      if (!hasAccessibleName && ariaLabelledBy.length > 0) {
        const refIds = ariaLabelledBy.split(/\s+/g).filter(Boolean);
        hasAccessibleName = refIds.some((refId) => {
          const ref = document.getElementById(refId);
          return !!ref?.textContent?.trim();
        });
      }

      if (!hasAccessibleName) {
        unlabeledInteractive.push(node.tagName.toLowerCase());
      }
    }

    return {
      missingControlLabels,
      unlabeledInteractive,
      duplicateIds,
      mainCount: document.querySelectorAll('main').length,
      h1Count: document.querySelectorAll('h1').length,
    };
  });
}

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

test.describe('FastLane Accessibility', () => {
  test('landing page passes semantic accessibility checks', async ({ page }) => {
    await gotoWithTransient404Retry(page, '/fastlane');

    const report = await runA11yAudit(page);

    expect(report.mainCount).toBeGreaterThan(0);
    expect(report.h1Count).toBe(1);
    expect(report.missingControlLabels).toEqual([]);
    expect(report.unlabeledInteractive).toEqual([]);
    expect(report.duplicateIds).toEqual([]);
  });

  test('app onboarding and dashboard pass semantic accessibility checks', async ({ page }) => {
    let state = { ...baseState };

    await page.route('**/api/fastlane/auth/guest', async (route) => {
      if (route.request().method() === 'DELETE') {
        state = { ...baseState };
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
        body: JSON.stringify({ userId: 'a11y-user' }),
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
          onboarded: patch.onboarded !== undefined ? Boolean(patch.onboarded) : state.onboarded,
          profile: {
            ...state.profile,
            ...(patch.goal !== undefined ? { goal: patch.goal as FastLaneState['profile']['goal'] } : {}),
            ...(patch.experience !== undefined ? { experience: patch.experience as FastLaneState['profile']['experience'] } : {}),
            ...(patch.protocolId !== undefined ? { protocolId: patch.protocolId as string } : {}),
            ...(patch.wakeTime !== undefined ? { wakeTime: patch.wakeTime as string } : {}),
            ...(patch.sleepTime !== undefined ? { sleepTime: patch.sleepTime as string } : {}),
            ...(patch.reminders !== undefined ? { reminders: Boolean(patch.reminders) } : {}),
          },
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

    const onboardingReport = await runA11yAudit(page);
    expect(onboardingReport.mainCount).toBe(0); // app shell intentionally section-based
    expect(onboardingReport.h1Count).toBe(1);
    expect(onboardingReport.missingControlLabels).toEqual([]);
    expect(onboardingReport.unlabeledInteractive).toEqual([]);
    expect(onboardingReport.duplicateIds).toEqual([]);

    await page.getByRole('button', { name: /^continue$/i }).click();
    await page.getByRole('button', { name: /^continue$/i }).click();
    await page.getByRole('button', { name: /enter fastlane/i }).click();

    await expect(page.getByText(/fastlane dashboard/i)).toBeVisible();
    await page.getByRole('button', { name: /not now/i }).click();

    const dashboardReport = await runA11yAudit(page);
    expect(dashboardReport.h1Count).toBeGreaterThanOrEqual(1);
    expect(dashboardReport.missingControlLabels).toEqual([]);
    expect(dashboardReport.unlabeledInteractive).toEqual([]);
    expect(dashboardReport.duplicateIds).toEqual([]);
  });

  test('admin overview passes semantic accessibility checks', async ({ page }) => {
    await gotoWithTransient404Retry(page, '/admin/fastlane');
    await expect(page.getByRole('heading', { name: /fastlane operations command center/i })).toBeVisible();

    const report = await runA11yAudit(page);
    expect(report.mainCount).toBeGreaterThan(0);
    expect(report.h1Count).toBe(1);
    expect(report.missingControlLabels).toEqual([]);
    expect(report.unlabeledInteractive).toEqual([]);
    expect(report.duplicateIds).toEqual([]);
  });

  test('admin consoles pass semantic accessibility checks', async ({ page }) => {
    const routes = [
      { path: '/admin/fastlane/webhooks', heading: /fastlane webhook recovery console/i },
      { path: '/admin/fastlane/kpi', heading: /fastlane kpi dashboard/i },
      { path: '/admin/fastlane/readiness', heading: /fastlane readiness console/i },
    ];

    for (const route of routes) {
      await gotoWithTransient404Retry(page, route.path);
      await expect(page.getByRole('heading', { name: route.heading })).toBeVisible();

      const report = await runA11yAudit(page);
      expect(report.mainCount).toBeGreaterThan(0);
      expect(report.h1Count).toBe(1);
      expect(report.missingControlLabels).toEqual([]);
      expect(report.unlabeledInteractive).toEqual([]);
      expect(report.duplicateIds).toEqual([]);
    }
  });
});
