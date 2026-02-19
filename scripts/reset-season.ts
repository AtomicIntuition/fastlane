/**
 * Reset season data: wipe all seasons, games, game_events, and standings.
 * Keeps teams and players intact.
 *
 * Usage: npx tsx scripts/reset-season.ts
 */

import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

async function main() {
  const sql = postgres(DATABASE_URL!, { prepare: false });

  console.log('Resetting season data...');

  // Delete in order of foreign key dependencies
  await sql`DELETE FROM game_events`;
  console.log('  Cleared game_events');

  await sql`DELETE FROM predictions`;
  console.log('  Cleared predictions');

  await sql`DELETE FROM games`;
  console.log('  Cleared games');

  await sql`DELETE FROM standings`;
  console.log('  Cleared standings');

  await sql`DELETE FROM seasons`;
  console.log('  Cleared seasons');

  console.log('\nDone! All season data has been reset.');
  console.log('Trigger /api/simulate to create a new season with proper scheduling.');

  await sql.end();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
