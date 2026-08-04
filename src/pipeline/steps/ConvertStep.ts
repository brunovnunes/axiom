import fs from 'node:fs';
import path from 'node:path';
import { PipelineStep, PipelineContext } from '../PipelineStep.js';
import { getDb } from '../../database/db.js';
import { jobs } from '../../database/schema.js';
import { eq } from 'drizzle-orm';
import { logJob } from '../../utils/logger.js';
import { LocalRenderer, MultiPageRenderOptions } from '../../converters/implementations/LocalRenderer.js';
import { ensureJobDirs } from '../../storage/Workspace.js';
import {
  extractZplDimensions,
  detectProfileByDimensions,
  LabelProfile,
} from '../../config/LabelProfile.js';
import { getConfig, getLabelProfiles } from '../../config/config.js';

export class ConvertStep implements PipelineStep {
  name = 'CONVERTING';

  async execute(context: PipelineContext): Promise<PipelineContext> {
    const db = getDb();

    // 1. Update job status to CONVERTING
    await db.update(jobs)
      .set({ status: 'CONVERTING', updatedAt: new Date() })
      .where(eq(jobs.id, context.jobId));

    await logJob(context.jobId, `Starting conversion step`);

    // 2. Fetch the job details
    const [job] = await db.select().from(jobs).where(eq(jobs.id, context.jobId));
    if (!job) {
      throw new Error(`Job ${context.jobId} not found in database`);
    }

    if (job.status === 'COMPLETED') {
      return context;
    }

    // 3. Perform conversion if the format is ZPL
    if (job.inputFormat === 'ZPL') {
      await logJob(context.jobId, `Converting ZPL label to PDF (local renderer)...`);
      
      try {
        const zplContent = fs.readFileSync(context.currentFilePath, 'utf-8');
        
        // Try to detect label profile from ZPL
        let profile: LabelProfile | undefined;
        const config = getConfig();
        const labelProfiles = getLabelProfiles();
        const autoDetect = config.autoDetectProfile ?? true;

        if (autoDetect) {
          const dimensions = extractZplDimensions(zplContent);
          if (dimensions) {
            const detected = detectProfileByDimensions(dimensions, labelProfiles);
            if (detected) {
              profile = detected.profile;
              await logJob(context.jobId, `Auto-detected label profile: ${detected.profileId}`);
            }
          }
        }

        // If no profile detected, use heuristic based on original filename or file content, or fallback to default
        if (!profile) {
          const lowerName = job.originalName.toLowerCase();
          const hasMlSku = zplContent.includes('^FDSKU: MLB');
          if (lowerName.includes('etiquetas-de-produtos') || lowerName.includes('80x25') || hasMlSku) {
            profile = labelProfiles['mlb_80x25'] || labelProfiles['default'];
            await logJob(context.jobId, `Auto-detected 80x25 label profile from filename or content`);
          } else {
            profile = labelProfiles['marketplace_10x15'] || labelProfiles['default'];
            await logJob(context.jobId, `Using default label profile (10x15)`);
          }
        }

        const renderer = new LocalRenderer();
        const renderOptions: MultiPageRenderOptions = {
          profile,
          renderMultiPage: true, // Enable multi-page rendering
        };
        const pdfBuffer = await renderer.render(zplContent, renderOptions);
        
        const jobDirs = ensureJobDirs(context.jobId);
        // Save the generated PDF in the processed directory
        const pdfPath = path.join(jobDirs.processed, 'rendered_label.pdf');
        
        fs.writeFileSync(pdfPath, pdfBuffer);
        
        // Update context and database record
        context.currentFilePath = pdfPath;
        
        await db.update(jobs)
          .set({ 
            outputFormat: 'PDF',
            updatedAt: new Date() 
          })
          .where(eq(jobs.id, context.jobId));
          
        await logJob(context.jobId, `Successfully rendered ZPL to PDF. Output saved: ${pdfPath}`);
      } catch (err: any) {
        await logJob(context.jobId, `Conversion failed: ${err.message}`, 'error');
        throw err;
      }
    } else if (job.inputFormat === 'PDF') {
      await logJob(context.jobId, `File is already in PDF format. No conversion needed.`);
      await db.update(jobs)
        .set({ 
          outputFormat: 'PDF',
          updatedAt: new Date() 
        })
        .where(eq(jobs.id, context.jobId));
    } else {
      await logJob(context.jobId, `No renderer/converter available for input format: ${job.inputFormat}. Passing through.`);
    }

    return context;
  }
}
