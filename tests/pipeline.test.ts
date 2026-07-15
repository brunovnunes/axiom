import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { initDb, getDb } from '../src/database/db.js';
import { jobManager } from '../src/core/JobManager.js';
import { jobs } from '../src/database/schema.js';
import { eq } from 'drizzle-orm';
import AdmZip from 'adm-zip';

// Mock printer and renderer
vi.mock('../src/printer/Printer.js', () => ({
  getPrinterBackend: async () => ({
    listPrinters: async () => [{ name: 'TEST_PRINTER', systemName: 'TEST_PRINTER', isDefault: true }],
    print: async () => { /* no-op */ },
  }),
}));

vi.mock('../src/converters/implementations/LabelaryRenderer.js', () => ({
  LabelaryRenderer: class {
    async render() {
      return Buffer.from('%PDFMockRenderedPDF');
    }
  },
}));

describe('Job Pipeline Integration', () => {
  beforeAll(() => {
    // Set mock environment
    process.env.NODE_ENV = 'test';
    // Initialize database in a test workspace
    const mockWorkspace = './data-test';
    if (fs.existsSync(mockWorkspace)) {
      fs.rmSync(mockWorkspace, { recursive: true, force: true });
    }
    
    // Inject test workspace path to config
    vi.mock('../src/config/config.js', () => ({
      getConfig: () => ({
        defaultPrinter: 'TEST_PRINTER',
        renderer: 'labelary',
        autoPrint: true,
        shopeeRasterScale: 3,
        workspace: './data-test',
        labelary: { baseUrl: 'http://mock-labelary' },
      }),
      loadConfig: () => ({}),
      getLabelProfiles: () => ({}),
    }));

    initDb();
  });

  it('should process a PDF job completely', async () => {
    const pdfContent = Buffer.from('%PDF-1.4 Fake PDF Data');
    const jobId = await jobManager.createJob({
      originalName: 'label.pdf',
      fileBuffer: pdfContent,
      destinationPrinter: 'TEST_PRINTER',
    });

    // Wait a brief moment for the async queue processing to finish
    await new Promise((resolve) => setTimeout(resolve, 500));

    const status = await jobManager.getJobStatus(jobId);
    expect(status).not.toBeNull();
    expect(status?.status).toBe('COMPLETED');
    expect(status?.inputFormat).toBe('PDF');
    expect(status?.outputFormat).toBe('PDF');
    expect(status?.logs.length).toBeGreaterThan(0);
    
    // Check output file was persisted
    const outputDir = path.join('./data-test/jobs', jobId, 'output');
    expect(fs.existsSync(path.join(outputDir, 'printed_label.pdf'))).toBe(true);
  });

  it('should process a ZPL Shopee job, applying transformations and conversions', async () => {
    const zplContent = Buffer.from('^XA\n~DGR:DEMO.GRF,10,2,FFFF\n^FO0,0^XGR:DEMO.GRF,1,1^FS\n^XZ');
    
    const jobId = await jobManager.createJob({
      originalName: 'shopee_label.zpl',
      fileBuffer: zplContent,
      destinationPrinter: 'TEST_PRINTER',
    });

    await new Promise((resolve) => setTimeout(resolve, 500));

    const status = await jobManager.getJobStatus(jobId);
    expect(status).not.toBeNull();
    expect(status?.status).toBe('COMPLETED');
    expect(status?.inputFormat).toBe('ZPL');
    expect(status?.outputFormat).toBe('PDF');
    
    // Verify transformed ZPL was written
    const processedDir = path.join('./data-test/jobs', jobId, 'processed');
    const files = fs.readdirSync(processedDir);
    const transformedFile = files.find(f => f.startsWith('transformed_'));
    expect(transformedFile).toBeDefined();
    
    const transformedZpl = fs.readFileSync(path.join(processedDir, transformedFile!), 'utf-8');
    expect(transformedZpl).toContain('^FO10,10');
    expect(transformedZpl).toContain('^XGR:DEMO.GRF,3,3');
  });

  it('should extract a ZIP job and process child jobs', async () => {
    // Create a mock zip containing two files
    const zip = new AdmZip();
    zip.addFile('label1.pdf', Buffer.from('%PDF-1.4 First Label'));
    zip.addFile('label2.zpl', Buffer.from('^XA^FO0,0^FDSecond Label^FS^XZ'));
    
    const zipBuffer = zip.toBuffer();
    const parentJobId = await jobManager.createJob({
      originalName: 'labels.zip',
      fileBuffer: zipBuffer,
      destinationPrinter: 'TEST_PRINTER',
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Parent job (archive) should be marked completed
    const parentStatus = await jobManager.getJobStatus(parentJobId);
    expect(parentStatus?.status).toBe('COMPLETED');

    // Retrieve child jobs
    const db = getDb();
    const children = await db.select().from(jobs).where(eq(jobs.parentId, parentJobId));
    expect(children).toHaveLength(2);

    // Verify child statuses are completed after queue ran
    for (const child of children) {
      const childStatus = await jobManager.getJobStatus(child.id);
      expect(childStatus?.status).toBe('COMPLETED');
      expect(['PDF', 'ZPL']).toContain(childStatus?.inputFormat);
    }
  });
});
