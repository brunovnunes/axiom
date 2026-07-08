import { MarketplacePlugin } from './MarketplacePlugin.js';
import { ShopeePlugin } from './shopee/ShopeePlugin.js';

export class PluginManager {
  private plugins: MarketplacePlugin[] = [];

  constructor() {
    // Initially register the Shopee plugin
    this.plugins.push(new ShopeePlugin());
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
  async detectMarketplace(content: string, filename: string): Promise<MarketplacePlugin | null> {
    for (const plugin of this.plugins) {
      try {
        if (await plugin.detect(content, filename)) {
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
