import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

export const jobStatuses = [
  'QUEUED',
  'IMPORTING',
  'EXTRACTING',
  'DETECTING',
  'TRANSFORMING',
  'CONVERTING',
  'READY_TO_PRINT',
  'PRINTING',
  'COMPLETED',
  'FAILED'
] as const;

export type JobStatus = typeof jobStatuses[number];

export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(),
  parentId: text('parent_id'),
  status: text('status', { enum: jobStatuses }).notNull().default('QUEUED'),
  originalName: text('original_name').notNull(),
  inputFormat: text('input_format').notNull().default('UNKNOWN'), // ZPL, PDF, ZIP, RAR, UNKNOWN
  outputFormat: text('output_format').notNull().default('UNKNOWN'), // ZPL, PDF, UNKNOWN
  destinationPrinter: text('destination_printer').notNull(),
  workspacePath: text('workspace_path').notNull(),
  error: text('error'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const jobLogs = sqliteTable('job_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  jobId: text('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  message: text('message').notNull(),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// Define relations
export const jobsRelations = relations(jobs, ({ many }) => ({
  logs: many(jobLogs),
}));

export const jobLogsRelations = relations(jobLogs, ({ one }) => ({
  job: one(jobs, {
    fields: [jobLogs.jobId],
    references: [jobs.id],
  }),
}));
