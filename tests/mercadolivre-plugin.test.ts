import { describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { MercadoLivrePlugin } from '../src/plugins/mercadolivre/MercadoLivrePlugin.js';

describe('MercadoLivrePlugin', () => {
  const plugin = new MercadoLivrePlugin();

  const samplePdf = path.resolve('data/jobs/5548f2a7-9c32-400f-94d3-d69d376d8a76/original/CD9EEB9AAE7D8EA19C226CBE9F0448F2_labels.pdf');
  const sample16PagesPdf = path.resolve('data/jobs/b8bb2a51-43a2-4cde-9f12-0a481c2f2d51/original/19665CC2954E28488027E986CA2730C7_labels.pdf');
  const sampleNoDanfePdf = path.resolve('data/jobs/78480a0b-6eb9-47c8-92d4-02e4ce443150/original/6B69C03050FA773149B544AB67BF57F8_labels.pdf');

  it('should detect Mercado Livre label by filename', async () => {
    const isMl = await plugin.detect('', 'CD9EEB9AAE7D8EA19C226CBE9F0448F2_labels.pdf', samplePdf);
    expect(isMl).toBe(true);
  });

  it('should detect Mercado Livre label by content/filePath even with generic name', async () => {
    const isMl = await plugin.detect('', 'document.pdf', samplePdf);
    expect(isMl).toBe(true);
  });

  it('should not detect Shopee ZPL as Mercado Livre', async () => {
    const isMl = await plugin.detect('~DGR:DEMO.GRF^XA^FO0,0^XGR:DEMO.GRF^FS^XZ', 'thermal_zpl_shipping_label.txt');
    expect(isMl).toBe(false);
  });

  it('should condense a 2-page (Label + DANFE) PDF into a 1-page condensed label when condenseDanfe is true', async () => {
    const buffer = await plugin.transform('', {
      filePath: samplePdf,
      jobId: 'test-job-ml',
      condenseDanfe: true,
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);

    // Save temporary PDF to verify with pdfinfo
    const tmpPdf = path.resolve('/tmp/test_vitest_ml_condensed.pdf');
    fs.writeFileSync(tmpPdf, buffer);

    const info = execFileSync('pdfinfo', [tmpPdf], { encoding: 'utf-8' });
    const pagesMatch = info.match(/Pages:\s+(\d+)/);
    expect(pagesMatch).not.toBeNull();
    expect(Number(pagesMatch![1])).toBe(1);

    // Verify dimensions (100x150 mm = ~283x425 pts)
    const sizeMatch = info.match(/Page size:\s+([\d.]+)\s+x\s+([\d.]+)/);
    expect(sizeMatch).not.toBeNull();
    const width = Number(sizeMatch![1]);
    const height = Number(sizeMatch![2]);
    expect(width).toBeCloseTo(283.46, 0);
    expect(height).toBeCloseTo(425.20, 0);

    fs.unlinkSync(tmpPdf);
  }, 15000);

  it('should return original multi-page PDF unchanged when condenseDanfe is false', async () => {
    const buffer = await plugin.transform('', {
      filePath: samplePdf,
      jobId: 'test-job-ml-off',
      condenseDanfe: false,
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);

    const tmpPdf = path.resolve('/tmp/test_vitest_ml_uncondensed.pdf');
    fs.writeFileSync(tmpPdf, buffer);

    const info = execFileSync('pdfinfo', [tmpPdf], { encoding: 'utf-8' });
    const pagesMatch = info.match(/Pages:\s+(\d+)/);
    expect(pagesMatch).not.toBeNull();
    expect(Number(pagesMatch![1])).toBe(2);

    fs.unlinkSync(tmpPdf);
  }, 15000);

  it('should condense a 16-page PDF (8 pairs of Label+DANFE) into an 8-page PDF', async () => {
    const buffer = await plugin.transform('', {
      filePath: sample16PagesPdf,
      jobId: 'test-job-ml-16',
      condenseDanfe: true,
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);

    const tmpPdf = path.resolve('/tmp/test_vitest_ml_16_condensed.pdf');
    fs.writeFileSync(tmpPdf, buffer);

    const info = execFileSync('pdfinfo', [tmpPdf], { encoding: 'utf-8' });
    const pagesMatch = info.match(/Pages:\s+(\d+)/);
    expect(pagesMatch).not.toBeNull();
    expect(Number(pagesMatch![1])).toBe(8);

    fs.unlinkSync(tmpPdf);
  }, 15000);

  it('should leave PDFs without DANFE untouched with the original page count', async () => {
    const buffer = await plugin.transform('', {
      filePath: sampleNoDanfePdf,
      jobId: 'test-job-ml-no-danfe',
      condenseDanfe: true,
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);

    const tmpPdf = path.resolve('/tmp/test_vitest_ml_no_danfe.pdf');
    fs.writeFileSync(tmpPdf, buffer);

    const info = execFileSync('pdfinfo', [tmpPdf], { encoding: 'utf-8' });
    const pagesMatch = info.match(/Pages:\s+(\d+)/);
    expect(pagesMatch).not.toBeNull();
    expect(Number(pagesMatch![1])).toBe(3);

    fs.unlinkSync(tmpPdf);
  }, 15000);
});
