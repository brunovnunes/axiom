import fs from 'node:fs';
import path from 'node:path';
import { PipelineStep, PipelineContext } from '../PipelineStep.js';
import { getDb } from '../../database/db.js';
import { jobs } from '../../database/schema.js';
import { eq } from 'drizzle-orm';
import { logJob } from '../../utils/logger.js';
import { pluginManager } from '../../plugins/PluginManager.js';
import { ensureJobDirs } from '../../storage/Workspace.js';

export class TransformStep implements PipelineStep {
  name = 'TRANSFORMING';

  async execute(context: PipelineContext): Promise<PipelineContext> {
    const db = getDb();

    // 1. Update job status to TRANSFORMING
    await db.update(jobs)
      .set({ status: 'TRANSFORMING', updatedAt: new Date() })
      .where(eq(jobs.id, context.jobId));

    await logJob(context.jobId, `Starting transformation step`);

    // 2. Fetch the job details
    const [job] = await db.select().from(jobs).where(eq(jobs.id, context.jobId));
    if (!job) {
      throw new Error(`Job ${context.jobId} not found in database`);
    }

    if (job.status === 'COMPLETED') {
      return context;
    }

    // 3. Apply transformation if a plugin was detected
    if (context.detectedPlugin) {
      const plugin = pluginManager.getPlugins().find(p => p.name === context.detectedPlugin);
      if (plugin) {
        await logJob(context.jobId, `Applying marketplace plugin: ${plugin.name}`);

        try {
          // For PDF files (e.g. Mercado Livre), pass binary content + options
          const isPdf = context.currentFilePath.toLowerCase().endsWith('.pdf');
          const content = isPdf
            ? '' // PDF plugins don't use string content - they use filePath from options
            : fs.readFileSync(context.currentFilePath, 'utf-8');

          const transformOptions = {
            filePath: context.currentFilePath,
            jobId: context.jobId,
            condenseDanfe: context.condenseDanfe,
          };

          const transformedContent = await plugin.transform(content, transformOptions);

          const jobDirs = ensureJobDirs(context.jobId);

          if (Buffer.isBuffer(transformedContent)) {
            // Binary output (PDF → PDF): use a fixed output name
            const transformedFilePath = path.join(jobDirs.processed, 'condensed_label.pdf');
            fs.writeFileSync(transformedFilePath, transformedContent);
            context.currentFilePath = transformedFilePath;
            await logJob(context.jobId, `Transformation (PDF) applied. Output: ${transformedFilePath}`);
          } else {
            // String output (ZPL → ZPL): preserve name pattern
            const ext = path.extname(context.currentFilePath);
            const transformedFileName = `transformed_${path.basename(context.currentFilePath, ext)}${ext}`;
            const transformedFilePath = path.join(jobDirs.processed, transformedFileName);
            fs.writeFileSync(transformedFilePath, transformedContent, 'utf-8');
            context.currentFilePath = transformedFilePath;
            await logJob(context.jobId, `Transformation applied successfully. Output written to ${transformedFilePath}`);
          }
        } catch (err: any) {
          await logJob(context.jobId, `Transformation failed: ${err.message}`, 'error');
          throw err;
        }
      }
    } else {
      await logJob(context.jobId, 'No transformations required for this job');
    }

    return context;
  }
}
