import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { getConfig } from '../config/config.js';
import * as schema from './schema.js';

let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;
let sqliteInstance: DatabaseSync | null = null;

export function initDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (dbInstance) return dbInstance;

  const config = getConfig();
  const workspacePath = path.resolve(config.workspace);

  // Ensure workspace directory exists
  if (!fs.existsSync(workspacePath)) {
    fs.mkdirSync(workspacePath, { recursive: true });
  }

  const dbPath = path.join(workspacePath, 'database.sqlite');
  
  // Open node:sqlite database connection
  sqliteInstance = new DatabaseSync(dbPath);

  // Enable foreign keys
  sqliteInstance.exec('PRAGMA foreign_keys = ON;');

  // Create tables if they do not exist
  sqliteInstance.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY NOT NULL,
      parent_id TEXT,
      status TEXT DEFAULT 'QUEUED' NOT NULL,
      original_name TEXT NOT NULL,
      input_format TEXT DEFAULT 'UNKNOWN' NOT NULL,
      output_format TEXT DEFAULT 'UNKNOWN' NOT NULL,
      destination_printer TEXT NOT NULL,
      workspace_path TEXT NOT NULL,
      error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS job_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      job_id TEXT NOT NULL,
      message TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON UPDATE NO ACTION ON DELETE CASCADE
    );
    
    CREATE INDEX IF NOT EXISTS idx_job_logs_job_id ON job_logs(job_id);
  `);

  dbInstance = drizzle(async (sql, params, method) => {
    if (!sqliteInstance) return { rows: [] };
    const stmt = sqliteInstance.prepare(sql);
    const result = { rows: [] as any[] };
    try {
      const mappedParams = params.map(p => {
        if (p === undefined) return null;
        if (typeof p === 'boolean') return p ? 1 : 0;
        if (p instanceof Date) return p.getTime();
        if (p && typeof p === 'object' && p.$Brand === 'DateBuilder') {
          const num = p.val instanceof Date ? p.val.getTime() : new Date(p.val).getTime();
          return isNaN(num) ? null : num;
        }
        return p;
      });
      if (method === 'run') {
        stmt.run(...mappedParams);
      } else if (method === 'all' || method === 'values') {
        const rawRows = stmt.all(...mappedParams) as any[];
        result.rows = rawRows.map(row => Object.values(row));
      } else if (method === 'get') {
        const row = stmt.get(...mappedParams);
        if (row) result.rows = [Object.values(row)];
      }
    } catch (err) {
      console.error('Database query error:', err);
      console.error('SQL:', sql);
      throw err;
    }
    
    return result;
  }, { schema });
  return dbInstance;
}

export function getDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (!dbInstance) {
    return initDb();
  }
  return dbInstance;
}

export function closeDb(): void {
  if (sqliteInstance) {
    if (typeof sqliteInstance.close === 'function') {
      sqliteInstance.close();
    }
    sqliteInstance = null;
    dbInstance = null;
  }
}
