import { LabelRenderer, RenderOptions } from '../LabelRenderer.js';
import { LocalRenderer } from './LocalRenderer.js';

/**
 * Backward-compatible wrapper kept only for older tests/imports.
 * The project renders locally using `LocalRenderer`.
 */
export class LabelaryRenderer implements LabelRenderer {
  async render(zpl: string, options?: RenderOptions): Promise<Buffer> {
    const renderer = new LocalRenderer();
    return renderer.render(zpl, options);
  }
}
