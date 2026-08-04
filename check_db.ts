import { getDb } from './src/database/db.js';
import { jobs } from './src/database/schema.js';
import { desc } from 'drizzle-orm';

async function run() {
  const db = getDb();
  const latestJobs = await db.select().from(jobs).orderBy(desc(jobs.createdAt)).limit(5);
  console.log(JSON.stringify(latestJobs, null, 2));
}

run().catch(console.error);
