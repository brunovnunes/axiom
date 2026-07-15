import PDFDocument from 'pdfkit';
import { LabelRenderer, RenderOptions } from '../LabelRenderer.js';
import {
  LabelProfile,
  mmToInches,
  dpiToDpmm,
  splitLabelDocuments,
} from '../../config/LabelProfile.js';
import { zpl2svg } from 'zpl2svg';
import SVGtoPDF from 'svg-to-pdfkit';
import { inflateSync, deflateSync } from 'node:zlib';

type ParsedGrf = {
  totalBytes: number;
  bytesPerRow: number;
  bitmap: Buffer;
};

export interface MultiPageRenderOptions extends RenderOptions {
  profile?: LabelProfile;
  renderMultiPage?: boolean; // If true, render each ^XZ as separate page
}

/**
 * Enhanced Local ZPL Renderer with multi-page and profile support
 */
export class LocalRenderer implements LabelRenderer {
  async render(zpl: string, options?: RenderOptions | MultiPageRenderOptions): Promise<Buffer> {
    let widthInches = options?.width ?? 4;
    let heightInches = options?.height ?? 6;
    let dpmm = options?.dpmm ?? 8;

    // If profile is provided, use its dimensions
    const multiPageOptions = options as MultiPageRenderOptions;
    if (multiPageOptions?.profile) {
      const profile = multiPageOptions.profile;
      widthInches = mmToInches(profile.widthMm);
      heightInches = mmToInches(profile.heightMm);
      dpmm = dpiToDpmm(profile.dpi);
    }

    // PDF uses points: 1in = 72pt.
    const widthPt = widthInches * 72;
    const heightPt = heightInches * 72;

    // ZPL engine works with printer dots.
    const dotsPerInch = dpmm * 25.4;
    const widthDots = Math.max(1, Math.round(widthInches * dotsPerInch));
    const heightDots = Math.max(1, Math.round(heightInches * dotsPerInch));

    const cleanedZpl = zpl.trim();
    const renderMultiPage = multiPageOptions?.renderMultiPage ?? true;

    // Split into individual label documents if multi-page rendering is enabled
    let labelDocuments = [cleanedZpl];
    if (renderMultiPage) {
      labelDocuments = splitLabelDocuments(cleanedZpl);
    }

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: [widthPt, heightPt],
          margin: 0,
          autoFirstPage: true,
          // @ts-ignore: autoPageBreak is valid in PDFKit but missing in some versions of @types/pdfkit
          autoPageBreak: false,
        });

        const chunks: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        doc.on('end', () => {
          resolve(Buffer.concat(chunks));
        });

        doc.on('error', (error: Error) => {
          reject(error);
        });

        // Render each label document
        labelDocuments.forEach((labelZpl, index) => {
          // Add page breaks after the first page
          if (index > 0) {
            doc.addPage({ size: [widthPt, heightPt], margin: 0 });
          }

          this.renderSingleLabel(doc, labelZpl, widthDots, heightDots, widthPt, heightPt, dpmm);
        });

        doc.end();
      } catch (error: any) {
        reject(new Error(`Failed to render ZPL locally: ${error.message}`));
      }
    });
  }

  private renderSingleLabel(
    doc: PDFKit.PDFDocument,
    zpl: string,
    widthDots: number,
    heightDots: number,
    widthPt: number,
    heightPt: number,
    dpmm: number
  ): void {
    try {
      // Some marketplaces ship labels as ~DG (download graphic) + ^XG (recall graphic).
      // zpl2svg can miss these, so we render that bitmap path directly as a fallback.
      const parsedGraphic = this.parseDownloadedGraphic(zpl);
      if (parsedGraphic) {
        this.renderGraphicToPdf(doc, zpl, parsedGraphic, dpmm);
      } else {
        const svg = zpl2svg(zpl, {
          width: widthDots,
          height: heightDots,
          scale: 1,
        });

        SVGtoPDF(doc, svg, 0, 0, {
          width: widthPt,
          height: heightPt,
          preserveAspectRatio: 'xMidYMid meet',
        });
      }
    } catch (error: any) {
      console.error('Error rendering single label:', error.message);
      // Continue rendering even if one page fails
    }
  }

  private parseDownloadedGraphic(zpl: string): ParsedGrf | null {
    const dgMatch = zpl.match(/~DG[^,]*,(\d+),(\d+),:Z64:([^:]+):[A-Fa-f0-9]+/);
    if (!dgMatch) return null;

    const totalBytes = Number(dgMatch[1]);
    const bytesPerRow = Number(dgMatch[2]);
    const base64Data = dgMatch[3];

    if (!Number.isFinite(totalBytes) || !Number.isFinite(bytesPerRow) || totalBytes <= 0 || bytesPerRow <= 0) {
      return null;
    }

    const compressed = Buffer.from(base64Data, 'base64');
    const inflated = inflateSync(compressed);

    const bitmap = inflated.length >= totalBytes ? inflated.subarray(0, totalBytes) : inflated;
    if (bitmap.length === 0) return null;

    return { totalBytes, bytesPerRow, bitmap };
  }

  private renderGraphicToPdf(doc: PDFKit.PDFDocument, zpl: string, graphic: ParsedGrf, dpmm: number): void {
    const dotsPerInch = dpmm * 25.4;
    const pointPerDot = 72 / dotsPerInch;

    const widthDots = graphic.bytesPerRow * 8;
    const heightDots = Math.floor(graphic.totalBytes / graphic.bytesPerRow);

    // Use ^FO from the field where ^XG is recalled, default to origin.
    const posMatch = zpl.match(/\^FO(\d+),(\d+)\^XG[^,]+,(\d+),(\d+)/);
    const xOffsetDots = posMatch ? Number(posMatch[1]) : 0;
    const yOffsetDots = posMatch ? Number(posMatch[2]) : 0;

    const pxW = widthDots * pointPerDot;
    const pxH = heightDots * pointPerDot;
    const xBase = xOffsetDots * pointPerDot;
    const yBase = yOffsetDots * pointPerDot;

    // Build raw RGBA PNG manually to avoid broken dependencies (canvas/pngjs)
    
    const pixels = new Uint8Array(widthDots * heightDots * 4);
    for (let y = 0; y < heightDots; y++) {
      const rowStart = y * graphic.bytesPerRow;
      for (let x = 0; x < widthDots; x++) {
        const byteIndex = rowStart + (x >> 3);
        const bitMask = 0x80 >> (x & 7);
        const isBlack = byteIndex < graphic.bitmap.length && (graphic.bitmap[byteIndex] & bitMask) !== 0;
        const offset = (y * widthDots + x) * 4;
        const color = isBlack ? 0 : 255;
        pixels[offset] = color;
        pixels[offset + 1] = color;
        pixels[offset + 2] = color;
        pixels[offset + 3] = 255; // Alpha
      }
    }

    const scanlines = new Uint8Array(heightDots * (widthDots * 4 + 1));
    for (let y = 0; y < heightDots; y++) {
      scanlines[y * (widthDots * 4 + 1)] = 0; // Filter type: None
      scanlines.set(pixels.subarray(y * widthDots * 4, (y + 1) * widthDots * 4), y * (widthDots * 4 + 1) + 1);
    }

    const idatData = deflateSync(scanlines);

    const chunks: Buffer[] = [];
    chunks.push(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])); // PNG Signature

    const writeChunk = (type: string, data: Buffer) => {
      const length = Buffer.alloc(4);
      length.writeUInt32BE(data.length, 0);
      const typeBuf = Buffer.from(type, 'ascii');
      
      const crcBuf = Buffer.concat([typeBuf, data]);
      let crc = 0xFFFFFFFF;
      for (let i = 0; i < crcBuf.length; i++) {
        crc ^= crcBuf[i];
        for (let j = 0; j < 8; j++) {
          crc = (crc & 1) ? (crc >>> 1) ^ 0xEDB88320 : crc >>> 1;
        }
      }
      crc ^= 0xFFFFFFFF;
      
      const crcOut = Buffer.alloc(4);
      crcOut.writeUInt32BE(crc >>> 0, 0);
      
      chunks.push(length, typeBuf, data, crcOut);
    };

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(widthDots, 0);
    ihdr.writeUInt32BE(heightDots, 4);
    ihdr[8] = 8; // Bit depth
    ihdr[9] = 6; // Color type (RGBA)
    ihdr[10] = 0; // Compression
    ihdr[11] = 0; // Filter
    ihdr[12] = 0; // Interlace
    writeChunk('IHDR', ihdr);
    writeChunk('IDAT', idatData);
    writeChunk('IEND', Buffer.alloc(0));

    const pngBuffer = Buffer.concat(chunks);
    doc.image(pngBuffer, xBase, yBase, { width: pxW, height: pxH });
  }
}
