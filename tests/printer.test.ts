import { describe, expect, it } from 'vitest';
import { getPrinterBackend } from '../src/printer/Printer.js';
import { CupsPrinter } from '../src/printer/implementations/CupsPrinter.js';
import { WindowsPrinter } from '../src/printer/implementations/WindowsPrinter.js';

describe('Printer Backend', () => {
  it('should instantiate the correct backend based on OS platform', async () => {
    const backend = await getPrinterBackend();
    
    if (process.platform === 'win32') {
      expect(backend).toBeInstanceOf(WindowsPrinter);
    } else {
      expect(backend).toBeInstanceOf(CupsPrinter);
    }
  });

  it('should return mock printers when CUPS fails or is missing', async () => {
    const printer = new CupsPrinter();
    const list = await printer.listPrinters();
    expect(list.length).toBeGreaterThan(0);
    expect(list[0]).toHaveProperty('name');
    expect(list[0]).toHaveProperty('isDefault');
  });

  it('should return mock printers when Windows powershell fails or is missing', async () => {
    const printer = new WindowsPrinter();
    const list = await printer.listPrinters();
    expect(list.length).toBeGreaterThan(0);
    expect(list[0]).toHaveProperty('name');
    expect(list[0]).toHaveProperty('isDefault');
  });
});
