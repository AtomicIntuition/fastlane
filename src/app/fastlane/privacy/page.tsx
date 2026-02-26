import Link from 'next/link';

export default function FastLanePrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-slate-100">
      <h1 className="text-3xl font-bold">Privacy Policy</h1>
      <p className="mt-4 text-slate-300">
        FastLane collects only the data needed to provide fasting tracking, billing, and account security.
      </p>
      <section className="mt-6 space-y-3 text-slate-300">
        <p>Data we store: profile preferences, fasting sessions, check-ins, and subscription metadata.</p>
        <p>We do not sell personal data. Payment details are processed by Stripe and not stored directly by FastLane.</p>
        <p>We use security controls to protect account and webhook flows, including signed cookies and event verification.</p>
        <p>You can request account-data deletion by contacting support through your app account settings channel.</p>
      </section>
      <p className="mt-8 text-sm text-slate-400">Last updated: February 25, 2026.</p>
      <div className="mt-6">
        <Link href="/fastlane" className="text-emerald-300 underline underline-offset-2">Back to FastLane</Link>
      </div>
    </main>
  );
}
