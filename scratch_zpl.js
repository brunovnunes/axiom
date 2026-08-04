import fs from 'node:fs';
import { zpl2svg } from 'zpl2svg';
import PDFDocument from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';

async function run() {
  const zpl = fs.readFileSync('/home/brunoavn/Documentos/0-Acadêmico/Pessoal/Side Projects/axiom_v2/data/jobs/ed7bcdd0-f48a-4abb-82d9-cd9bcc342041/original/Envio-71184729-Etiquetas-de-produtos.txt', 'utf8');

  try {
    const svg = zpl2svg(zpl, { width: 800, height: 1200, scale: 1 });
    fs.writeFileSync('scratch_svg.svg', svg);
    console.log('SVG generated successfully.');

    const doc = new PDFDocument({ size: [400, 600], margin: 0 });
    doc.pipe(fs.createWriteStream('scratch_pdf.pdf'));
    SVGtoPDF(doc, svg, 0, 0, { width: 400, height: 600, preserveAspectRatio: 'xMidYMid meet' });
    doc.end();
    console.log('PDF generated successfully.');
  } catch (e) {
    console.log('Error during rendering:', e);
  }
}

run();
