import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import PDFDocument from 'pdfkit';
import bwipjs from 'bwip-js';
import { MarketplacePlugin, PluginTransformOptions } from '../MarketplacePlugin.js';

export interface ExtractedDanfeData {
  key: string;
  nf: string;
  serie: string;
  emissao: string;
  protocolo?: string;
}

interface PageClassification {
  pageNum: number; // 1-based
  isDanfe: boolean;
  danfeData?: ExtractedDanfeData;
  labelNf?: string;
}

export class MercadoLivrePlugin implements MarketplacePlugin {
  name = 'mercadolivre';

  async detect(content: string, filename: string, filePath?: string): Promise<boolean> {
    const lowerName = (filename || '').toLowerCase();

    // 1. Check filename patterns commonly used by Mercado Livre
    if (
      lowerName.endsWith('_labels.pdf') ||
      lowerName.includes('mercadolivre') ||
      lowerName.includes('mercado_livre') ||
      lowerName.includes('mercado-livre') ||
      lowerName.includes('etiquetas-de-envio') ||
      lowerName.includes('etiquetas-de-produtos') ||
      lowerName.startsWith('mlb_')
    ) {
      return true;
    }

    // 2. Check content/PDF text if available
    if (filePath && fs.existsSync(filePath) && lowerName.endsWith('.pdf')) {
      try {
        const textSample = execFileSync('pdftotext', ['-l', '2', filePath, '-'], {
          encoding: 'utf-8',
          maxBuffer: 1024 * 1024,
        });

        if (
          textSample.includes('Prince 15') ||
          textSample.includes('DANFE SIMPLIFICADO') ||
          textSample.includes('Chave de acesso') ||
          (textSample.includes('Despachar:') && textSample.includes('Venda:')) ||
          textSample.includes('Pack ID: 20000') ||
          textSample.includes('XSP2') ||
          textSample.includes('SRS1')
        ) {
          return true;
        }
      } catch {
        // If pdftotext fails, fallback to inspecting file buffer directly
        try {
          const buf = fs.readFileSync(filePath);
          const head = buf.subarray(0, 4096).toString('latin1');
          if (head.includes('Prince') || head.includes('mercadolibre') || head.includes('mercadolivre')) {
            return true;
          }
        } catch {
          // ignore
        }
      }
    }

    // 3. Check raw content string (if ZPL or text)
    if (content) {
      if (
        content.includes('Prince') ||
        content.includes('^FDSKU: MLB') ||
        (content.includes('DANFE SIMPLIFICADO') && content.includes('Chave de acesso')) ||
        (content.includes('Despachar:') && content.includes('Venda:'))
      ) {
        return true;
      }
    }

    return false;
  }

  async transform(content: string, options?: PluginTransformOptions): Promise<string | Buffer> {
    const filePath = options?.filePath;
    if (!filePath || !fs.existsSync(filePath) || !filePath.toLowerCase().endsWith('.pdf')) {
      return content;
    }

    // Check if user turned off condensed Danfe
    if (options.condenseDanfe === false) {
      return fs.readFileSync(filePath);
    }

    return await this.condenseMercadoLivrePdf(filePath);
  }

  /**
   * Squeezes ~4mm of blank vertical space from the main label image (between the
   * shipping barcode's digit row and the large bold routing text block) AND trims
   * any bottom whitespace from the image using Python/PIL.
   * Returns the path to a new temp PNG file (caller must delete it).
   */
  private async squeezeMainLabelGap(
    srcImgPath: string,
    tmpDir: string,
    sessionId: string,
    pageNum: number,
  ): Promise<string> {
    const outPath = path.join(tmpDir, `ml_squeezed_${sessionId}_p${pageNum}.png`);

    const pyScript = `
import sys, os
try:
    from PIL import Image
    import numpy as np
except ImportError:
    import shutil
    shutil.copy(sys.argv[1], sys.argv[2])
    sys.exit(0)

src = sys.argv[1]
dst = sys.argv[2]
img = Image.open(src).convert('RGB')
arr = np.array(img)
h, w = arr.shape[:2]

row_mean = arr.mean(axis=(1, 2))
white = row_mean > 250

# --- Step 1: Squeeze ~4mm internal gap between barcode digits and bold text ---
start_scan = int(h * 0.35)
end_scan   = int(h * 0.70)

gap_start = None
gap_end   = None
run_len = 0
for r in range(start_scan, end_scan):
    if white[r]:
        if gap_start is None:
            gap_start = r
        run_len += 1
        gap_end = r
    else:
        if run_len >= 20:
            break
        gap_start = None
        gap_end = None
        run_len = 0

REMOVE_PX = 47  # ~4 mm at 300 DPI

if gap_start is not None and gap_end is not None and run_len >= REMOVE_PX:
    cut_start = gap_start + (run_len - REMOVE_PX) // 2
    cut_end   = cut_start + REMOVE_PX
    arr = np.concatenate([arr[:cut_start], arr[cut_end:]], axis=0)

# --- Step 2: Trim bottom whitespace (keep 10 px padding) ---
h2 = arr.shape[0]
row_min = arr.min(axis=(1, 2))
last_content = h2 - 1
for r in range(h2 - 1, -1, -1):
    if row_min[r] < 240:
        last_content = r
        break
trim_to = min(last_content + 10, h2)
arr = arr[:trim_to]

# --- Step 3: Trim top whitespace (keep 6 px padding) ---
h3 = arr.shape[0]
first_content = 0
for r in range(h3):
    if row_min[r] < 240:
        first_content = r
        break
trim_from = max(first_content - 6, 0)
if trim_from > 0:
    arr = arr[trim_from:]

Image.fromarray(arr.astype(np.uint8)).save(dst)
`;

    try {
      execFileSync('python3', ['-c', pyScript, srcImgPath, outPath], {
        maxBuffer: 32 * 1024 * 1024,
      });
      if (fs.existsSync(outPath)) {
        return outPath;
      }
    } catch {
      // If python3/PIL fails, fall back to original image
    }
    return srcImgPath;
  }

  /**
   * Condenses Mercado Livre labels and simplified DANFEs into a single 10x15cm thermal page per label.
   */
  async condenseMercadoLivrePdf(pdfPath: string): Promise<Buffer> {
    let pagesText: string[] = [];
    try {
      const rawText = execFileSync('pdftotext', [pdfPath, '-'], {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
      });
      pagesText = rawText.split('\x0c').slice(0, -1);
    } catch (err: any) {
      console.warn(`[MercadoLivrePlugin] pdftotext failed on ${pdfPath}: ${err.message}. Returning original.`);
      return fs.readFileSync(pdfPath);
    }

    if (pagesText.length === 0) {
      return fs.readFileSync(pdfPath);
    }

    // Classify all pages
    const pagesInfo: PageClassification[] = pagesText.map((text, idx) => {
      const isDanfe = text.includes('DANFE SIMPLIFICADO') || text.includes('Chave de acesso');
      let danfeData: ExtractedDanfeData | undefined;
      let labelNf: string | undefined;

      if (isDanfe) {
        danfeData = this.parseDanfe(text);
      } else {
        const nfMatch = text.match(/NF:\s*([\d,.]+)/i);
        if (nfMatch) {
          labelNf = nfMatch[1].replace(/[^\d]/g, '');
        }
      }

      return {
        pageNum: idx + 1,
        isDanfe,
        danfeData,
        labelNf,
      };
    });

    const hasAnyDanfe = pagesInfo.some((p) => p.isDanfe);
    if (!hasAnyDanfe) {
      // No DANFE in this document (e.g. only shipping labels), return as is
      return fs.readFileSync(pdfPath);
    }

    // Synchronize and pair labels with DANFEs (order is Etiqueta -> Danfe)
    const pairs: Array<{ label: PageClassification; danfe: PageClassification | null }> = [];
    const usedDanfes = new Set<number>();

    for (let i = 0; i < pagesInfo.length; i++) {
      const info = pagesInfo[i];
      if (info.isDanfe) {
        continue;
      }

      let matchedDanfe: PageClassification | null = null;

      // 1. Check if immediate next page is a Danfe
      if (i + 1 < pagesInfo.length && pagesInfo[i + 1].isDanfe && !usedDanfes.has(pagesInfo[i + 1].pageNum)) {
        matchedDanfe = pagesInfo[i + 1];
      } else if (info.labelNf) {
        // 2. Correlate by NF number
        const found = pagesInfo.find(
          (p) => p.isDanfe && !usedDanfes.has(p.pageNum) && p.danfeData?.nf === info.labelNf
        );
        if (found) {
          matchedDanfe = found;
        }
      }

      // 3. Fallback: take next available DANFE
      if (!matchedDanfe) {
        const nextDanfe = pagesInfo.find((p) => p.isDanfe && !usedDanfes.has(p.pageNum));
        if (nextDanfe) {
          matchedDanfe = nextDanfe;
        }
      }

      if (matchedDanfe) {
        usedDanfes.add(matchedDanfe.pageNum);
        pairs.push({ label: info, danfe: matchedDanfe });
      } else {
        pairs.push({ label: info, danfe: null });
      }
    }

    // Also include any standalone DANFEs that were not paired with any label
    const orphanDanfes = pagesInfo.filter((p) => p.isDanfe && !usedDanfes.has(p.pageNum));

    // Render new merged PDF using PDFKit
    // 100mm = 283.46 pt, 150mm = 425.20 pt
    const widthPt = 283.46;
    const heightPt = 425.2;

    const doc = new PDFDocument({
      size: [widthPt, heightPt],
      margin: 0,
      autoFirstPage: false,
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));

    const tmpDir = os.tmpdir();
    const sessionId = crypto.randomUUID();
    const tempFiles: string[] = [];

    try {
      // 1. Process paired labels
      for (const pair of pairs) {
        doc.addPage({ size: [widthPt, heightPt], margin: 0 });

        // Render label page to PNG at 300 DPI for high fidelity
        const labelPrefix = path.join(tmpDir, `ml_label_${sessionId}_p${pair.label.pageNum}`);
        execFileSync('pdftoppm', [
          '-png',
          '-r',
          '300',
          '-f',
          String(pair.label.pageNum),
          '-l',
          String(pair.label.pageNum),
          '-singlefile',
          pdfPath,
          labelPrefix,
        ]);

        const labelImgPath = `${labelPrefix}.png`;
        tempFiles.push(labelImgPath);

        if (pair.danfe && pair.danfe.danfeData?.key) {
          // Both label and danfe: render condensed label with compact banner at bottom
          const danfe = pair.danfe.danfeData;

          // ── DANFE banner dimensions ─────────────────────────────────────────
          // Target height: 2.2 cm = 22 mm → 22 × 72 / 25.4 ≈ 62.4 pt
          const bannerHeight = 62;
          // 1 mm bottom margin → ~2.8 pt  (minimal — push DANFE to the very bottom)
          const bottomMargin = -5 * 72 / 25.4;
          const bannerY = heightPt - bottomMargin - bannerHeight;

          // ── Squeeze ~4 mm gap + trim whitespace from main label image ────────
          const squeezedImgPath = await this.squeezeMainLabelGap(
            labelImgPath, tmpDir, sessionId, pair.label.pageNum,
          );
          if (squeezedImgPath !== labelImgPath) {
            tempFiles.push(squeezedImgPath);
          }

          // ── Scale main label: fit into available area keeping aspect ratio ──
          // Available area: from y=1 down to bannerY-2, full width minus 2pt each side
          const availableWidth = widthPt - 4;
          const availableHeight = bannerY - 3;

          doc.image(squeezedImgPath, 2, 1, {
            fit: [availableWidth, availableHeight],
            align: 'center',
            valign: 'center',
          });

          // ── Separator line ──────────────────────────────────────────────────
          doc.strokeColor('#000000').lineWidth(0.8);
          doc.moveTo(6, bannerY).lineTo(widthPt - 6, bannerY).stroke();

          // ── DANFE banner content ─────────────────────────────────────────────
          // Line 1: Title  (font 7 pt bold)
          let curY = bannerY + 2;
          doc.font('Helvetica-Bold').fontSize(7).fillColor('#000000');
          doc.text('DANFE SIMPLIFICADO - ETIQUETA', 0, curY, {
            width: widthPt,
            align: 'center',
          });

          // Line 2: 1-Saída / NF / Série / Emissão HH:MM:SS  (font 5.5 pt bold)
          curY += 8.5;
          doc.font('Helvetica-Bold').fontSize(5.5);
          const lineInfo = `1 - Saída    NF: ${danfe.nf}    Série: ${danfe.serie}    Emissão: ${danfe.emissao}`;
          doc.text(lineInfo, 0, curY, { width: widthPt, align: 'center' });

          // Line 3: Chave de acesso + Protocolo ABOVE the barcode  (font 5.0 pt)
          curY += 7;
          const formattedKey = danfe.key.replace(/(\d{4})/g, '$1 ').trim();
          const keyProtoLine = danfe.protocolo
            ? `Chave: ${formattedKey}    Prot: ${danfe.protocolo}`
            : `Chave: ${formattedKey}`;
          doc.font('Helvetica').fontSize(5.0).fillColor('#000000');
          doc.text(keyProtoLine, 0, curY, { width: widthPt, align: 'center' });

          // Line 4: Code-128 barcode of the access key
          curY += 6.5;
          const barcodeBuffer = await bwipjs.toBuffer({
            bcid: 'code128',
            text: danfe.key,
            scale: 2,
            height: 7,       // bwip-js units (≈ 7 × ~2.835 pt = ~20 pt tall)
            includetext: false,
          });

          const barcodeWidth = widthPt - 20;
          const barcodeHeight = 19;
          doc.image(barcodeBuffer, (widthPt - barcodeWidth) / 2, curY, {
            width: barcodeWidth,
            height: barcodeHeight,
          });
          // (nothing below the barcode)
        } else {
          // Standalone label without DANFE: render full page
          doc.image(labelImgPath, 0, 0, {
            width: widthPt,
            height: heightPt,
          });
        }
      }

      // 2. Process orphan Danfes (if any) as standalone full pages
      for (const orphan of orphanDanfes) {
        doc.addPage({ size: [widthPt, heightPt], margin: 0 });

        const orphanPrefix = path.join(tmpDir, `ml_orphan_${sessionId}_p${orphan.pageNum}`);
        execFileSync('pdftoppm', [
          '-png',
          '-r',
          '300',
          '-f',
          String(orphan.pageNum),
          '-l',
          String(orphan.pageNum),
          '-singlefile',
          pdfPath,
          orphanPrefix,
        ]);

        const orphanImgPath = `${orphanPrefix}.png`;
        tempFiles.push(orphanImgPath);

        doc.image(orphanImgPath, 0, 0, {
          width: widthPt,
          height: heightPt,
        });
      }

      doc.end();

      const resultBuffer = await new Promise<Buffer>((resolve, reject) => {
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
      });

      return resultBuffer;
    } finally {
      // Clean up temporary rendered images
      for (const f of tempFiles) {
        try {
          if (fs.existsSync(f)) {
            fs.unlinkSync(f);
          }
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }

  private parseDanfe(text: string): ExtractedDanfeData {
    const keyMatch = text.match(/\b(\d{44})\b/);
    const key = keyMatch ? keyMatch[1] : '';

    const nfMatch = text.match(/N[uú]mero\s+([\d,.]+)/i) || text.match(/NF:\s*([\d,.]+)/i);
    const nf = nfMatch
      ? nfMatch[1].replace(/[^\d]/g, '')
      : key
      ? key.substring(25, 34).replace(/^0+/, '')
      : '';

    const serieMatch = text.match(/S[eé]rie\s*(\d+)/i);
    const serie = serieMatch ? serieMatch[1] : key ? key.substring(22, 25).replace(/^0+/, '') : '1';

    // Try to extract date only from Emissão line first
    const emissaoMatch = text.match(/Emiss[aã]o\s*([\d]{2}\/[\d]{2}\/[\d]{4})/i);
    let emissao = emissaoMatch ? emissaoMatch[1].trim() : '';

    // Extract time (HH:MM:SS) from the authorization protocol line, e.g.:
    //   "135264681945475 03/11/2026 10:05:58"
    // This line always has: <15-digit proto> <date> <time>
    const protoLineMatch = text.match(/(\d{15})\s+([\d]{2}\/[\d]{2}\/[\d]{4})\s+(\d{2}:\d{2}:\d{2})/);
    if (protoLineMatch) {
      // If emissao was not found above, use the date from the protocol line
      if (!emissao) {
        emissao = protoLineMatch[2];
      }
      emissao = `${emissao} ${protoLineMatch[3]}`;
    } else if (!emissao) {
      // Final fallback: grab any date-like string near Emissão
      const fallback = text.match(/Emiss[aã]o\s*([\d/: -]+)/i);
      emissao = fallback ? fallback[1].trim() : '';
    }

    // Extract only the 15-digit protocol number
    const protoMatch = text.match(/(\d{15})\s+[\d]{2}\/[\d]{2}\/[\d]{4}\s+\d{2}:\d{2}:\d{2}/)
      || text.match(/Protocolo de Autoriza[cç][aã]o.*?\n\s*(\d{15})/i);
    const protocolo = protoMatch ? protoMatch[1] : undefined;

    return { key, nf, serie, emissao, protocolo };
  }
}
