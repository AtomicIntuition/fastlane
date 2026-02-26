import {
  findFastLaneSubscriptionByStripeSubscriptionId,
  getFastLaneSubscriptionByCustomer,
  upsertFastLaneSubscription,
} from '@/lib/fastlane/server';
import { getFastLanePlanFromStripePriceId, isFastLanePlan } from '@/lib/fastlane/pricing';
import type { fastlaneSubscriptions } from '@/lib/db/schema';

export interface StripeWebhookEvent {
  id?: string;
  type: string;
  data?: {
    object?: Record<string, unknown>;
  };
}

function getStripeObjectId(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'string') {
    return value.id;
  }
  return '';
}

function getSubscriptionStatus(value: unknown): typeof fastlaneSubscriptions.$inferInsert.status {
  if (value === 'incomplete') return 'incomplete';
  if (value === 'incomplete_expired') return 'incomplete_expired';
  if (value === 'trialing') return 'trialing';
  if (value === 'active') return 'active';
  if (value === 'past_due') return 'past_due';
  if (value === 'canceled') return 'canceled';
  if (value === 'unpaid') return 'unpaid';
  if (value === 'paused') return 'paused';
  return 'incomplete';
}

export async function processFastLaneStripeEvent(event: StripeWebhookEvent): Promise<void> {
  const object = event.data?.object ?? {};

  if (event.type === 'checkout.session.completed') {
    const customerId = getStripeObjectId(object.customer);
    const subscriptionId = getStripeObjectId(object.subscription);
    const metadata = (object.metadata ?? {}) as Record<string, string>;
    const userId = metadata.userId;

    if (customerId && subscriptionId && userId) {
      const metadataPlan = metadata.plan;
      await upsertFastLaneSubscription({
        userId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        status: 'active',
        plan: isFastLanePlan(metadataPlan) ? metadataPlan : null,
      });
    }
  }

  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.created') {
    const subscriptionId = getStripeObjectId(object.id);
    const customerId = getStripeObjectId(object.customer);
    const status = getSubscriptionStatus(object.status);

    const currentPeriodEndUnix = Number(object.current_period_end ?? 0);
    const cancelAtPeriodEnd = object.cancel_at_period_end === true;
    const items = object.items as { data?: Array<{ price?: { id?: string } }> } | undefined;
    const plan = getFastLanePlanFromStripePriceId(items?.data?.[0]?.price?.id) ?? null;

    let subscription = subscriptionId
      ? await findFastLaneSubscriptionByStripeSubscriptionId(subscriptionId)
      : null;
    if (!subscription && customerId) {
      subscription = await getFastLaneSubscriptionByCustomer(customerId);
    }

    if (subscription) {
      await upsertFastLaneSubscription({
        userId: subscription.userId,
        stripeCustomerId: customerId || subscription.stripeCustomerId,
        stripeSubscriptionId: subscriptionId || subscription.stripeSubscriptionId,
        status,
        plan,
        cancelAtPeriodEnd,
        currentPeriodEnd: currentPeriodEndUnix > 0 ? new Date(currentPeriodEndUnix * 1000) : null,
      });
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscriptionId = getStripeObjectId(object.id);
    const customerId = getStripeObjectId(object.customer);
    let subscription = subscriptionId
      ? await findFastLaneSubscriptionByStripeSubscriptionId(subscriptionId)
      : null;
    if (!subscription && customerId) {
      subscription = await getFastLaneSubscriptionByCustomer(customerId);
    }
    if (subscription) {
      await upsertFastLaneSubscription({
        userId: subscription.userId,
        status: 'canceled',
      });
    }
  }
}
