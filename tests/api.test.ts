import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { routes } from '../src/api/routes.js';
import { initDb, closeDb } from '../src/database/db.js';
import { jobManager } from '../src/core/JobManager.js';
import { getPrinterBackend } from '../src/printer/Printer.js';

// Mock dependencies
vi.mock('../src/core/JobManager.js', () => ({
  jobManager: {
    createJob: vi.fn().mockResolvedValue('test-job-id'),
    getJobStatus: vi.fn().mockResolvedValue({ id: 'test-job-id', status: 'COMPLETED' }),
  }
}));

vi.mock('../src/core/JobQueue.js', () => ({
  jobQueue: {
    trigger: vi.fn().mockResolvedValue(undefined),
  }
}));

vi.mock('../src/printer/Printer.js', () => ({
  getPrinterBackend: vi.fn().mockResolvedValue({
    listPrinters: vi.fn().mockResolvedValue([
      { name: 'Printer_1', isDefault: true, systemName: 'Printer_1' }
    ]),
  })
}));

describe('Fastify API Routes', () => {
  const fastify = Fastify();

  beforeAll(async () => {
    initDb();
    await fastify.register(multipart);
    await fastify.register(routes, { prefix: '/api' });
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
    closeDb();
  });

  it('GET /api/printers should return list of printers', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/api/printers',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.printers).toBeDefined();
    expect(body.printers.length).toBe(1);
    expect(body.printers[0].name).toBe('Printer_1');
  });

  it('GET /api/jobs/:id should return job status', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/api/jobs/test-job-id',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.status).toBe('COMPLETED');
    expect(jobManager.getJobStatus).toHaveBeenCalledWith('test-job-id');
  });
});
