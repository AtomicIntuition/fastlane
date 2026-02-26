'use client';

import Link from 'next/link';
import styles from './fastlane-landing.module.css';
import { trackEvent } from '@/lib/fastlane/analytics';
import { formatUsd, getFastLanePlanConfig } from '@/lib/fastlane/pricing';

export function FastLaneLanding() {
  const monthlyPlan = getFastLanePlanConfig('monthly');
  const yearlyPlan = getFastLanePlanConfig('yearly');

  const handleCta = (source: string) => {
    trackEvent('landing_cta_clicked', { source });
  };

  return (
    <div className={styles.shell}>
      <div className={styles.grid} aria-hidden />
      <main className={styles.main}>
        <nav className={styles.nav}>
          <div className={styles.brand}>FastLane</div>
          <div className={styles.badge}>No fluff. Just consistency.</div>
        </nav>

        <section className={styles.hero}>
          <p className={styles.kicker}>Intermittent Fasting, Rebuilt</p>
          <h1>Make fasting feel premium, simple, and repeatable.</h1>
          <p className={styles.lead}>
            FastLane is built for people who want results without noise. Start in under two minutes,
            follow a clean daily rhythm, and stay locked in with thoughtful reminders and progress insights.
          </p>
          <div className={styles.actions}>
            <Link href="/fastlane/app" className={`${styles.cta} ${styles.ctaPrimary}`} onClick={() => handleCta('hero_primary')}>
              Start free now
            </Link>
            <a href="#pricing" className={`${styles.cta} ${styles.ctaGhost}`} onClick={() => handleCta('hero_pricing')}>
              See pricing
            </a>
          </div>
        </section>

        <section className={styles.cards}>
          <article className={styles.card}>
            <h3>Fast in one tap</h3>
            <p>Choose your protocol, hit start, and let FastLane run the clock with zero setup friction.</p>
          </article>
          <article className={styles.card}>
            <h3>Retention by design</h3>
            <p>Streaks, milestones, and weekly summaries nudge consistency without guilt loops.</p>
          </article>
          <article className={styles.card}>
            <h3>Signals that matter</h3>
            <p>Track energy, hunger, and mood to connect fasting behavior with real-life outcomes.</p>
          </article>
        </section>

        <section className={styles.section} id="how-it-works">
          <h2>How it works</h2>
          <div className={styles.list}>
            <div>1. Set your goal and schedule in onboarding.</div>
            <div>2. Start your fasting window with one primary CTA.</div>
            <div>3. Log simple daily check-ins and review your trendline.</div>
          </div>
        </section>

        <section className={styles.section} id="pricing">
          <h2>Pricing</h2>
          <div className={styles.priceRow}>
            <article className={styles.priceCard}>
              <h3>Free</h3>
              <p>Core timer, basic history, and starter protocols.</p>
              <p><strong>$0</strong></p>
            </article>
            <article className={styles.priceCard}>
              <h3>Pro</h3>
              <p>Unlimited history, advanced insights, premium protocols, and smart reminder flows.</p>
              <p>
                <strong>{formatUsd(monthlyPlan.billedUsd)}/{monthlyPlan.shortLabel}</strong> or{' '}
                <strong>{formatUsd(yearlyPlan.billedUsd)}/{yearlyPlan.shortLabel}</strong>
              </p>
            </article>
          </div>
        </section>

        <section className={styles.section}>
          <h2>FAQ</h2>
          <div className={styles.list}>
            <div><strong>Is this medical advice?</strong> No. FastLane provides education and behavior support only.</div>
            <div><strong>Can beginners use this?</strong> Yes. Start with 12:12 or 14:10 and build gradually.</div>
            <div><strong>Will this work on mobile?</strong> Yes. The entire flow is designed mobile-first.</div>
          </div>
          <p className={styles.small}>
            Safety note: if you have diabetes, are pregnant, or have a medical condition, consult a clinician before fasting.
          </p>
        </section>

        <footer className={styles.legalRow}>
          <Link href="/fastlane/privacy" className={styles.legalLink}>Privacy</Link>
          <Link href="/fastlane/terms" className={styles.legalLink}>Terms</Link>
          <Link href="/fastlane/disclaimer" className={styles.legalLink}>Disclaimer</Link>
        </footer>
      </main>
    </div>
  );
}
