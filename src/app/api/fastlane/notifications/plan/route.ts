import { NextRequest, NextResponse } from 'next/server';
import { buildFastLaneNotificationPlan } from '@/lib/fastlane/notifications';
import { ensureFastLaneUser, getFastLaneStateForUser, requireFastLaneUserId, unauthorized } from '@/lib/fastlane/server';

export async function GET(request: NextRequest) {
  try {
    const userId = requireFastLaneUserId(request);
    if (!userId) return unauthorized();

    const unknownQueryKey = Array.from(request.nextUrl.searchParams.keys())[0];
    if (unknownQueryKey !== undefined) {
      return NextResponse.json({ error: `Unknown query parameter: ${unknownQueryKey}` }, { status: 400 });
    }

    const [state, user] = await Promise.all([getFastLaneStateForUser(userId), ensureFastLaneUser(userId)]);
    const plan = buildFastLaneNotificationPlan({
      state,
      now: new Date(),
      linkedAccount: Boolean(user.email),
    });

    return NextResponse.json(plan, {
      headers: {
        'cache-control': 'private, no-store, max-age=0',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Unable to load notification plan' }, { status: 500 });
  }
}
