import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { Printer, PrinterInfo, PrintOptions } from '../Printer.js';

const execAsync = promisify(exec);

export class WindowsPrinter implements Printer {
  async listPrinters(): Promise<PrinterInfo[]> {
    try {
      // Get printers using PowerShell, converting directly to JSON for reliable parsing
      const command = 'powershell -Command "Get-CimInstance Win32_Printer | Select-Object Name, Default | ConvertTo-Json -Compress"';
      const { stdout } = await execAsync(command);
      
      const trimmed = stdout.trim();
      if (!trimmed) {
        return [];
      }

      const parsed = JSON.parse(trimmed);
      const items = Array.isArray(parsed) ? parsed : [parsed];

      return items.map((item: any) => ({
        name: item.Name,
        systemName: item.Name,
        isDefault: !!item.Default,
      }));
    } catch (error: any) {
      console.warn(`[WindowsPrinter] PowerShell printer lookup failed (${error.message}). Returning empty printer list.`);
      return [];
    }
  }

  async print(filePath: string, options?: PrintOptions): Promise<void> {
    const printerName = options?.printerName;
    const exeName = 'SumatraPDF.exe';
    
    // If printer is specified, print to it, otherwise print to default system printer
    const args = printerName
      ? ['-print-to', printerName, filePath]
      : ['-print-default', filePath];

    try {
      const { execFile } = await import('node:child_process');
      const execFileAsync = promisify(execFile);

      await execFileAsync(exeName, args);
      console.log(`[WindowsPrinter] Successfully printed ${filePath} using SumatraPDF`);
    } catch (error: any) {
      console.error(`[WindowsPrinter] Print failed: ${error.message}`);
      // Fallback log message for development
      console.log(`[WindowsPrinter] [MOCK_PRINT_EXECUTION] SumatraPDF.exe ${args.join(' ')}`);
    }
  }
}
