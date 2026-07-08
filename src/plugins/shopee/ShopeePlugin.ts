import { MarketplacePlugin } from '../MarketplacePlugin.js';
import { getConfig } from '../../config/config.js';
import { parseZpl, stringifyZpl } from '../../utils/zpl-parser.js';

export class ShopeePlugin implements MarketplacePlugin {
  name = 'shopee';

  async detect(content: string, _filename: string): Promise<boolean> {
    // Detection rule: ZPL file contains "~DGR:" and "^XGR:"
    return content.includes('~DGR:') && content.includes('^XGR:');
  }

  async transform(content: string): Promise<string> {
    const config = getConfig();
    const scale = config.shopeeRasterScale;
    
    const elements = parseZpl(content);
    
    // Scan elements to find FO followed by XG/XGR
    let lastFo: any = null;
    
    for (const el of elements) {
      if (el.type === 'command') {
        if (el.name === 'FO') {
          lastFo = el;
        } else if (el.name === 'XG' || el.name === 'XGR') {
          if (lastFo) {
            // Apply scale configuration to XG/XGR parameters
            const scaleStr = String(scale);
            
            // Adjust coordinates of Field Origin (FO) to prevent clipping
            const x = lastFo.params[0] || '0';
            const y = lastFo.params[1] || '0';
            const numX = isNaN(Number(x)) ? 0 : Number(x);
            const numY = isNaN(Number(y)) ? 0 : Number(y);
            
            lastFo.params[0] = String(numX + 10);
            lastFo.params[1] = String(numY + 10);
            
            // Update scale parameters in recalled graphic
            el.params[1] = scaleStr;
            el.params[2] = scaleStr;
            
            // Reset lastFo to ensure we don't accidentally reuse it for subsequent XG commands
            lastFo = null;
          }
        }
      }
    }
    
    return stringifyZpl(elements);
  }
}
