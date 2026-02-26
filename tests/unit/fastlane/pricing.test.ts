import { afterEach, describe, expect, it } from 'vitest';
import {
  FASTLANE_PLANS,
  formatUsd,
  getFastLanePlanConfig,
  getFastLanePlanFromStripePriceId,
  getFastLaneStripePriceId,
  isFastLanePlan,
} from '@/lib/fastlane/pricing';

describe('FastLane pricing', () => {
  const env = process.env as Record<string, string | undefined>;
  const initialMonthly = env.STRIPE_PRICE_MONTHLY;
  const initialYearly = env.STRIPE_PRICE_YEARLY;

  afterEach(() => {
    env.STRIPE_PRICE_MONTHLY = initialMonthly;
    env.STRIPE_PRICE_YEARLY = initialYearly;
  });

  it('defines monthly and yearly plans', () => {
    expect(FASTLANE_PLANS.map((p) => p.id)).toEqual(['monthly', 'yearly']);
    expect(getFastLanePlanConfig('monthly').billedUsd).toBe(9.99);
    expect(getFastLanePlanConfig('yearly').billedUsd).toBe(59.99);
  });

  it('validates plan ids', () => {
    expect(isFastLanePlan('monthly')).toBe(true);
    expect(isFastLanePlan('yearly')).toBe(true);
    expect(isFastLanePlan('weekly')).toBe(false);
    expect(isFastLanePlan(null)).toBe(false);
  });

  it('formats usd values', () => {
    expect(formatUsd(9.99)).toBe('$9.99');
    expect(formatUsd(59.9)).toBe('$59.90');
  });

  it('resolves stripe price ids from env', () => {
    process.env.STRIPE_PRICE_MONTHLY = 'price_monthly';
    process.env.STRIPE_PRICE_YEARLY = 'price_yearly';

    expect(getFastLaneStripePriceId('monthly')).toBe('price_monthly');
    expect(getFastLaneStripePriceId('yearly')).toBe('price_yearly');
  });

  it('maps stripe price id back to plan', () => {
    process.env.STRIPE_PRICE_MONTHLY = 'price_monthly';
    process.env.STRIPE_PRICE_YEARLY = 'price_yearly';

    expect(getFastLanePlanFromStripePriceId('price_monthly')).toBe('monthly');
    expect(getFastLanePlanFromStripePriceId('price_yearly')).toBe('yearly');
    expect(getFastLanePlanFromStripePriceId('price_unknown')).toBeNull();
  });
});
