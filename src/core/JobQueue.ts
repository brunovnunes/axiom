import { getDb } from '../database/db.js';
import { jobs } from '../database/schema.js';
import { eq, asc } from 'drizzle-orm';
import { Pipeline } from './Pipeline.js';
import { logJob, logger } from '../utils/logger.js';

export class JobQueue {
  private processing = false;
  private pipeline = new Pipeline();

  /**
   * Triggers the queue loop. If the loop is already running, it does nothing.
   */
  async trigger(): Promise<void> {
    if (this.processing) {
      return;
    }
    
    this.processing = true;
    
    // Run the processing loop asynchronously
    this.processLoop()
      .catch((err) => {
        logger.error(err, 'Catastrophic error in queue loop');
      })
      .finally(() => {
        this.processing = false;
      });
  }

  private async processLoop(): Promise<void> {
    const db = getDb();
    
    while (true) {
      // Retrieve the oldest queued job
      const [queuedJob] = await db
        .select()
        .from(jobs)
        .where(eq(jobs.status, 'QUEUED'))
        .orderBy(asc(jobs.createdAt))
        .limit(1);

      if (!queuedJob) {
        break; // No more queued jobs
      }

      try {
        await logJob(queuedJob.id, `Starting processing pipeline for job...`);
        await this.pipeline.run(queuedJob.id, queuedJob.workspacePath);
      } catch (err: any) {
        logger.error({ jobId: queuedJob.id, error: err }, `Failed to process job in queue: ${err.message}`);
        
        // Double-check job status is marked FAILED if the pipeline crashed before doing so
        try {
          const [currentJob] = await db.select().from(jobs).where(eq(jobs.id, queuedJob.id));
          if (currentJob && currentJob.status !== 'COMPLETED' && currentJob.status !== 'FAILED') {
            await db.update(jobs)
              .set({ 
                status: 'FAILED', 
                error: err.message || 'Catastrophic error',
                updatedAt: new Date()
              })
              .where(eq(jobs.id, queuedJob.id));
          }
        } catch (dbErr: any) {
          logger.error(dbErr, `Failed to update crashed job status for ${queuedJob.id}`);
        }
      }
    }
  }
}

export const jobQueue = new JobQueue();
