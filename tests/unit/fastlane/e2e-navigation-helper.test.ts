import { describe, expect, it, vi } from 'vitest';
import { gotoWithTransient404Retry } from '../../e2e/utils/navigation';

interface FakePage {
  goto: ReturnType<typeof vi.fn>;
  locator: ReturnType<typeof vi.fn>;
  waitForTimeout: ReturnType<typeof vi.fn>;
}

function createFakePage(innerTexts: string[]): FakePage {
  let readIndex = 0;

  const innerText = vi.fn(async () => {
    const value = innerTexts[Math.min(readIndex, innerTexts.length - 1)] ?? '';
    readIndex += 1;
    return value;
  });

  const locator = vi.fn(() => ({
    innerText,
  }));

  return {
    goto: vi.fn(async () => undefined),
    locator,
    waitForTimeout: vi.fn(async () => undefined),
  };
}

describe('gotoWithTransient404Retry', () => {
  it('retries transient 404 and succeeds once page content recovers', async () => {
    const page = createFakePage([
      '404 This page could not be found.',
      '404 This page could not be found.',
      'FastLane dashboard loaded',
    ]);

    await gotoWithTransient404Retry(page as unknown as Parameters<typeof gotoWithTransient404Retry>[0], '/fastlane/app', {
      maxAttempts: 5,
      retryDelayMs: 10,
    });

    expect(page.goto).toHaveBeenCalledTimes(3);
    expect(page.waitForTimeout).toHaveBeenCalledTimes(2);
  });

  it('throws route-specific error after exhausting retries', async () => {
    const page = createFakePage([
      '404 This page could not be found.',
      '404 This page could not be found.',
      '404 This page could not be found.',
    ]);

    await expect(
      gotoWithTransient404Retry(page as unknown as Parameters<typeof gotoWithTransient404Retry>[0], '/admin/fastlane', {
        maxAttempts: 3,
        retryDelayMs: 5,
      }),
    ).rejects.toThrow(/Route "\/admin\/fastlane" continued returning transient 404 after 3 attempts/i);

    expect(page.goto).toHaveBeenCalledTimes(3);
    expect(page.waitForTimeout).toHaveBeenCalledTimes(3);
  });
});
