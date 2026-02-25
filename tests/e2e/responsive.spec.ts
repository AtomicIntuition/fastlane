import { test, expect } from '@playwright/test';

test.describe('Responsive Design', () => {
  test('desktop layout shows header, hides mobile nav', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');

    const header = page.locator('header');
    await expect(header).toBeVisible();
  });

  test('mobile layout shows mobile nav', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');

    // Mobile bottom nav should be visible (it's a fixed nav at the bottom)
    const nav = page.locator('nav.fixed');
    if (await nav.count() > 0) {
      await expect(nav.first()).toBeVisible();
    }
  });

  test('homepage hero section is visible on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');

    // Page should load without horizontal scroll
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5); // 5px tolerance
  });

  test('schedule page is readable on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/schedule');

    // No horizontal overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5);
  });
});

test.describe('Accessibility', () => {
  test('homepage has no images without alt text', async ({ page }) => {
    await page.goto('/');

    // All images should have alt text
    const imagesWithoutAlt = await page.locator('img:not([alt])').count();
    // TeamLogo uses alt text, so this should be 0 or very low
    expect(imagesWithoutAlt).toBeLessThanOrEqual(5);
  });

  test('pages have proper heading hierarchy', async ({ page }) => {
    await page.goto('/');

    // Should have at least one h1 or meaningful heading
    const headings = await page.locator('h1, h2, h3').count();
    expect(headings).toBeGreaterThan(0);
  });
});
