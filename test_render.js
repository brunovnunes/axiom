import fs from 'node:fs';
import { LocalRenderer } from './dist/converters/implementations/LocalRenderer.js';

async function run() {
  const zpl = fs.readFileSync('/home/brunoavn/Documentos/0-Acadêmico/Pessoal/Side Projects/axiom_v2/data/jobs/ade4d2e0-f863-4238-9315-fafbe6982578/original/thermal_zpl_shipping_label.txt', 'utf8');

  const renderer = new LocalRenderer();
  
  // monkey patch console.error to throw so we can see the exact error
  const origError = console.error;
  console.error = (...args) => {
    origError(...args);
    throw new Error(args.join(' '));
  };

  try {
    const pdfBuffer = await renderer.render(zpl, { width: 4, height: 6, dpmm: 8 });
    fs.writeFileSync('output_test.pdf', pdfBuffer);
    console.log('PDF written. Size:', pdfBuffer.length);
  } catch (e) {
    console.log('Caught exception:', e);
  }
}

run();
