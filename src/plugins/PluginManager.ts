import { MarketplacePlugin } from './MarketplacePlugin.js';
import { ShopeePlugin } from './shopee/ShopeePlugin.js';
import { MercadoLivrePlugin } from './mercadolivre/MercadoLivrePlugin.js';

export class PluginManager {
  private plugins: MarketplacePlugin[] = [];

  constructor() {
    // Register builtin plugins
    this.plugins.push(new ShopeePlugin());
    this.plugins.push(new MercadoLivrePlugin());
  }

  /**
   * Register a new plugin (enabling future extensions).
   */
  registerPlugin(plugin: MarketplacePlugin): void {
    this.plugins.push(plugin);
  }

  /**
   * Get all registered plugins.
   */
  getPlugins(): MarketplacePlugin[] {
    return this.plugins;
  }

  /**
   * Detects if any registered plugin matches the file.
   */
  async detectMarketplace(content: string, filename: string, filePath?: string): Promise<MarketplacePlugin | null> {
    for (const plugin of this.plugins) {
      try {
        if (await plugin.detect(content, filename, filePath)) {
          return plugin;
        }
      } catch (err) {
        console.error(`Error running detect for plugin ${plugin.name}:`, err);
      }
    }
    return null;
  }
}

export const pluginManager = new PluginManager();
