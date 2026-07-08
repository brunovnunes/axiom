export interface RenderOptions {
  width?: number; // width in inches, default 4
  height?: number; // height in inches, default 6
  dpmm?: number; // dots per mm (e.g. 8dpmm = 203 dpi), default 8
}

export interface LabelRenderer {
  render(zpl: string, options?: RenderOptions): Promise<Buffer>;
}
