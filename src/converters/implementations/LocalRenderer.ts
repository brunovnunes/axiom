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
import { inflateSync } from 'node:zlib';

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

    const pxW = pointPerDot;
    const pxH = pointPerDot;
    const xBase = xOffsetDots * pointPerDot;
    const yBase = yOffsetDots * pointPerDot;

    doc.save();
    doc.fillColor('black');

    for (let row = 0; row < heightDots; row++) {
      const rowStart = row * graphic.bytesPerRow;
      let runStart = -1;

      for (let col = 0; col < widthDots; col++) {
        const byteIndex = rowStart + (col >> 3);
        const bitMask = 0x80 >> (col & 7);
        const isBlack = byteIndex < graphic.bitmap.length && (graphic.bitmap[byteIndex] & bitMask) !== 0;

        if (isBlack && runStart < 0) {
          runStart = col;
        }

        const runEnded = !isBlack && runStart >= 0;
        const atLineEnd = col === widthDots - 1;

        if (runEnded || (atLineEnd && runStart >= 0)) {
          const runEnd = runEnded ? col : col + 1;
          const runLen = runEnd - runStart;
          doc.rect(xBase + runStart * pxW, yBase + row * pxH, runLen * pxW, pxH).fill();
          runStart = -1;
        }
      }
    }

    doc.restore();
  }
}
