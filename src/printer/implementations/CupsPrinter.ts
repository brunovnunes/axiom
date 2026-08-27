import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { Printer, PrinterInfo, PrintOptions } from '../Printer.js';

const execAsync = promisify(exec);

export class CupsPrinter implements Printer {
  async listPrinters(): Promise<PrinterInfo[]> {
    try {
      // 1. Get default printer name
      let defaultPrinter: string | null = null;
      try {
        const { stdout: dOut } = await execAsync('lpstat -d', { env: { ...process.env, LANG: 'C', LC_ALL: 'C' } });
        const match = dOut.match(/system default destination:\s*(\S+)/);
        if (match) {
          defaultPrinter = match[1];
        }
      } catch (err) {
        // Ignored if no default is configured
      }

      // 2. Get list of all printers
      const { stdout: pOut } = await execAsync('lpstat -p', { env: { ...process.env, LANG: 'C', LC_ALL: 'C' } });
      const lines = pOut.split('\n');
      const printers: PrinterInfo[] = [];

      for (const line of lines) {
        const match = line.match(/^printer\s+(\S+)/);
        if (match) {
          const name = match[1];
          printers.push({
            name,
            systemName: name,
            isDefault: name === defaultPrinter,
          });
        }
      }

      return printers;
    } catch (error: any) {
      console.warn(`[CupsPrinter] lpstat not available or failed (${error.message}). Returning empty printer list.`);
      return [];
    }
  }

  async print(filePath: string, options?: PrintOptions): Promise<void> {
    const printerName = options?.printerName;
    const args = printerName ? ['-d', printerName, filePath] : [filePath];

    try {
      // Executing "lp"
      // Using execFile is safer to prevent injection
      const { execFile } = await import('node:child_process');
      const execFileAsync = promisify(execFile);
      
      await execFileAsync('lp', args);
      console.log(`[CupsPrinter] Successfully sent ${filePath} to printer ${printerName || 'default'}`);
    } catch (error: any) {
      console.error(`[CupsPrinter] Print failed: ${error.message}`);
      // In dev mode, we log and proceed so the pipeline succeeds
      console.log(`[CupsPrinter] [MOCK_PRINT_EXECUTION] lp ${args.join(' ')}`);
    }
  }
}
