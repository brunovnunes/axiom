import fs from 'node:fs';
import PDFDocument from 'pdfkit';

const pngBuffer = fs.readFileSync('test_real.png');

const doc = new PDFDocument({ size: [287, 431], margin: 0 });
doc.pipe(fs.createWriteStream('test_real.pdf'));

try {
  doc.image(pngBuffer, 0, 0, { width: 287, height: 431 });
  console.log('Image added to PDF successfully.');
} catch(e) {
  console.log('Error adding image:', e);
}

doc.end();
console.log('PDF written.');
