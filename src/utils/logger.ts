import pino from 'pino';
import { getDb } from '../database/db.js';
import { jobLogs } from '../database/schema.js';

// Configure Pino with pretty printing in development if pino-pretty is available
const isDev = process.env.NODE_ENV !== 'production';
export const logger = pino({
  level: 'info',
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});

/**
 * Logs a message to stdout/stderr via Pino and persists it to the database.
 */
export async function logJob(
  jobId: string,
  message: string,
  level: 'info' | 'warn' | 'error' = 'info'
): Promise<void> {
  // 1. Log via Pino
  if (level === 'error') {
    logger.error({ jobId }, message);
  } else if (level === 'warn') {
    logger.warn({ jobId }, message);
  } else {
    logger.info({ jobId }, message);
  }

  // 2. Persist to SQLite
  try {
    const db = getDb();
    await db.insert(jobLogs).values({
      jobId,
      message: `[${level.toUpperCase()}] ${message}`,
      timestamp: new Date(),
    });
  } catch (error) {
    logger.error({ jobId, error }, 'Failed to persist job log to database');
  }
}
