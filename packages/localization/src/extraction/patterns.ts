/**
 * Unescapes JavaScript/TypeScript string literal escapes.
 */
export function unescapeJsString(raw: string): string {
  let result = '';
  let i = 0;
  const len = raw.length;

  while (i < len) {
    const c = raw[i];
    if (c === '\\' && i + 1 < len) {
      i++;
      const next = raw[i];
      switch (next) {
        case 'n':
          result += '\n';
          break;
        case 'r':
          result += '\r';
          break;
        case 't':
          result += '\t';
          break;
        case '"':
          result += '"';
          break;
        case "'":
          result += "'";
          break;
        case '`':
          result += '`';
          break;
        case '\\':
          result += '\\';
          break;
        case '0':
          result += '\0';
          break;
        case 'u':
          if (i + 4 < len) {
            const hex = raw.substring(i + 1, i + 5);
            const codePoint = parseInt(hex, 16);
            if (!isNaN(codePoint)) {
              result += String.fromCharCode(codePoint);
              i += 4;
              break;
            }
          }
          result += 'u';
          break;
        default:
          result += next;
      }
    } else {
      result += c;
    }
    i++;
  }

  return result;
}

/**
 * Unescapes verbatim and regular string literal escapes.
 */
export function unescapeCsString(raw: string): string {
  return unescapeJsString(raw);
}

/**
 * Decodes XML / XAML entities.
 */
export function decodeXmlEntities(str: string): string {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}
