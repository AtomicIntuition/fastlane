export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { games, seasons, teams } from '@/lib/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { Header } from '@/components/layout/header';
import Link from 'next/link';
import { TeamLogo } from '@/components/team/team-logo';

export const metadata = {
  title: 'Live Game',
};

async function getLiveGame() {
  const seasonRows = await db
    .select()
    .from(seasons)
    .orderBy(desc(seasons.seasonNumber))
    .limit(1);

  const season = seasonRows[0];
  if (!season) return null;

  const weekGames = await db
    .select()
    .from(games)
    .where(
      and(eq(games.seasonId, season.id), eq(games.week, season.currentWeek))
    );

  // Find a live game first, then a completed featured game
  const liveGame =
    weekGames.find((g) => g.status === 'broadcasting') ??
    weekGames.find((g) => g.status === 'simulating');

  if (liveGame) return { type: 'live' as const, gameId: liveGame.id };

  // If no live game, find the most recent completed game
  const recentCompleted = weekGames
    .filter((g) => g.status === 'completed')
    .sort((a, b) => {
      const aTime = a.completedAt?.getTime() ?? 0;
      const bTime = b.completedAt?.getTime() ?? 0;
      return bTime - aTime;
    })[0];

  if (recentCompleted) return { type: 'completed' as const, gameId: recentCompleted.id };

  // Find next scheduled game
  const nextGame = weekGames.find((g) => g.status === 'scheduled');
  if (nextGame) return { type: 'upcoming' as const, game: nextGame, season };

  return null;
}

export default async function LivePage() {
  const result = await getLiveGame();

  // Redirect to live or recent game
  if (result?.type === 'live' || result?.type === 'completed') {
    redirect(`/game/${result.gameId}`);
  }

  // No live game — show waiting screen
  return (
    <div className="min-h-dvh bg-midnight">
      <Header />
      <main className="max-w-2xl mx-auto px-4 pt-24 pb-32 text-center">
        <div className="text-6xl mb-6">🏈</div>
        <h1 className="text-2xl font-bold text-text-primary mb-3">
          No Game Live Right Now
        </h1>
        <p className="text-text-secondary mb-8">
          The next game will start automatically. Check back soon or view the schedule.
        </p>
        <Link
          href="/schedule"
          className="inline-block px-6 py-3 bg-accent-blue text-white font-semibold rounded-lg hover:bg-accent-blue/90 transition-colors"
        >
          View Schedule
        </Link>
      </main>
    </div>
  );
}
