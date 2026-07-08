import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getDb } from '../database/db.js';
import { jobs, jobLogs } from '../database/schema.js';
import { ensureJobDirs } from '../storage/Workspace.js';
import { jobQueue } from './JobQueue.js';
import { logJob } from '../utils/logger.js';
import { eq } from 'drizzle-orm';

export interface CreateJobInput {
  originalName: string;
  fileBuffer: Buffer;
  destinationPrinter: string;
}

export class JobManager {
  /**
   * Creates a new print job, writes the file to the workspace, inserts a database entry, and starts processing.
   */
  async createJob(input: CreateJobInput): Promise<string> {
    const jobId = crypto.randomUUID();
    const dirs = ensureJobDirs(jobId);
    
    const originalPath = path.join(dirs.original, input.originalName);
    
    // Write buffer directly to workspace folder
    fs.writeFileSync(originalPath, input.fileBuffer);
    
    const db = getDb();
    
    await db.insert(jobs).values({
      id: jobId,
      parentId: null,
      status: 'QUEUED',
      originalName: input.originalName,
      inputFormat: 'UNKNOWN',
      outputFormat: 'UNKNOWN',
      destinationPrinter: input.destinationPrinter,
      workspacePath: originalPath,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    
    await logJob(jobId, `Job initialized in database. Original file saved.`);
    
    // Trigger queue processing (asynchronous)
    jobQueue.trigger();
    
    return jobId;
  }

  /**
   * Retrieves the job details along with its processing logs from the database.
   */
  async getJobStatus(jobId: string) {
    const db = getDb();
    
    const [job] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, jobId));
      
    if (!job) {
      return null;
    }
    
    const logs = await db
      .select()
      .from(jobLogs)
      .where(eq(jobLogs.jobId, jobId))
      .orderBy(jobLogs.id); // Show logs chronologically
      
    return {
      ...job,
      logs: logs.map((l) => ({
        message: l.message,
        timestamp: l.timestamp,
      })),
    };
  }
}

export const jobManager = new JobManager();
