import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import AdmZip from 'adm-zip';
// @ts-ignore
import { unrarSync } from 'unrar-js';
import { PipelineStep, PipelineContext } from '../PipelineStep.js';
import { getDb } from '../../database/db.js';
import { jobs } from '../../database/schema.js';
import { eq } from 'drizzle-orm';
import { logJob } from '../../utils/logger.js';
import { ensureJobDirs } from '../../storage/Workspace.js';

export class ExtractionStep implements PipelineStep {
  name = 'EXTRACTING';

  async execute(context: PipelineContext): Promise<PipelineContext> {
    const db = getDb();
    
    // 1. Update job status to EXTRACTING
    await db.update(jobs)
      .set({ status: 'EXTRACTING', updatedAt: new Date() })
      .where(eq(jobs.id, context.jobId));
      
    await logJob(context.jobId, `Starting extraction step`);

    // 2. Fetch the job details
    const [job] = await db.select().from(jobs).where(eq(jobs.id, context.jobId));
    if (!job) {
      throw new Error(`Job ${context.jobId} not found in database`);
    }

    if (job.inputFormat !== 'ZIP' && job.inputFormat !== 'RAR') {
      await logJob(context.jobId, `Job is not an archive (Format: ${job.inputFormat}). Skipping extraction.`);
      return context;
    }

    const jobDirs = ensureJobDirs(context.jobId);
    const extractedDir = jobDirs.extracted;

    await logJob(context.jobId, `Extracting ${job.inputFormat} archive to ${extractedDir}...`);

    try {
      if (job.inputFormat === 'ZIP') {
        const zip = new AdmZip(context.currentFilePath);
        zip.extractAllTo(extractedDir, true);
      } else {
        // RAR format
        unrarSync(context.currentFilePath, extractedDir);
      }
    } catch (err: any) {
      throw new Error(`Failed to extract ${job.inputFormat} archive: ${err.message}`);
    }

    // 3. Scan extracted directory recursively for files
    const extractedFiles = this.getAllFilesRecursive(extractedDir);
    await logJob(context.jobId, `Extracted ${extractedFiles.length} files from archive`);

    if (extractedFiles.length === 0) {
      throw new Error('Archive is empty; no files extracted');
    }

    // Log what files were extracted (for debugging)
    for (const file of extractedFiles) {
      const ext = path.extname(file).toLowerCase();
      await logJob(context.jobId, `  • ${file} (ext: ${ext})`);
    }

    // Filter to only supported printable formats
    const allowedExts = ['.pdf', '.zpl', '.png', '.jpg', '.jpeg', '.bmp', '.gif', '.tif', '.tiff', '.txt', '.label'];
    const filtered = extractedFiles.filter(p => allowedExts.includes(path.extname(p).toLowerCase()));
    
    // Log which files were rejected
    const rejected = extractedFiles.filter(p => !allowedExts.includes(path.extname(p).toLowerCase()));
    if (rejected.length > 0) {
      for (const file of rejected) {
        const ext = path.extname(file).toLowerCase();
        await logJob(context.jobId, `  ✗ REJECTED: ${file} (ext: ${ext} not in allowed list)`, 'warn');
      }
    }
    
    await logJob(context.jobId, `Filtered extracted files to ${filtered.length} supported items`);

    if (filtered.length === 0) {
      await logJob(context.jobId, 'No supported files found inside archive; marking job FAILED', 'error');
      await db.update(jobs)
        .set({ status: 'FAILED', updatedAt: new Date() })
        .where(eq(jobs.id, context.jobId));
      return context;
    }

    // 4. Create child jobs for each extracted file
    for (const relPath of filtered) {
      const sourceFilePath = path.join(extractedDir, relPath);
      const filename = path.basename(relPath);
      const childJobId = crypto.randomUUID();
      
      // Ensure target folders for child job exist
      const childDirs = ensureJobDirs(childJobId);
      const childDestPath = path.join(childDirs.original, filename);
      
      // Copy file to child workspace
      fs.copyFileSync(sourceFilePath, childDestPath);

      // Determine inputFormat from extension & content
      const ext = path.extname(filename).toLowerCase();
      let inputFormat = 'UNKNOWN';
      if (ext === '.pdf') inputFormat = 'PDF';
      else if (ext === '.zpl') inputFormat = 'ZPL';
      else if (['.png', '.jpg', '.jpeg', '.bmp', '.gif', '.tif', '.tiff'].includes(ext)) inputFormat = 'IMAGE';
      else if (ext === '.txt' || ext === '.label') {
        // For .txt or .label files, try to detect ZPL content
        try {
          const fileContent = fs.readFileSync(sourceFilePath, 'utf-8');
          if (/\^XA|\^XZ/.test(fileContent)) {
            inputFormat = 'ZPL';
            await logJob(context.jobId, `  Detected ZPL content in ${filename}`);
          }
        } catch (err) {
          // ignore read errors
        }
      }

      // Register child job in database as QUEUED
      await db.insert(jobs).values({
        id: childJobId,
        parentId: context.jobId,
        status: 'QUEUED',
        originalName: filename,
        inputFormat: inputFormat,
        outputFormat: 'UNKNOWN',
        destinationPrinter: job.destinationPrinter,
        workspacePath: childDestPath,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await logJob(
        context.jobId,
        `Created child job ${childJobId} for extracted file: ${relPath} (format: ${inputFormat})`
      );
      
      await logJob(
        childJobId,
        `Job queued. Inherited from parent archive job: ${context.jobId}`
      );
    }

    // 5. Update the parent job status to COMPLETED since its children are now queued
    await db.update(jobs)
      .set({ status: 'COMPLETED', updatedAt: new Date() })
      .where(eq(jobs.id, context.jobId));
      
    await logJob(context.jobId, `Archive extraction complete. Child jobs spawned.`);

    return context;
  }

  private getAllFilesRecursive(dir: string, baseDir = dir): string[] {
    let results: string[] = [];
    if (!fs.existsSync(dir)) return [];
    
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat && stat.isDirectory()) {
        results = results.concat(this.getAllFilesRecursive(filePath, baseDir));
      } else {
        results.push(path.relative(baseDir, filePath));
      }
    }
    return results;
  }
}
