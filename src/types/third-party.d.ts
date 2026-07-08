declare module 'zpl2svg' {
  export function zpl2svg(
    zpl: string,
    options?: {
      width?: number;
      height?: number;
      scale?: number;
      x_offset?: number;
      y_offset?: number;
      custom_class?: string;
      debug?: boolean;
      dynamic_size?: boolean;
    }
  ): string;
}

declare module 'svg-to-pdfkit' {
  import type PDFDocument from 'pdfkit';

  export default function SVGtoPDF(
    doc: PDFDocument,
    svg: string,
    x: number,
    y: number,
    options?: {
      width?: number;
      height?: number;
      preserveAspectRatio?: string;
      assumePt?: boolean;
      precision?: number;
    }
  ): void;
}
