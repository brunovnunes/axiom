import fs from 'node:fs';
import { ready } from 'zpl-renderer-js';

async function run() {
  const { api } = await ready;

  // Test 1: MercadoLivre true ZPL
  const zpl1 = fs.readFileSync('/home/brunoavn/Documentos/0-Acadêmico/Pessoal/Side Projects/axiom_v2/data/jobs/ed7bcdd0-f48a-4abb-82d9-cd9bcc342041/original/Envio-71184729-Etiquetas-de-produtos.txt', 'utf8');
  
  try {
    const pngB64_1 = api.Render(zpl1, 101.6, 152.4, 8); // 4x6 inches, 8 dpmm
    fs.writeFileSync('test1.png', Buffer.from(pngB64_1, 'base64'));
    console.log('Test 1: True ZPL rendered successfully.');
  } catch (e) {
    console.log('Test 1 Error:', e);
  }

  // Test 2: Shopee ~DG ZPL
  const zpl2 = fs.readFileSync('/home/brunoavn/Documentos/0-Acadêmico/Pessoal/Side Projects/axiom_v2/data/jobs/ade4d2e0-f863-4238-9315-fafbe6982578/original/thermal_zpl_shipping_label.txt', 'utf8');
  
  try {
    const pngB64_2 = api.Render(zpl2, 101.6, 152.4, 8);
    fs.writeFileSync('test2.png', Buffer.from(pngB64_2, 'base64'));
    console.log('Test 2: ~DG ZPL rendered successfully.');
  } catch (e) {
    console.log('Test 2 Error:', e);
  }
}

run();
