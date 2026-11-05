/**
 * Lightweight, safe, zero-dependency XML parser for AMC and Razer Synapse imports.
 * Emulates System.Xml.Linq XDocument / XElement navigation.
 */

export class XmlElement {
  public readonly name: string;
  public readonly localName: string;
  public readonly attributes: Record<string, string>;
  public readonly children: XmlElement[] = [];
  public text = '';
  public readonly line: number;

  public get value(): string {
    return this.text;
  }

  public constructor(name: string, line = 1, attributes: Record<string, string> = {}) {
    this.name = name;
    this.line = line;
    this.attributes = attributes;
    const colonIdx = name.indexOf(':');
    this.localName = colonIdx >= 0 ? name.slice(colonIdx + 1) : name;
  }

  /** Direct first child element by localName (case-insensitive). */
  public element(name: string): XmlElement | undefined {
    const target = name.toLowerCase();
    return this.children.find((c) => c.localName.toLowerCase() === target);
  }

  /** Direct child elements, optionally filtered by localName (case-insensitive). */
  public elements(name?: string): XmlElement[] {
    if (!name) {
      return [...this.children];
    }
    const target = name.toLowerCase();
    return this.children.filter((c) => c.localName.toLowerCase() === target);
  }

  /** All descendant elements recursively, optionally filtered by localName. */
  public descendants(name?: string): XmlElement[] {
    const result: XmlElement[] = [];
    const target = name ? name.toLowerCase() : null;

    const walk = (current: XmlElement): void => {
      for (const child of current.children) {
        if (!target || child.localName.toLowerCase() === target) {
          result.push(child);
        }
        walk(child);
      }
    };

    walk(this);
    return result;
  }

  /** Text content of the named child element, trimmed. */
  public childValue(name: string): string | undefined {
    const child = this.element(name);
    return child ? child.text.trim() : undefined;
  }
}

export function decodeXmlEntities(str: string): string {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Parses XML into a root XmlElement.
 * Throws an Error on malformed or truncated XML.
 */
export function parseXml(xml: string): XmlElement {
  let pos = 0;
  let currentLine = 1;
  const root = new XmlElement('__root__', 1);
  const stack: XmlElement[] = [root];

  while (pos < xml.length) {
    const nextLt = xml.indexOf('<', pos);
    if (nextLt === -1) {
      if (stack.length > 1) {
        const textContent = xml.slice(pos);
        stack[stack.length - 1]!.text += decodeXmlEntities(textContent);
      }
      break;
    }

    if (nextLt > pos && stack.length > 1) {
      const textChunk = xml.slice(pos, nextLt);
      stack[stack.length - 1]!.text += decodeXmlEntities(textChunk);
      const linesInChunk = textChunk.split('\n').length - 1;
      currentLine += linesInChunk;
    }
    pos = nextLt;

    // Comment <!-- ... -->
    if (xml.startsWith('<!--', pos)) {
      const close = xml.indexOf('-->', pos + 4);
      if (close === -1) {
        throw new Error('Unclosed XML comment');
      }
      const commentChunk = xml.slice(pos, close + 3);
      currentLine += commentChunk.split('\n').length - 1;
      pos = close + 3;
      continue;
    }

    // CDATA <![CDATA[ ... ]]>
    if (xml.startsWith('<![CDATA[', pos)) {
      const close = xml.indexOf(']]>', pos + 9);
      if (close === -1) {
        throw new Error('Unclosed CDATA section');
      }
      const cdataText = xml.slice(pos + 9, close);
      if (stack.length > 1) {
        stack[stack.length - 1]!.text += cdataText;
      }
      const cdataChunk = xml.slice(pos, close + 3);
      currentLine += cdataChunk.split('\n').length - 1;
      pos = close + 3;
      continue;
    }

    // Processing instructions <? ... ?> or DOCTYPE <! ... >
    if (xml.startsWith('<?', pos) || xml.startsWith('<!', pos)) {
      const close = xml.indexOf('>', pos + 2);
      if (close === -1) {
        throw new Error('Unclosed processing instruction or declaration');
      }
      const piChunk = xml.slice(pos, close + 1);
      currentLine += piChunk.split('\n').length - 1;
      pos = close + 1;
      continue;
    }

    // Closing tag </tag>
    if (xml.startsWith('</', pos)) {
      const close = xml.indexOf('>', pos + 2);
      if (close === -1) {
        throw new Error('Unclosed closing tag');
      }
      const tagContent = xml.slice(pos + 2, close).trim();
      const closeChunk = xml.slice(pos, close + 1);
      currentLine += closeChunk.split('\n').length - 1;
      pos = close + 1;

      if (stack.length <= 1) {
        throw new Error(`Unexpected closing tag: </${tagContent}>`);
      }
      const top = stack.pop()!;
      if (top.name.toLowerCase() !== tagContent.toLowerCase()) {
        throw new Error(`Mismatched closing tag: expected </${top.name}>, found </${tagContent}>`);
      }
      continue;
    }

    // Open tag <tag attr="val" ... [/]>
    const tagEnd = xml.indexOf('>', pos + 1);
    if (tagEnd === -1) {
      throw new Error('Unclosed opening tag');
    }
    const fullTag = xml.slice(pos + 1, tagEnd);
    const tagChunk = xml.slice(pos, tagEnd + 1);
    currentLine += tagChunk.split('\n').length - 1;
    pos = tagEnd + 1;

    const trimmed = fullTag.trim();
    const isSelfClosing = trimmed.endsWith('/');
    const tagBody = isSelfClosing ? trimmed.slice(0, -1).trim() : trimmed;

    // Parse tag name and attributes
    const nameMatch = /^([^\s/]+)/.exec(tagBody);
    if (!nameMatch) {
      throw new Error('Empty XML tag name');
    }
    const tagName = nameMatch[1]!;
    const attributes: Record<string, string> = {};

    const attrRegex = /([a-zA-Z0-9_:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = attrRegex.exec(tagBody)) !== null) {
      attributes[attrMatch[1]!] = decodeXmlEntities(attrMatch[2] ?? attrMatch[3] ?? '');
    }

    const element = new XmlElement(tagName, currentLine, attributes);
    stack[stack.length - 1]!.children.push(element);

    if (!isSelfClosing) {
      stack.push(element);
    }
  }

  if (stack.length > 1) {
    throw new Error(`Unclosed XML tag: <${stack[stack.length - 1]!.name}>`);
  }

  return root;
}
