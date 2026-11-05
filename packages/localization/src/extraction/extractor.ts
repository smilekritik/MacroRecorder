import fs from 'fs';
import path from 'path';
import type { ExtractedKeyInfo } from '../types.js';
import { decodeXmlEntities, unescapeCsString, unescapeJsString } from './patterns.js';

function computeLineAndColumn(content: string, index: number): { line: number; column: number } {
  let line = 1;
  let lastNewline = -1;

  for (let i = 0; i < index && i < content.length; i++) {
    if (content[i] === '\n') {
      line++;
      lastNewline = i;
    }
  }

  const column = index - lastNewline;
  return { line, column };
}

/**
 * Extracts localized keys from a single source file string.
 */
export function extractKeysFromContent(content: string, filePath: string): ExtractedKeyInfo[] {
  const results: ExtractedKeyInfo[] = [];
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.cs') {
    // Method calls:
    // LocalizedText.Get("...")
    // LocalizedText.Format("...")
    // LocalizationManager.Instance.Format("...")
    // LocalizationManager.Instance.Translate("...")
    const csRegex =
      /(?:LocalizedText\.Get|LocalizedText\.Format|LocalizationManager\.Instance\.Format|LocalizationManager\.Instance\.Translate)\(\s*"((?:[^"\\]|\\.)*)"/g;

    let match: RegExpExecArray | null;
    while ((match = csRegex.exec(content)) !== null) {
      if (match[1] !== undefined) {
        const key = unescapeCsString(match[1]);
        const { line, column } = computeLineAndColumn(content, match.index);
        results.push({
          key,
          file: filePath,
          line,
          column,
          sourceSnippet: match[0],
        });
      }
    }
  } else if (ext === '.xaml') {
    // XAML markup extensions:
    // local:Tr Text='...' or local:Tr Text="..."
    const xamlRegex = /(?:local:)?Tr\s+Text=(?:'([^']*)'|"([^"]*)")/g;

    let match: RegExpExecArray | null;
    while ((match = xamlRegex.exec(content)) !== null) {
      const raw = match[1] !== undefined ? match[1] : match[2];
      if (raw !== undefined) {
        const key = decodeXmlEntities(raw);
        const { line, column } = computeLineAndColumn(content, match.index);
        results.push({
          key,
          file: filePath,
          line,
          column,
          sourceSnippet: match[0],
        });
      }
    }
  } else {
    // TS, TSX, JS, JSX, etc.
    // 1. Function calls:
    // \b(?:t|format|translate|localize)\(\s*(["'`])((?:[^\\]|\\.)*?)\1
    // localizationManager\.(?:translate|format|t)\(\s*(["'`])((?:[^\\]|\\.)*?)\1
    // i18n\.t\(\s*(["'`])((?:[^\\]|\\.)*?)\1
    const tsFuncRegex =
      /\b(?:t|format|translate|localize|localizationManager\.(?:translate|format|t)|i18n\.t)\(\s*(["'`])((?:\\.|(?!\1)[^\\])*?)\1/g;

    let match: RegExpExecArray | null;
    while ((match = tsFuncRegex.exec(content)) !== null) {
      if (match[2] !== undefined) {
        const key = unescapeJsString(match[2]);
        const { line, column } = computeLineAndColumn(content, match.index);
        results.push({
          key,
          file: filePath,
          line,
          column,
          sourceSnippet: match[0],
        });
      }
    }

    // 2. React component <Tr text="..." /> or <Tr text='...' />
    const trTagRegex = /<Tr\s+[^>]*\btext=(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
    while ((match = trTagRegex.exec(content)) !== null) {
      const raw = match[1] !== undefined ? match[1] : match[2];
      if (raw !== undefined) {
        const key = unescapeJsString(raw);
        const { line, column } = computeLineAndColumn(content, match.index);
        results.push({
          key,
          file: filePath,
          line,
          column,
          sourceSnippet: match[0],
        });
      }
    }
  }

  return results;
}

export interface ExtractDirectoryOptions {
  readonly extensions?: readonly string[];
  readonly excludeDirs?: readonly string[];
}

const DEFAULT_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.cs', '.xaml'];
const DEFAULT_EXCLUDE_DIRS = [
  'node_modules',
  'dist',
  'artifacts',
  'build',
  'bin',
  'obj',
  '.git',
  'target',
  'tests',
  '__tests__',
  'test',
  'spec',
];

/**
 * Recursively extracts all localization keys referenced within a directory.
 */
export function extractKeysFromDirectory(
  dirPath: string,
  options: ExtractDirectoryOptions = {},
): ExtractedKeyInfo[] {
  const extensions = new Set(
    (options.extensions || DEFAULT_EXTENSIONS).map((ext) => ext.toLowerCase()),
  );
  const excludeDirs = new Set(options.excludeDirs || DEFAULT_EXCLUDE_DIRS);

  const results: ExtractedKeyInfo[] = [];

  function walk(currentDir: string): void {
    if (!fs.existsSync(currentDir)) {
      return;
    }

    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (!excludeDirs.has(entry.name.toLowerCase())) {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        // Skip test files
        if (/\.(test|spec)\.[a-z0-9]+$/i.test(entry.name)) {
          continue;
        }

        const ext = path.extname(entry.name).toLowerCase();
        if (extensions.has(ext)) {
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            const extracted = extractKeysFromContent(content, fullPath);
            results.push(...extracted);
          } catch {
            // Skip unreadable files
          }
        }
      }
    }
  }

  walk(dirPath);
  return results;
}
