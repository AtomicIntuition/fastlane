import type { Metadata } from 'next';
import { AdminWebhookConsole } from '@/components/fastlane/admin-webhook-console';

export const metadata: Metadata = {
  title: 'FastLane Webhook Recovery Admin',
  description: 'Admin tooling for replaying failed FastLane Stripe webhooks.',
};

export default function FastLaneWebhookAdminPage() {
  return <AdminWebhookConsole />;
}
