export interface PluginTransformOptions {
  filePath: string;
  jobId: string;
  condenseDanfe?: boolean;
}

export interface MarketplacePlugin {
  name: string;
  detect(content: string, filename: string, filePath?: string): Promise<boolean>;
  transform(content: string, options?: PluginTransformOptions): Promise<string | Buffer>;
}
