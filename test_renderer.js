import fs from 'node:fs';
import { LocalRenderer } from './dist/converters/implementations/LocalRenderer.js';

async function run() {
  const renderer = new LocalRenderer();
  
  // Test True ZPL
  const zplTrue = fs.readFileSync('/home/brunoavn/Documentos/0-Acadêmico/Pessoal/Side Projects/axiom_v2/data/jobs/ed7bcdd0-f48a-4abb-82d9-cd9bcc342041/original/Envio-71184729-Etiquetas-de-produtos.txt', 'utf8');
  const bufTrue = await renderer.render(zplTrue);
  fs.writeFileSync('output_true_zpl.pdf', bufTrue);
  console.log(`True ZPL PDF created. Size: ${bufTrue.length}`);

  // Test ~DG ZPL
  const zplDg = fs.readFileSync('/home/brunoavn/Documentos/0-Acadêmico/Pessoal/Side Projects/axiom_v2/data/jobs/ade4d2e0-f863-4238-9315-fafbe6982578/original/thermal_zpl_shipping_label.txt', 'utf8');
  const bufDg = await renderer.render(zplDg);
  fs.writeFileSync('output_dg_zpl.pdf', bufDg);
  console.log(`~DG ZPL PDF created. Size: ${bufDg.length}`);
}

run().catch(console.error);
