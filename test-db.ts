import crypto from 'node:crypto';
import { initDb, closeDb } from './src/database/db.js';
import { jobs, jobLogs } from './src/database/schema.js';

async function main() {
  const db = initDb();
  
  const jobId = crypto.randomUUID();
  console.log('Inserting job:', jobId);
  
  await db.insert(jobs).values({
    id: jobId,
    originalName: 'test.pdf',
    destinationPrinter: 'printer',
    workspacePath: 'path',
  });
  
  console.log('Inserting job log...');
  await db.insert(jobLogs).values({
    jobId,
    message: 'Test message',
  });
  
  console.log('Done!');
  closeDb();
}

main().catch(console.error);
