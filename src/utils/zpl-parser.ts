export type ZplElement =
  | { type: 'text'; content: string }
  | { type: 'command'; prefix: '^' | '~'; name: string; params: string[] };

/**
 * Parses ZPL string into a structured array of commands and text nodes.
 */
export function parseZpl(zpl: string): ZplElement[] {
  const elements: ZplElement[] = [];
  let i = 0;
  let currentText = '';

  const flushText = () => {
    if (currentText) {
      elements.push({ type: 'text', content: currentText });
      currentText = '';
    }
  };

  while (i < zpl.length) {
    const char = zpl[i];
    if (char === '^' || char === '~') {
      flushText();
      const prefix = char;
      i++;
      
      // Read command name (alphabetical letters)
      let name = '';
      while (i < zpl.length && /[A-Za-z]/.test(zpl[i])) {
        name += zpl[i];
        i++;
      }
      
      // Read the rest of the command until the next command starts or string ends
      let rest = '';
      while (i < zpl.length && zpl[i] !== '^' && zpl[i] !== '~') {
        rest += zpl[i];
        i++;
      }
      
      let params: string[] = [];
      if (rest) {
        // Extract any trailing whitespace/newlines so they are preserved as text nodes
        const matchTrailing = rest.match(/([\s\r\n]+)$/);
        let trailing = '';
        if (matchTrailing) {
          trailing = matchTrailing[0];
          rest = rest.substring(0, rest.length - trailing.length);
        }
        
        if (rest) {
          params = rest.split(',');
        }
        
        elements.push({
          type: 'command',
          prefix,
          name,
          params,
        });
        
        if (trailing) {
          currentText += trailing;
        }
      } else {
        elements.push({
          type: 'command',
          prefix,
          name,
          params: [],
        });
      }
    } else {
      currentText += char;
      i++;
    }
  }
  
  flushText();
  return elements;
}

/**
 * Stringifies ZplElements back into a standard ZPL string.
 */
export function stringifyZpl(elements: ZplElement[]): string {
  return elements
    .map((el) => {
      if (el.type === 'text') {
        return el.content;
      }
      return `${el.prefix}${el.name}${el.params.join(',')}`;
    })
    .join('');
}
