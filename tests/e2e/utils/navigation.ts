import type { Page } from '@playwright/test';

export interface Transient404RetryOptions {
  maxAttempts?: number;
  retryDelayMs?: number;
}

export async function gotoWithTransient404Retry(
  page: Page,
  path: string,
  options: Transient404RetryOptions = {},
) {
  const maxAttempts = options.maxAttempts ?? 12;
  const retryDelayMs = options.retryDelayMs ?? 1000;

  let lastBodyText = '';

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await page.goto(path, { waitUntil: 'load' });
    const bodyText = (await page.locator('body').innerText()).toLowerCase();
    lastBodyText = bodyText;
    if (!bodyText.includes('this page could not be found')) {
      return;
    }
    await page.waitForTimeout(retryDelayMs);
  }

  throw new Error(
    `Route "${path}" continued returning transient 404 after ${maxAttempts} attempts. Last body snippet: ${lastBodyText.slice(0, 180)}`,
  );
}
