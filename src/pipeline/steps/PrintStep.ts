import fs from 'node:fs';
import path from 'node:path';
import { PipelineStep, PipelineContext } from '../PipelineStep.js';
import { getDb } from '../../database/db.js';
import { jobs } from '../../database/schema.js';
import { eq } from 'drizzle-orm';
import { logJob } from '../../utils/logger.js';
import { getPrinterBackend } from '../../printer/Printer.js';
import { getConfig } from '../../config/config.js';
import { ensureJobDirs } from '../../storage/Workspace.js';

export class PrintStep implements PipelineStep {
  name = 'PRINTING';

  async execute(context: PipelineContext): Promise<PipelineContext> {
    const db = getDb();
    const config = getConfig();

    // 1. Update job status to PRINTING
    await db.update(jobs)
      .set({ status: 'PRINTING', updatedAt: new Date() })
      .where(eq(jobs.id, context.jobId));

    await logJob(context.jobId, `Starting print step`);

    // 2. Fetch the job details
    const [job] = await db.select().from(jobs).where(eq(jobs.id, context.jobId));
    if (!job) {
      throw new Error(`Job ${context.jobId} not found in database`);
    }

    if (job.status === 'COMPLETED') {
      return context;
    }

    const jobDirs = ensureJobDirs(context.jobId);
    const ext = path.extname(context.currentFilePath);
    const finalFileName = `printed_label${ext}`;
    const outputFilePath = path.join(jobDirs.output, finalFileName);

    // 3. Inspect file content to avoid sending non-printable junk to physical printers
    const buffer = fs.readFileSync(context.currentFilePath);
    const header = buffer.slice(0, 512).toString('utf8', 0, 512);

    // Helper detectors
    const isPDF = buffer.slice(0, 4).toString() === '%PDF';
    const isPNG = buffer.slice(0, 8).equals(Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]));
    const isJpeg = buffer.slice(0, 3).equals(Buffer.from([0xFF,0xD8,0xFF]));
    const looksLikeZpl = /\^XA|\^FX|\^XZ|\^FS|\^FO/.test(header);

    const printable = isPDF || isPNG || isJpeg || looksLikeZpl;

    if (!printable) {
      // Persist the file for inspection, but mark job as FAILED to avoid printing
      fs.copyFileSync(context.currentFilePath, outputFilePath);
      await logJob(context.jobId, `Persisted non-printable file to output for inspection: ${outputFilePath}`);
      await db.update(jobs)
        .set({ status: 'FAILED', updatedAt: new Date() })
        .where(eq(jobs.id, context.jobId));

      await logJob(context.jobId, `Job marked as FAILED: file did not match known printable formats (PDF/PNG/JPEG/ZPL).`, 'error');
      return context;
    }

    // If file looks like ZPL but extension isn't .zpl, normalize the filename
    let finalOutputPath = outputFilePath;
    if (looksLikeZpl && ext.toLowerCase() !== '.zpl') {
      const zplName = `printed_label.zpl`;
      finalOutputPath = path.join(jobDirs.output, zplName);
    }

    // 4. Copy printable file to output directory for persistent history
    fs.copyFileSync(context.currentFilePath, finalOutputPath);
    await logJob(context.jobId, `Persisted final printable file to output folder: ${finalOutputPath}`);

    // 4. Send to physical/system printer if autoPrint is enabled
    if (config.autoPrint) {
      // If this is a preview-only job, skip actual printing
      if (job.destinationPrinter === '__PREVIEW__') {
        await logJob(context.jobId, `Preview job - skipping physical print.`);
      } else {
      const printerBackend = await getPrinterBackend();
      const targetPrinter = job.destinationPrinter || config.defaultPrinter;
      
      await logJob(context.jobId, `Sending document to printer: ${targetPrinter}...`);
      
      try {
        await printerBackend.print(finalOutputPath, { printerName: targetPrinter });
        await logJob(context.jobId, `Sent file to printer "${targetPrinter}" successfully`);
      } catch (err: any) {
        await logJob(context.jobId, `Failed to print document: ${err.message}`, 'error');
        throw err;
      }
      }
    } else {
      await logJob(context.jobId, `Auto-print is disabled. Skipped sending document to system printer.`);
    }

    // 5. Complete the job
    await db.update(jobs)
      .set({ status: 'COMPLETED', updatedAt: new Date() })
      .where(eq(jobs.id, context.jobId));

    await logJob(context.jobId, `Job completed successfully`);

    return context;
  }
}
