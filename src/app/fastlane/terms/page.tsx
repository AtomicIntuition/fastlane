import Link from 'next/link';

export default function FastLaneTermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-slate-100">
      <h1 className="text-3xl font-bold">Terms of Service</h1>
      <p className="mt-4 text-slate-300">
        By using FastLane, you agree to use the app responsibly and in accordance with applicable laws.
      </p>
      <section className="mt-6 space-y-3 text-slate-300">
        <p>FastLane is provided as-is without guarantees of uninterrupted service.</p>
        <p>Subscriptions renew according to your selected Stripe plan until canceled through the billing portal.</p>
        <p>Misuse, abuse, or attempts to interfere with service integrity may lead to account restriction.</p>
        <p>These terms may be updated; continued use after updates constitutes acceptance of revised terms.</p>
      </section>
      <p className="mt-8 text-sm text-slate-400">Last updated: February 25, 2026.</p>
      <div className="mt-6">
        <Link href="/fastlane" className="text-emerald-300 underline underline-offset-2">Back to FastLane</Link>
      </div>
    </main>
  );
}
