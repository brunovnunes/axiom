import fs from 'node:fs';
import { PipelineStep, PipelineContext } from '../PipelineStep.js';
import { getDb } from '../../database/db.js';
import { jobs } from '../../database/schema.js';
import { eq } from 'drizzle-orm';
import { logJob } from '../../utils/logger.js';
import { pluginManager } from '../../plugins/PluginManager.js';

export class DetectStep implements PipelineStep {
  name = 'DETECTING';

  async execute(context: PipelineContext): Promise<PipelineContext> {
    const db = getDb();

    // 1. Update job status to DETECTING
    await db.update(jobs)
      .set({ status: 'DETECTING', updatedAt: new Date() })
      .where(eq(jobs.id, context.jobId));

    await logJob(context.jobId, `Starting type and marketplace detection step`);

    // 2. Fetch the job details
    const [job] = await db.select().from(jobs).where(eq(jobs.id, context.jobId));
    if (!job) {
      throw new Error(`Job ${context.jobId} not found in database`);
    }

    // Extraction parent jobs don't need detection since they are already marked complete
    if (job.status === 'COMPLETED') {
      return context;
    }

    // We only perform marketplace detection on ZPL files currently
    if (job.inputFormat === 'ZPL') {
      try {
        const content = fs.readFileSync(context.currentFilePath, 'utf-8');
        const matchedPlugin = await pluginManager.detectMarketplace(content, job.originalName);
        
        if (matchedPlugin) {
          context.detectedPlugin = matchedPlugin.name;
          await logJob(context.jobId, `Marketplace detected: ${matchedPlugin.name.toUpperCase()} plugin matched`);
        } else {
          await logJob(context.jobId, `No matching marketplace plugin detected for this ZPL file`);
        }
      } catch (err: any) {
        await logJob(context.jobId, `Error reading file for detection: ${err.message}`, 'error');
      }
    } else {
      await logJob(context.jobId, `Skipping marketplace detection for non-ZPL input format (${job.inputFormat})`);
    }

    return context;
  }
}
