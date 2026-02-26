import type { Metadata } from 'next';
import { AdminReadinessConsole } from '@/components/fastlane/admin-readiness-console';

export const metadata: Metadata = {
  title: 'FastLane Readiness Admin',
  description: 'Admin readiness dashboard for FastLane production and operations checks.',
};

export default function FastLaneReadinessAdminPage() {
  return <AdminReadinessConsole />;
}
