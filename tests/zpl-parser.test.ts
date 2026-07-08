import { describe, expect, it } from 'vitest';
import { parseZpl, stringifyZpl } from '../src/utils/zpl-parser.js';

describe('ZPL Parser', () => {
  it('should parse and stringify ZPL correctly preserving formatting', () => {
    const originalZpl = `^XA
^FO0,0^XGR:DEMO.GRF,1,1^FS
^XZ`;
    
    const elements = parseZpl(originalZpl);
    expect(elements).toHaveLength(7); // XA, newline, FO, XGR, FS, newline, XZ
    
    const reconstructed = stringifyZpl(elements);
    expect(reconstructed).toBe(originalZpl);
  });

  it('should allow modifying command parameters', () => {
    const originalZpl = '^FO0,0^XGR:DEMO.GRF,1,1^FS';
    const elements = parseZpl(originalZpl);

    for (const el of elements) {
      if (el.type === 'command') {
        if (el.name === 'FO') {
          el.params = ['10', '10'];
        } else if (el.name === 'XGR') {
          // params[0] is ":DEMO.GRF"
          el.params[1] = '3';
          el.params[2] = '3';
        }
      }
    }

    const modified = stringifyZpl(elements);
    expect(modified).toBe('^FO10,10^XGR:DEMO.GRF,3,3^FS');
  });

  it('should parse graphic command data blocks correctly', () => {
    const zplWithDg = '~DG:DEMO.GRF,10,2,0102030405060708090A^XA^XZ';
    const elements = parseZpl(zplWithDg);
    
    expect(elements[0].type).toBe('command');
    expect(elements[0].name).toBe('DG');
    expect(elements[0].params).toEqual([':DEMO.GRF', '10', '2', '0102030405060708090A']);

    const reconstructed = stringifyZpl(elements);
    expect(reconstructed).toBe(zplWithDg);
  });
});
