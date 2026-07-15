import * as fs from 'node:fs';
import { inflateSync } from 'node:zlib';

const zpl = fs.readFileSync('/home/brunoavn/Documentos/0-Acadêmico/Pessoal/Side Projects/axiom_v2/data/jobs/ade4d2e0-f863-4238-9315-fafbe6982578/original/thermal_zpl_shipping_label.txt', 'utf8');

const dgrMatch = zpl.match(/~DG[^,]+,(\d+),(\d+),([^]+)/);
const totalBytes = parseInt(dgrMatch[1], 10);
const bytesPerRow = parseInt(dgrMatch[2], 10);
const dataStr = dgrMatch[3];

let bitmap;
if (dataStr.startsWith(':Z64:')) {
  const b64Data = dataStr.substring(5).split('^')[0].trim();
  const compressed = Buffer.from(b64Data.split(':')[0], 'base64');
  bitmap = inflateSync(compressed);
}

const widthDots = bytesPerRow * 8;
const heightDots = Math.floor(totalBytes / bytesPerRow);

let blackPixels = 0;
for (let y = 0; y < heightDots; y++) {
  const rowStart = y * bytesPerRow;
  for (let x = 0; x < widthDots; x++) {
    const byteIndex = rowStart + (x >> 3);
    const bitMask = 0x80 >> (x & 7);
    const isBlack = byteIndex < bitmap.length && (bitmap[byteIndex] & bitMask) !== 0;
    if (isBlack) blackPixels++;
  }
}

console.log(`Total pixels: ${widthDots * heightDots}`);
console.log(`Black pixels: ${blackPixels}`);
