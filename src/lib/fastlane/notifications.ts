import {
  getFastingProtocolById,
  type FastLaneNotificationItem,
  type FastLaneNotificationPlan,
  type FastLaneState,
} from '@/lib/fastlane/types';

function clampHour(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 23) return 23;
  return Math.floor(value);
}

function clampMinute(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 59) return 59;
  return Math.floor(value);
}

function parseTimeOfDay(value: string | null | undefined): { hour: number; minute: number } {
  if (!value) return { hour: 7, minute: 0 };
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return { hour: 7, minute: 0 };
  return {
    hour: clampHour(Number(match[1])),
    minute: clampMinute(Number(match[2])),
  };
}

function nextAtLocalTime(now: Date, clock: string): Date {
  const { hour, minute } = parseTimeOfDay(clock);
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function makeItem(input: {
  id: string;
  title: string;
  body: string;
  sendAt: Date;
  linkedAccount: boolean;
  priority?: 'normal' | 'high';
}): FastLaneNotificationItem {
  return {
    id: input.id,
    title: input.title,
    body: input.body,
    sendAt: input.sendAt.toISOString(),
    channel: input.linkedAccount ? 'email' : 'in_app',
    priority: input.priority ?? 'normal',
  };
}

export function buildFastLaneNotificationPlan(input: {
  state: FastLaneState;
  now?: Date;
  linkedAccount?: boolean;
}): FastLaneNotificationPlan {
  const now = input.now ?? new Date();
  const linkedAccount = Boolean(input.linkedAccount);
  const next: FastLaneNotificationItem[] = [];

  if (!input.state.profile.reminders) {
    return {
      enabled: false,
      generatedAt: now.toISOString(),
      next,
    };
  }

  if (input.state.activeFastStartAt) {
    const protocol = getFastingProtocolById(input.state.profile.protocolId);
    const fastHours = protocol?.fastHours ?? 16;
    const startAt = new Date(input.state.activeFastStartAt);
    const endAt = new Date(startAt.getTime() + fastHours * 60 * 60 * 1000);
    const preEndAt = new Date(endAt.getTime() - 30 * 60 * 1000);
    const hydrationAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    if (preEndAt.getTime() > now.getTime()) {
      next.push(
        makeItem({
          id: 'fast-near-complete',
          title: 'Fast almost complete',
          body: 'Thirty minutes left. Plan your first meal now.',
          sendAt: preEndAt,
          linkedAccount,
          priority: 'high',
        }),
      );
    }
    if (endAt.getTime() > now.getTime()) {
      next.push(
        makeItem({
          id: 'fast-complete',
          title: 'Fast complete',
          body: 'You hit your fasting target. End session when ready.',
          sendAt: endAt,
          linkedAccount,
          priority: 'high',
        }),
      );
    }
    next.push(
      makeItem({
        id: 'hydration-check',
        title: 'Hydration check',
        body: 'Take water and keep electrolytes in range.',
        sendAt: hydrationAt,
        linkedAccount,
      }),
    );
  } else {
    const wakeAt = nextAtLocalTime(now, input.state.profile.wakeTime);
    const sleepAt = nextAtLocalTime(now, input.state.profile.sleepTime);
    next.push(
      makeItem({
        id: 'start-window',
        title: 'Start your fast window',
        body: 'Kick off your next fast during your planned routine window.',
        sendAt: wakeAt,
        linkedAccount,
      }),
    );
    next.push(
      makeItem({
        id: 'close-window',
        title: 'Close eating window',
        body: 'Keep consistency by closing your eating window on time.',
        sendAt: sleepAt,
        linkedAccount,
      }),
    );

    const latestSession = input.state.sessions[0];
    const latestEndMs = latestSession ? new Date(latestSession.endAt).getTime() : 0;
    if (!latestEndMs || now.getTime() - latestEndMs > 36 * 60 * 60 * 1000) {
      const reengageAt = new Date(wakeAt.getTime() + 60 * 60 * 1000);
      next.push(
        makeItem({
          id: 'reengagement',
          title: 'Back on track',
          body: 'A short fast today rebuilds momentum and streak confidence.',
          sendAt: reengageAt,
          linkedAccount,
        }),
      );
    }
  }

  const deduped = new Map<string, FastLaneNotificationItem>();
  for (const item of next) {
    if (!deduped.has(item.id)) {
      deduped.set(item.id, item);
    }
  }

  return {
    enabled: true,
    generatedAt: now.toISOString(),
    next: Array.from(deduped.values())
      .sort((a, b) => new Date(a.sendAt).getTime() - new Date(b.sendAt).getTime())
      .slice(0, 5),
  };
}
