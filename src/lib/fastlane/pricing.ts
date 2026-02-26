export type FastLanePlan = 'monthly' | 'yearly';

interface PlanConfig {
  id: FastLanePlan;
  label: string;
  shortLabel: string;
  monthlyUsd: number;
  billedUsd: number;
}

export const FASTLANE_PLANS: readonly PlanConfig[] = [
  {
    id: 'monthly',
    label: 'Monthly',
    shortLabel: 'mo',
    monthlyUsd: 9.99,
    billedUsd: 9.99,
  },
  {
    id: 'yearly',
    label: 'Yearly',
    shortLabel: 'yr',
    monthlyUsd: 4.99,
    billedUsd: 59.99,
  },
] as const;

const PLAN_IDS = new Set<FastLanePlan>(['monthly', 'yearly']);

export function isFastLanePlan(value: unknown): value is FastLanePlan {
  return typeof value === 'string' && PLAN_IDS.has(value as FastLanePlan);
}

export function getFastLanePlanConfig(plan: FastLanePlan): PlanConfig {
  const config = FASTLANE_PLANS.find((candidate) => candidate.id === plan);
  if (!config) {
    throw new Error(`Unknown FastLane plan: ${plan}`);
  }
  return config;
}

export function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function getFastLaneStripePriceId(plan: FastLanePlan): string | null {
  const priceId = plan === 'yearly' ? process.env.STRIPE_PRICE_YEARLY : process.env.STRIPE_PRICE_MONTHLY;
  return typeof priceId === 'string' && priceId.trim().length > 0 ? priceId.trim() : null;
}

export function getFastLanePlanFromStripePriceId(priceId: string | null | undefined): FastLanePlan | null {
  if (!priceId) return null;
  const normalized = priceId.trim();
  if (normalized.length === 0) return null;

  const monthly = process.env.STRIPE_PRICE_MONTHLY?.trim();
  const yearly = process.env.STRIPE_PRICE_YEARLY?.trim();

  if (normalized === yearly && yearly) return 'yearly';
  if (normalized === monthly && monthly) return 'monthly';
  return null;
}
