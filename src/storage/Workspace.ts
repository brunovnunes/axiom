import fs from 'node:fs';
import path from 'node:path';
import { getConfig } from '../config/config.js';

export function getJobsBaseDir(): string {
  const config = getConfig();
  return path.resolve(config.workspace, 'jobs');
}

export function getJobDir(jobId: string): string {
  return path.join(getJobsBaseDir(), jobId);
}

export function getJobSubdir(jobId: string, subdir: 'original' | 'extracted' | 'processed' | 'output'): string {
  return path.join(getJobDir(jobId), subdir);
}

export function ensureJobDirs(jobId: string): {
  base: string;
  original: string;
  extracted: string;
  processed: string;
  output: string;
} {
  const base = getJobDir(jobId);
  const dirs = {
    base,
    original: path.join(base, 'original'),
    extracted: path.join(base, 'extracted'),
    processed: path.join(base, 'processed'),
    output: path.join(base, 'output'),
  };

  for (const dir of Object.values(dirs)) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  return dirs;
}
