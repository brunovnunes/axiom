import { PipelineContext, PipelineStep } from '../pipeline/PipelineStep.js';
import { ImportStep } from '../pipeline/steps/ImportStep.js';
import { ExtractionStep } from '../pipeline/steps/ExtractionStep.js';
import { DetectStep } from '../pipeline/steps/DetectStep.js';
import { TransformStep } from '../pipeline/steps/TransformStep.js';
import { ConvertStep } from '../pipeline/steps/ConvertStep.js';
import { PrintStep } from '../pipeline/steps/PrintStep.js';
import { getDb } from '../database/db.js';
import { jobs } from '../database/schema.js';
import { eq } from 'drizzle-orm';
import { logJob } from '../utils/logger.js';

export class Pipeline {
  private steps: PipelineStep[] = [];

  constructor() {
    // Define the sequence of steps in our automation pipeline
    this.steps = [
      new ImportStep(),
      new ExtractionStep(),
      new DetectStep(),
      new TransformStep(),
      new ConvertStep(),
      new PrintStep(),
    ];
  }

  /**
   * Runs the entire pipeline for a given job.
   */
  async run(jobId: string, initialFilePath: string): Promise<void> {
    let context: PipelineContext = {
      jobId,
      currentFilePath: initialFilePath,
    };

    const db = getDb();

    try {
      for (const step of this.steps) {
        // Fetch current job status to see if it has been marked as COMPLETED early (e.g. ExtractionStep finished with child jobs spawned)
        const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
        if (!job) {
          throw new Error(`Job ${jobId} not found during pipeline run`);
        }

        if (job.status === 'COMPLETED' || job.status === 'FAILED') {
          break;
        }

        context = await step.execute(context);
      }
    } catch (error: any) {
      const errorMessage = error.message || 'Unknown error occurred';
      await logJob(jobId, `Pipeline failed: ${errorMessage}`, 'error');

      // Set job status to FAILED in the database
      await db.update(jobs)
        .set({
          status: 'FAILED',
          error: errorMessage,
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, jobId));

      throw error;
    }
  }
}
