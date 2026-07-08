import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { jobManager } from '../core/JobManager.js';
import { jobQueue } from '../core/JobQueue.js';
import { getPrinterBackend } from '../printer/Printer.js';
import { getDb } from '../database/db.js';
import { jobs } from '../database/schema.js';
import { desc } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';
import { ensureJobDirs } from '../storage/Workspace.js';
import { eq } from 'drizzle-orm';

export async function routes(fastify: FastifyInstance) {
  
  // POST /jobs - Create a new print job
  fastify.post('/jobs', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: 'File is required' });
    }

    const fileBuffer = await data.toBuffer();
    
    // We expect printer destination either in fields or query
    const printerField = data.fields.printer;
    let destinationPrinter = 'default';
    if (printerField && 'value' in printerField) {
      destinationPrinter = String(printerField.value);
    }
    
    const jobId = await jobManager.createJob({
      originalName: data.filename,
      fileBuffer,
      destinationPrinter,
    });
    
    await jobQueue.trigger();
    
    return reply.status(202).send({
      message: 'Job created and queued successfully',
      jobId
    });
  });

  // GET /jobs - List job history
  fastify.get('/jobs', async (request: FastifyRequest, reply: FastifyReply) => {
    const db = getDb();
    
    // Optional pagination could be added here
    const history = await db.select()
      .from(jobs)
      .orderBy(desc(jobs.createdAt))
      .limit(50);
      
    return reply.send({ jobs: history });
  });

  // GET /jobs/:id - Get specific job details
  fastify.get('/jobs/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;
    
    try {
      const status = await jobManager.getJobStatus(id);
      if (!status) {
        return reply.status(404).send({ error: 'Job not found' });
      }
      return reply.send(status);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // GET /printers - List available printers
  fastify.get('/printers', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const printerBackend = await getPrinterBackend();
      const printers = await printerBackend.listPrinters();
      return reply.send({ printers });
    } catch (err: any) {
      return reply.status(500).send({ error: 'Failed to list printers', details: err.message });
    }
  });

  // POST /preview - Upload a file and process it (but do not auto-print). Returns jobId
  fastify.post('/preview', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = await request.file();
    if (!data) return reply.status(400).send({ error: 'File is required' });

    const fileBuffer = await data.toBuffer();
    // Create job with special destination to avoid printing
    const destinationPrinter = '__PREVIEW__';

    const jobId = await jobManager.createJob({
      originalName: data.filename,
      fileBuffer,
      destinationPrinter,
    });

    // Trigger queue
    await jobQueue.trigger();

    return reply.status(202).send({ jobId });
  });

  // GET /jobs/:id/outputs - Return processed outputs (base64) for a job (parent or single)
  fastify.get('/jobs/:id/outputs', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;
    try {
      const db = getDb();
      // Find child jobs (processed items)
      const children = await db.select().from(jobs).where(eq(jobs.parentId, id));

      let targets = children;
      // If no children, maybe the job itself produced output
      if (targets.length === 0) {
        const [self] = await db.select().from(jobs).where(eq(jobs.id, id));
        if (!self) return reply.status(404).send({ error: 'Job not found' });
        targets = [self];
      }

      const results = [];
      for (const j of targets) {
        const dirs = ensureJobDirs(j.id);
        // Prefer processed/rendered_label.pdf
        const processedPdf = path.join(dirs.processed, 'rendered_label.pdf');
        const outputFiles = fs.existsSync(dirs.output) ? fs.readdirSync(dirs.output) : [];

        let filePath = null;
        if (fs.existsSync(processedPdf)) filePath = processedPdf;
        else if (outputFiles.length > 0) filePath = path.join(dirs.output, outputFiles[0]);

        // Do not fall back to the original workspace file here.
        // For preview/polled archive jobs, returning the raw input can make the
        // extension believe the printable artifact is a .txt instead of the
        // converted PDF. If no processed output exists yet, the caller should
        // keep polling.

        if (!filePath || !fs.existsSync(filePath)) {
          continue;
        }

        const buf = fs.readFileSync(filePath);
        const ext = path.extname(filePath).toLowerCase();
        let mime = 'application/octet-stream';
        if (ext === '.pdf') mime = 'application/pdf';
        else if (ext === '.zpl' || ext === '.txt') mime = 'text/plain';
        else if (ext === '.png') mime = 'image/png';
        else if (ext === '.jpg' || ext === '.jpeg') mime = 'image/jpeg';

        results.push({
          jobId: j.id,
          originalName: j.originalName,
          filename: path.basename(filePath),
          mime,
          base64: buf.toString('base64'),
        });
      }

      return reply.send({ outputs: results });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}
