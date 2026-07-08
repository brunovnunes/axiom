export interface MarketplacePlugin {
  name: string;
  detect(content: string, filename: string): Promise<boolean>;
  transform(content: string): Promise<string>;
}
