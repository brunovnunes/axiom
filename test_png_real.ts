import * as fs from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';

const zpl = fs.readFileSync('/home/brunoavn/Documentos/0-Acadêmico/Pessoal/Side Projects/axiom_v2/data/jobs/ade4d2e0-f863-4238-9315-fafbe6982578/original/thermal_zpl_shipping_label.txt', 'utf8');

const dgrMatch = zpl.match(/~DG[^,]+,(\d+),(\d+),([^]+)/);
if (!dgrMatch) {
  console.log("No graphic found");
  process.exit(1);
}

const totalBytes = parseInt(dgrMatch[1], 10);
const bytesPerRow = parseInt(dgrMatch[2], 10);
const dataStr = dgrMatch[3];

let bitmap;
if (dataStr.startsWith(':Z64:')) {
  const b64Data = dataStr.substring(5).split('^')[0].trim();
  const actualB64 = b64Data.split(':')[0];
  const compressed = Buffer.from(actualB64, 'base64');
  bitmap = inflateSync(compressed);
} else {
  console.log("Unsupported format");
  process.exit(1);
}

const widthDots = bytesPerRow * 8;
const heightDots = Math.floor(totalBytes / bytesPerRow);

console.log(`Parsed graphic: ${widthDots}x${heightDots}`);

// RGBA Generator
const pixels = new Uint8Array(widthDots * heightDots * 4);
for (let y = 0; y < heightDots; y++) {
  const rowStart = y * bytesPerRow;
  for (let x = 0; x < widthDots; x++) {
    const byteIndex = rowStart + (x >> 3);
    const bitMask = 0x80 >> (x & 7);
    const isBlack = byteIndex < bitmap.length && (bitmap[byteIndex] & bitMask) !== 0;
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

const chunks = [];
chunks.push(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])); // PNG Signature

const writeChunk = (type, data) => {
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
fs.writeFileSync('test_real.png', pngBuffer);
console.log('test_real.png written, size:', pngBuffer.length);
