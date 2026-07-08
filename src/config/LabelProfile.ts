/**
 * Label Profile System
 * Manages label dimensions and automatically detects the appropriate profile
 */

export interface LabelProfile {
  name: string;
  widthMm: number;
  heightMm: number;
  dpi: number;
  description?: string;
}

export interface LabelDimensions {
  widthMm: number;
  heightMm: number;
  dpi: number;
  profileId?: string;
}

/**
 * Convert mm to inches
 */
export function mmToInches(mm: number): number {
  return mm / 25.4;
}

/**
 * Convert DPI to dots per mm
 */
export function dpiToDpmm(dpi: number): number {
  return dpi / 25.4;
}

/**
 * Extract label dimensions from ZPL
 * Looks for ^PW (label width in dots) and ^LL (label length in dots)
 * Returns dimensions in mm based on DPI
 */
export function extractZplDimensions(zpl: string, dpi: number = 203): LabelDimensions | null {
  // Extract ^PW (print width in dots)
  const pwMatch = zpl.match(/\^PW(\d+)/);
  // Extract ^LL (label length in dots)
  const llMatch = zpl.match(/\^LL(\d+)/);

  if (!pwMatch || !llMatch) {
    return null;
  }

  const widthDots = Number(pwMatch[1]);
  const heightDots = Number(llMatch[1]);

  // Convert dots to mm: dots / (dpi / 25.4) = dots / dpmm
  const dpmm = dpi / 25.4;
  const widthMm = widthDots / dpmm;
  const heightMm = heightDots / dpmm;

  return {
    widthMm,
    heightMm,
    dpi,
  };
}

/**
 * Detect label profile by comparing dimensions (with tolerance)
 */
export function detectProfileByDimensions(
  dimensions: LabelDimensions,
  profiles: Record<string, LabelProfile>,
  tolerance: number = 2 // mm tolerance
): { profileId: string; profile: LabelProfile } | null {
  for (const [profileId, profile] of Object.entries(profiles)) {
    const widthDiff = Math.abs(dimensions.widthMm - profile.widthMm);
    const heightDiff = Math.abs(dimensions.heightMm - profile.heightMm);

    if (widthDiff <= tolerance && heightDiff <= tolerance) {
      return { profileId, profile };
    }
  }

  return null;
}

/**
 * Count number of label documents in ZPL (number of ^XA...^XZ pairs)
 */
export function countLabelDocuments(zpl: string): number {
  const matches = zpl.match(/\^XZ/g);
  return matches ? matches.length : 1;
}

/**
 * Extract individual label documents from ZPL
 * Returns array of ZPL strings, each representing one label
 */
export function splitLabelDocuments(zpl: string): string[] {
  const documents: string[] = [];
  const cleanZpl = zpl.trim();

  // Split by ^XZ but keep the terminator
  const parts = cleanZpl.split(/(\^XZ)/);

  let current = '';
  for (const part of parts) {
    current += part;
    if (part === '^XZ') {
      documents.push(current.trim());
      current = '';
    }
  }

  // If there's leftover content without ^XZ, include it
  if (current.trim()) {
    documents.push(current.trim());
  }

  return documents.filter(doc => doc.length > 0);
}
