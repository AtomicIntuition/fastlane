import type { Metadata } from 'next';
import { AdminKpiConsole } from '@/components/fastlane/admin-kpi-console';

export const metadata: Metadata = {
  title: 'FastLane KPI Admin',
  description: 'Admin KPI dashboard for FastLane conversion and monetization events.',
};

export default function FastLaneKpiAdminPage() {
  return <AdminKpiConsole />;
}
