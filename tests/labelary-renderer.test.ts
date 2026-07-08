import { describe, expect, it, vi } from 'vitest';
import { LabelaryRenderer } from '../src/converters/implementations/LabelaryRenderer.js';
import { loadConfig } from '../src/config/config.js';

describe('Labelary Renderer', () => {
  loadConfig();

  it('should call Labelary API with correct headers and return PDF buffer', async () => {
    const mockPdfBuffer = Buffer.from('%PDF-1.4 Mock PDF Content');
    
    // Mock global fetch
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      expect(url).toBe('http://api.labelary.com/v1/printers/8dpmm/labels/4x6/0/');
      expect(init?.method).toBe('POST');
      expect((init?.headers as any)['Accept']).toBe('application/pdf');
      expect(init?.body).toBe('^XA^XZ');
      
      return {
        ok: true,
        arrayBuffer: async () => mockPdfBuffer.buffer,
      } as Response;
    });

    const renderer = new LabelaryRenderer();
    const result = await renderer.render('^XA^XZ');
    
    expect(result).toBeInstanceOf(Buffer);
    expect(result.toString()).toContain('Mock PDF Content');
    
    fetchSpy.mockRestore();
  });

  it('should propagate HTTP error statuses', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async () => {
      return {
        ok: false,
        status: 400,
        text: async () => 'Invalid ZPL command',
      } as Response;
    });

    const renderer = new LabelaryRenderer();
    await expect(renderer.render('^XA^XZ')).rejects.toThrow('Labelary returned status 400: Invalid ZPL command');
    
    fetchSpy.mockRestore();
  });
});
