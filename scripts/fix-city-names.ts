// Fix team city names in the database to use official NFL market names
// Usage: npx tsx scripts/fix-city-names.ts

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import * as schema from '../src/lib/db/schema';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const client = postgres(DATABASE_URL, { prepare: false });
const db = drizzle(client, { schema });

const cityFixes: Record<string, string> = {
  'NE': 'New England',     // was Foxborough
  'NYJ': 'New York',       // was East Rutherford
  'NYG': 'New York',       // was East Rutherford
  'DAL': 'Dallas',         // was Arlington
  'TEN': 'Tennessee',      // was Nashville
  'WAS': 'Washington',     // was Landover
  'MIN': 'Minnesota',      // was Minneapolis
  'CAR': 'Carolina',       // was Charlotte
  'ARI': 'Arizona',        // was Glendale
  'SF': 'San Francisco',   // was Santa Clara
};

async function main() {
  console.log('Fixing team city names...\n');

  const allTeams = await db.select().from(schema.teams);

  for (const team of allTeams) {
    const correctCity = cityFixes[team.abbreviation];
    if (correctCity && team.city !== correctCity) {
      await db
        .update(schema.teams)
        .set({ city: correctCity })
        .where(eq(schema.teams.id, team.id));
      console.log(`  ${team.abbreviation}: "${team.city}" → "${correctCity}"`);
    }
  }

  console.log('\nDone!');
  await client.end();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
