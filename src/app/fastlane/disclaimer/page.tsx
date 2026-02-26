import Link from 'next/link';

export default function FastLaneDisclaimerPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-slate-100">
      <h1 className="text-3xl font-bold">Medical Disclaimer</h1>
      <p className="mt-4 text-slate-300">
        FastLane provides educational and habit-support information only and is not medical advice.
      </p>
      <section className="mt-6 space-y-3 text-slate-300">
        <p>Always consult a licensed clinician before starting fasting if you are pregnant, diabetic, or managing a condition.</p>
        <p>Stop fasting and seek medical care if you experience concerning symptoms.</p>
        <p>FastLane does not diagnose, treat, or prevent disease.</p>
      </section>
      <p className="mt-8 text-sm text-slate-400">Last updated: February 25, 2026.</p>
      <div className="mt-6">
        <Link href="/fastlane" className="text-emerald-300 underline underline-offset-2">Back to FastLane</Link>
      </div>
    </main>
  );
}
