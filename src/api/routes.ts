import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { jobManager } from '../core/JobManager.js';
import { jobQueue } from '../core/JobQueue.js';
import { getPrinterBackend } from '../printer/Printer.js';
import { getDb } from '../database/db.js';
import { jobs } from '../database/schema.js';
import { desc } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ensureJobDirs } from '../storage/Workspace.js';
import { eq } from 'drizzle-orm';
import { getConfig } from '../config/config.js';

export async function routes(fastify: FastifyInstance) {
  
  // POST /jobs - Create a new print job
  fastify.post('/jobs', async (request: FastifyRequest, reply: FastifyReply) => {
    const config = getConfig();
    if (config.role === 'print_node') {
      return reply.status(403).send({
        error: `This instance is running in 'print_node' mode. Submit print jobs to the Orchestrator at ${config.orchestratorUrl}`
      });
    }

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

  // GET /printers - List available printers (local + node registered)
  fastify.get('/printers', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const printerBackend = await getPrinterBackend();
      const localPrinters = await printerBackend.listPrinters();
      const nodePrinters = (global as any).registeredNodePrinters || [];
      
      // Merge unique printers
      const allPrinters = [...localPrinters];
      for (const np of nodePrinters) {
        if (!allPrinters.find(p => p.name === np.name)) {
          allPrinters.push({ ...np, isNodePrinter: true });
        }
      }

      return reply.send({ printers: allPrinters });
    } catch (err: any) {
      return reply.status(500).send({ error: 'Failed to list printers', details: err.message });
    }
  });

  // POST /preview - Upload a file and process it (but do not auto-print). Returns jobId
  fastify.post('/preview', async (request: FastifyRequest, reply: FastifyReply) => {
    const config = getConfig();
    if (config.role === 'print_node') {
      return reply.status(403).send({
        error: `This instance is running in 'print_node' mode. Submit preview jobs to the Orchestrator at ${config.orchestratorUrl}`
      });
    }

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

      const parentStatus = await jobManager.getJobStatus(id);
      const complete = parentStatus ? (parentStatus.status === 'COMPLETED' || parentStatus.status === 'FAILED') : false;

      return reply.send({ outputs: results, complete });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // POST /printers/register - For Print Nodes to register their printers with the Orchestrator
  fastify.post('/printers/register', async (request: FastifyRequest, reply: FastifyReply) => {
    const body: any = request.body;
    if (body && body.printers) {
      const nodeUrl = body.nodeUrl || '';
      const registeredNodes: Array<{ nodeUrl: string; printers: any[]; lastSeen: number }> = (global as any).registeredNodes || [];
      
      // Update or add node entry
      const existingIdx = registeredNodes.findIndex(n => n.nodeUrl === nodeUrl);
      const entry = { nodeUrl, printers: body.printers, lastSeen: Date.now() };
      if (existingIdx !== -1) {
        registeredNodes[existingIdx] = entry;
      } else {
        registeredNodes.push(entry);
      }
      (global as any).registeredNodes = registeredNodes;

      // Keep legacy array updated for backward compatibility
      const allNodePrinters: any[] = [];
      for (const node of registeredNodes) {
        for (const p of node.printers) {
          allNodePrinters.push({ ...p, nodeUrl: node.nodeUrl });
        }
      }
      (global as any).registeredNodePrinters = allNodePrinters;

      return reply.send({ success: true, registered: body.printers.length });
    }
    return reply.status(400).send({ error: 'Invalid payload' });
  });

  // GET /printers/node - Get registered printers from nodes
  fastify.get('/printers/node', async (request: FastifyRequest, reply: FastifyReply) => {
    const printers = (global as any).registeredNodePrinters || [];
    return reply.send({ printers });
  });

  // POST /node/print - Endpoint on Node to receive direct push print requests from Orchestrator
  fastify.post('/node/print', async (request: FastifyRequest, reply: FastifyReply) => {
    const body: any = request.body || {};
    const { id, destinationPrinter, filename, pdfBase64, originalName } = body;
    
    if (!pdfBase64) {
      return reply.status(400).send({ error: 'pdfBase64 is required' });
    }

    const tempDir = os.tmpdir();
    const tempPath = path.join(tempDir, `push_${id || Date.now()}_${filename || 'label.pdf'}`);
    
    try {
      const buffer = Buffer.from(pdfBase64, 'base64');
      fs.writeFileSync(tempPath, buffer);

      if (destinationPrinter !== '__PREVIEW__') {
        const backend = await getPrinterBackend();
        await backend.print(tempPath, { printerName: destinationPrinter });
      }

      return reply.send({ success: true, jobId: id });
    } catch (err: any) {
      fastify.log.error(`Direct print failed for job ${id}: ${err.message}`);
      return reply.status(500).send({ error: err.message });
    } finally {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    }
  });

  // GET /jobs/pending-print - For Print Nodes to fetch jobs that are READY_TO_PRINT
  fastify.get('/jobs/pending-print', async (request: FastifyRequest, reply: FastifyReply) => {
    const db = getDb();
    const pending = await db.select().from(jobs)
      .where(eq(jobs.status, 'READY_TO_PRINT'))
      .orderBy(jobs.createdAt)
      .limit(10);
      
    // Send only the necessary info
    const jobsToSend = pending.map(j => {
      const dirs = ensureJobDirs(j.id);
      let pdfBase64 = null;
      let filename = 'rendered_label.pdf';
      const pdfPath = path.join(dirs.processed, 'rendered_label.pdf');
      
      if (fs.existsSync(pdfPath)) {
        pdfBase64 = fs.readFileSync(pdfPath).toString('base64');
      } else {
        // Look in output
        const outputFiles = fs.existsSync(dirs.output) ? fs.readdirSync(dirs.output) : [];
        if (outputFiles.length > 0) {
          const outPath = path.join(dirs.output, outputFiles[0]);
          pdfBase64 = fs.readFileSync(outPath).toString('base64');
          filename = outputFiles[0];
        }
      }

      return {
        id: j.id,
        destinationPrinter: j.destinationPrinter,
        originalName: j.originalName,
        filename,
        pdfBase64
      };
    }).filter(j => j.pdfBase64 !== null);

    return reply.send({ jobs: jobsToSend });
  });

  // POST /jobs/:id/printed - For Print Nodes to acknowledge successful printing
  fastify.post('/jobs/:id/printed', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;
    const body: any = request.body || {};
    const db = getDb();
    
    if (body.error) {
      await db.update(jobs)
        .set({ status: 'FAILED', error: body.error, updatedAt: new Date() })
        .where(eq(jobs.id, id));
    } else {
      await db.update(jobs)
        .set({ status: 'COMPLETED', updatedAt: new Date() })
        .where(eq(jobs.id, id));
    }
    
    return reply.send({ success: true });
  });
}
