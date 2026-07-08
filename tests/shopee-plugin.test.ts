import { describe, expect, it } from 'vitest';
import { ShopeePlugin } from '../src/plugins/shopee/ShopeePlugin.js';
import { loadConfig } from '../src/config/config.js';

describe('Shopee Plugin', () => {
  // Initialize configuration
  loadConfig();

  const shopeeZpl = `^XA
~DGR:DEMO.GRF,10,2,FFFF
^FO0,0^XGR:DEMO.GRF,1,1^FS
^XZ`;

  const nonShopeeZpl = `^XA
^FO0,0^FDNormal Label^FS
^XZ`;

  it('should detect Shopee raster labels correctly', async () => {
    const plugin = new ShopeePlugin();
    
    const isShopee = await plugin.detect(shopeeZpl, 'label.zpl');
    expect(isShopee).toBe(true);

    const isNotShopee = await plugin.detect(nonShopeeZpl, 'label.zpl');
    expect(isNotShopee).toBe(false);
  });

  it('should transform Shopee labels using configuration scale', async () => {
    const plugin = new ShopeePlugin();
    const transformed = await plugin.transform(shopeeZpl);
    
    // Scale is 3 by default
    expect(transformed).toContain('^FO10,10');
    expect(transformed).toContain('^XGR:DEMO.GRF,3,3');
  });
});
