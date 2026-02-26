import type { Metadata } from 'next';
import Link from 'next/link';
import styles from './admin-home.module.css';
import { AdminOverviewSnapshot } from '@/components/fastlane/admin-overview-snapshot';

export const metadata: Metadata = {
  title: 'FastLane Admin Overview',
  description: 'FastLane operations overview and entry point for KPI, readiness, and webhook recovery.',
};

export default function FastLaneAdminOverviewPage() {
  return (
    <div className={styles.shell}>
      <h1 className={styles.heading}>FastLane Operations Command Center</h1>
      <p className={styles.sub}>
        Use this area to monitor launch health, recover failed billing events, and track conversion performance.
      </p>

      <AdminOverviewSnapshot />

      <section className={styles.grid}>
        <article className={styles.card}>
          <h2>Readiness</h2>
          <p>Confirm environment, billing, monitoring, and production launch checks.</p>
          <Link className={styles.cta} href="/admin/fastlane/readiness">Open readiness</Link>
        </article>

        <article className={styles.card}>
          <h2>KPI Dashboard</h2>
          <p>Track acquisition, onboarding conversion, and paywall trial lift.</p>
          <Link className={styles.cta} href="/admin/fastlane/kpi">Open KPI dashboard</Link>
        </article>

        <article className={styles.card}>
          <h2>Webhook Recovery</h2>
          <p>Inspect failed Stripe webhooks and safely replay events with operator audit tracking.</p>
          <Link className={styles.cta} href="/admin/fastlane/webhooks">Open recovery console</Link>
        </article>
      </section>

      <section className={styles.checklist}>
        <h2>Daily Ops Checklist</h2>
        <ol className={styles.list}>
          <li>Check readiness status and resolve missing production configuration.</li>
          <li>Verify failed webhook count is zero or actively being reprocessed.</li>
          <li>Review KPI movement for onboarding and paywall trial conversion.</li>
          <li>Only push release when release gate and launch checklist are fully green.</li>
        </ol>
      </section>
    </div>
  );
}
