import type { Metadata } from 'next';
import { Fraunces, Space_Grotesk } from 'next/font/google';
import type { ReactNode } from 'react';

const display = Fraunces({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-fastlane-display' });
const ui = Space_Grotesk({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-fastlane-ui' });

export const metadata: Metadata = {
  title: 'FastLane - Intermittent Fasting App',
  description: 'Premium intermittent fasting app with habit loops, clean timer UX, and smart monetization.',
};

export default function FastLaneLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${display.variable} ${ui.variable}`} style={{ fontFamily: 'var(--font-fastlane-ui)' }}>
      <style>{`
        .fastlane-display { font-family: var(--font-fastlane-display), serif; }
      `}</style>
      {children}
    </div>
  );
}
