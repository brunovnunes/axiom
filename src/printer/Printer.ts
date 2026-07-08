export interface PrinterInfo {
  name: string;
  isDefault: boolean;
  systemName: string;
}

export interface PrintOptions {
  printerName?: string;
}

export interface Printer {
  listPrinters(): Promise<PrinterInfo[]>;
  print(filePath: string, options?: PrintOptions): Promise<void>;
}

// Lazy load implementations to avoid executing platform-specific imports on startup
export async function getPrinterBackend(): Promise<Printer> {
  if (process.platform === 'win32') {
    const { WindowsPrinter } = await import('./implementations/WindowsPrinter.js');
    return new WindowsPrinter();
  } else {
    const { CupsPrinter } = await import('./implementations/CupsPrinter.js');
    return new CupsPrinter();
  }
}
