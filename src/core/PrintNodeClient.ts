import { getConfig } from '../config/config.js';
import { getPrinterBackend } from '../printer/Printer.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export class PrintNodeClient {
  private orchestratorUrl: string;
  private isRunning: boolean = false;
  private syncInterval: NodeJS.Timeout | null = null;
  private processingJobs: Set<string> = new Set();

  constructor() {
    const config = getConfig();
    this.orchestratorUrl = config.orchestratorUrl.replace(/\/$/, '');
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(`[PrintNode] Started. Orchestrator URL: ${this.orchestratorUrl}`);
    
    // Initial sync
    this.syncPrinters();
    this.pollJobs();

    // Setup periodic polling
    this.syncInterval = setInterval(() => {
      this.syncPrinters();
      this.pollJobs();
    }, 10000); // every 10 seconds
  }

  public stop() {
    this.isRunning = false;
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    console.log('[PrintNode] Stopped.');
  }

  private async syncPrinters() {
    try {
      const backend = await getPrinterBackend();
      const printers = await backend.listPrinters();
      
      const res = await fetch(`${this.orchestratorUrl}/api/printers/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printers })
      });
      
      if (!res.ok) {
        console.error(`[PrintNode] Failed to register printers: ${res.status}`);
      }
    } catch (err: any) {
      console.error(`[PrintNode] Error syncing printers: ${err.message}`);
    }
  }

  private async pollJobs() {
    try {
      const res = await fetch(`${this.orchestratorUrl}/api/jobs/pending-print`);
      if (!res.ok) return;
      
      const data = await res.json();
      const jobs = data.jobs || [];

      for (const job of jobs) {
        if (this.processingJobs.has(job.id)) continue;
        this.processingJobs.add(job.id);
        
        // Process asynchronously
        this.processJob(job).finally(() => {
          this.processingJobs.delete(job.id);
        });
      }
    } catch (err: any) {
      console.error(`[PrintNode] Error polling jobs: ${err.message}`);
    }
  }

  private async processJob(job: any) {
    console.log(`[PrintNode] Processing job ${job.id} for printer ${job.destinationPrinter}`);
    let tempPath = '';
    try {
      const buffer = Buffer.from(job.pdfBase64, 'base64');
      const tempDir = os.tmpdir();
      tempPath = path.join(tempDir, `print_node_${job.id}_${job.filename}`);
      fs.writeFileSync(tempPath, buffer);

      const backend = await getPrinterBackend();
      // If it's __PREVIEW__, we shouldn't actually print, but just pretend it printed.
      if (job.destinationPrinter !== '__PREVIEW__') {
        await backend.print(tempPath, { printerName: job.destinationPrinter });
      }

      await fetch(`${this.orchestratorUrl}/api/jobs/${job.id}/printed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true })
      });
      console.log(`[PrintNode] Successfully printed job ${job.id}`);
    } catch (err: any) {
      console.error(`[PrintNode] Failed to print job ${job.id}: ${err.message}`);
      await fetch(`${this.orchestratorUrl}/api/jobs/${job.id}/printed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: err.message })
      });
    } finally {
      if (tempPath && fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    }
  }
}

export const printNodeClient = new PrintNodeClient();
