import fs from 'node:fs';
import path from 'node:path';
import { PipelineStep, PipelineContext } from '../PipelineStep.js';
import { getDb } from '../../database/db.js';
import { jobs } from '../../database/schema.js';
import { eq } from 'drizzle-orm';
import { logJob } from '../../utils/logger.js';

export class ImportStep implements PipelineStep {
  name = 'IMPORTING';

  async execute(context: PipelineContext): Promise<PipelineContext> {
    const db = getDb();
    
    // 1. Update job status to IMPORTING
    await db.update(jobs)
      .set({ status: 'IMPORTING', updatedAt: new Date() })
      .where(eq(jobs.id, context.jobId));
      
    await logJob(context.jobId, `Starting import step for file: ${path.basename(context.currentFilePath)}`);

    if (!fs.existsSync(context.currentFilePath)) {
      throw new Error(`Import failed: File not found at ${context.currentFilePath}`);
    }

    // 2. Fetch current job to check if format was already set (e.g., by ExtractionStep)
    const [currentJob] = await db.select().from(jobs).where(eq(jobs.id, context.jobId));
    if (!currentJob) {
      throw new Error(`Job ${context.jobId} not found in database`);
    }

    const stats = fs.statSync(context.currentFilePath);
    const ext = path.extname(context.currentFilePath).toLowerCase();
    
    // 3. Detect input format based on extension (only if not already set)
    let format = currentJob.inputFormat === 'UNKNOWN' ? 'UNKNOWN' : currentJob.inputFormat;
    if (format === 'UNKNOWN') {
      if (ext === '.pdf') format = 'PDF';
      else if (ext === '.zpl') format = 'ZPL';
      else if (ext === '.zip') format = 'ZIP';
      else if (ext === '.rar') format = 'RAR';
      else if (ext === '.txt' || ext === '.label') {
        // Try to detect ZPL content inside text-like files
        try {
          const sample = fs.readFileSync(context.currentFilePath, { encoding: 'utf8' }).slice(0, 8192);
          if (/\^XA|\^XZ|\^FO|\^FD|\^FS/.test(sample)) {
            format = 'ZPL';
          } else {
            format = 'TEXT';
          }
        } catch (err) {
          // If we can't read as UTF-8, leave as UNKNOWN
          format = 'UNKNOWN';
        }
      }
    }

    // 4. Update database record (only if format changed)
    if (format !== currentJob.inputFormat) {
      await db.update(jobs)
        .set({ 
          inputFormat: format,
          updatedAt: new Date() 
        })
        .where(eq(jobs.id, context.jobId));
    }

    await logJob(
      context.jobId,
      `Job Imported successfully: ${path.basename(context.currentFilePath)} (${stats.size} bytes) - Format: ${format}`
    );

    return context;
  }
}
