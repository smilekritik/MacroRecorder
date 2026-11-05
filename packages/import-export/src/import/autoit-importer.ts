/**
 * AutoIt .au3 script importer (primarily for AU3Recorder scripts).
 * Static interpretation: top-level calls are parsed, while control flow (loops, ifs, funcs)
 * become comment rows with warnings.
 */

import {
  MacroEventType,
  MouseButton,
} from '../../../../packages/contracts/src/index.js';
import {
  HotkeyBindingModel,
  MacroEventModel,
  MacroModel,
  normalizeEvents,
} from '../../../../packages/domain/src/model/index.js';
import { format, t } from '../../../../packages/localization/src/index.js';
import { InputKeyCatalog } from './catalog.js';
import type { ImportProbe } from './probe.js';
import { ScriptTimelineBuilder } from './script-timeline-builder.js';
import { SendSyntax } from './send-syntax.js';
import {
  MacroImportFormat,
  type IMacroImporter,
  type ImportOptions,
  type MacroImportResult,
  type MacroImportWarning,
} from './types.js';

export class AutoItImporter implements IMacroImporter {
  private static readonly CallPattern =
    /^([A-Za-z_]\w*)\s*\((.*)\)\s*$/s;

  public readonly format = MacroImportFormat.AutoIt;
  public readonly displayName = 'AutoIt';
  public readonly extensions: readonly string[] = ['.au3'];
  public readonly sniffPriority = 15;

  public canHandle(probe: ImportProbe): boolean {
    if (probe.looksBinary) {
      return false;
    }
    const text = probe.text;
    return (
      text.toLowerCase().includes('_winwaitactivate') ||
      text.toLowerCase().includes('autoit3') ||
      text.toLowerCase().includes('au3record') ||
      /^\s*(MouseClick|MouseMove|WinWaitActive|HotKeySet)\s*\(/im.test(text)
    );
  }

  public import(
    probe: ImportProbe,
    sourceName: string,
    options?: ImportOptions,
  ): MacroImportResult {
    return AutoItImporter.importText(probe.text, sourceName, options);
  }

  public static import(
    text: string,
    sourceName: string,
    options?: ImportOptions,
  ): MacroImportResult {
    return AutoItImporter.importText(text, sourceName, options);
  }

  private static importText(
    text: string,
    sourceName: string,
    options?: ImportOptions,
  ): MacroImportResult {
    const warnings: MacroImportWarning[] = [];
    const builder = new ScriptTimelineBuilder(warnings);
    let hotkey: HotkeyBindingModel | null = null;
    let lineNumber = 0;
    let blockComment = false;

    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

    for (const raw of lines) {
      lineNumber++;
      const line = raw.trim();
      if (line.length === 0) {
        continue;
      }

      if (blockComment) {
        if (
          line.toLowerCase().startsWith('#ce') ||
          line.toLowerCase().startsWith('#comments-end')
        ) {
          blockComment = false;
        } else {
          builder.commentRow(AutoItImporter.stripLeadingComment(line));
        }
        continue;
      }

      if (
        line.toLowerCase().startsWith('#cs') ||
        line.toLowerCase().startsWith('#comments-start')
      ) {
        blockComment = true;
        continue;
      }

      if (line.startsWith('#')) {
        continue;
      }

      const { code, comment } = AutoItImporter.splitLineComment(line);
      const trimmedCode = code.trim();
      if (trimmedCode.length === 0) {
        builder.commentRow(comment);
        continue;
      }

      const producedFrom = builder.events.length;
      hotkey = AutoItImporter.executeLine(trimmedCode, lineNumber, builder, hotkey);
      builder.attachComment(comment, producedFrom, true);
    }

    if (!builder.events.some((item) => !item.isComment)) {
      throw new Error(t('No importable actions were found in the .au3 file.'));
    }

    if (hotkey === null) {
      warnings.push({
        line: null,
        message: t(
          'The .au3 file has no HotKeySet; the macro was imported disabled and without a shortcut. Assign one and review the timeline.',
        ),
      });
    }

    const macro = new MacroModel({
      name: sourceName,
      description: t('Imported from AutoIt.'),
      isEnabled: options?.isEnabled ?? false,
      hotkey: hotkey ?? new HotkeyBindingModel(),
      events: normalizeEvents(builder.events.map((e) => e.toEvent())),
    });

    return {
      format: MacroImportFormat.AutoIt,
      macros: [macro],
      warnings,
    };
  }

  private static executeLine(
    code: string,
    line: number,
    builder: ScriptTimelineBuilder,
    hotkey: HotkeyBindingModel | null,
  ): HotkeyBindingModel | null {
    if (AutoItImporter.isControlFlow(code)) {
      builder.commentRow(code);
      builder.warn(
        line,
        format(
          t('Conditions, loops, and functions are not executed during static import: {0}'),
          code,
        ),
      );
      return hotkey;
    }

    if (AutoItImporter.isControlTerminator(code)) {
      return hotkey;
    }

    const call = AutoItImporter.CallPattern.exec(code);
    if (!call) {
      builder.warn(line, format(t('.au3 line not recognized: {0}'), code));
      builder.commentRow(code);
      return hotkey;
    }

    const name = call[1]?.toLowerCase() ?? '';
    const rawArgs = call[2] ?? '';
    const args = AutoItImporter.splitArguments(rawArgs);

    switch (name) {
      case 'sleep': {
        const ms = AutoItImporter.tryMilliseconds(args[0]);
        if (ms !== null) {
          builder.timeUs += ms * 1000;
        } else {
          builder.warn(line, format(t('Could not read Sleep: {0}'), code));
        }
        break;
      }
      case 'send':
        SendSyntax.parseSend(args[0] ?? '', line, builder, 'AutoIt');
        break;
      case 'mousemove': {
        const mx = AutoItImporter.tryInt(args[0]);
        const my = AutoItImporter.tryInt(args[1]);
        if (mx !== null && my !== null) {
          builder.moveTo(mx, my);
        }
        break;
      }
      case 'mouseclick':
        AutoItImporter.importMouseClick(args, builder);
        break;
      case 'mousedown':
        builder.mouse(AutoItImporter.resolveButton(args[0]), true);
        break;
      case 'mouseup':
        builder.mouse(AutoItImporter.resolveButton(args[0]), false);
        break;
      case 'mousewheel':
        AutoItImporter.importMouseWheel(args, builder);
        break;
      case 'winwaitactive':
      case '_winwaitactivate':
        builder.events.push(
          new MacroEventModel({
            timeMicroseconds: builder.timeUs,
            type: MacroEventType.WaitForWindow,
            waitWindowTitle: args[0] ?? '',
          }),
        );
        break;
      case 'hotkeyset':
        if (!hotkey) {
          hotkey = AutoItImporter.parseAutoItHotkey(args[0] ?? '', line, builder);
        }
        break;
      default:
        builder.commentRow(code);
        builder.warn(
          line,
          format(
            t('Function {0} was not executed during static import.'),
            call[1] ?? '',
          ),
        );
        break;
    }

    return hotkey;
  }

  private static importMouseClick(
    args: readonly string[],
    builder: ScriptTimelineBuilder,
  ): void {
    const button = AutoItImporter.resolveButton(args[0]);
    const x = AutoItImporter.tryInt(args[1]);
    const y = AutoItImporter.tryInt(args[2]);
    if (x !== null && y !== null) {
      builder.moveTo(x, y);
    }
    const parsedClicks = AutoItImporter.tryInt(args[3]);
    const clicks = parsedClicks !== null ? Math.min(Math.max(parsedClicks, 1), 10000) : 1;
    for (let i = 0; i < clicks; i++) {
      builder.mouseClick(button);
    }
  }

  private static importMouseWheel(
    args: readonly string[],
    builder: ScriptTimelineBuilder,
  ): void {
    const direction = (args[0] ?? 'up').trim();
    const parsedCount = AutoItImporter.tryInt(args[1]);
    const count = parsedCount !== null ? Math.min(Math.max(parsedCount, 1), 10000) : 1;
    const up = direction.toLowerCase() === 'up';
    builder.wheel(false, (up ? 1 : -1) * 120 * count);
  }

  private static parseAutoItHotkey(
    spec: string,
    line: number,
    builder: ScriptTimelineBuilder,
  ): HotkeyBindingModel {
    const binding = new HotkeyBindingModel();
    let i = 0;
    while (i < spec.length && '^!+#'.includes(spec[i]!)) {
      switch (spec[i]) {
        case '^':
          binding.control = true;
          break;
        case '!':
          binding.alt = true;
          break;
        case '+':
          binding.shift = true;
          break;
        case '#':
          binding.windows = true;
          break;
      }
      i++;
    }

    let key = spec.slice(i).trim();
    if (key.startsWith('{') && key.endsWith('}')) {
      key = key.slice(1, -1).trim();
    }

    const vk = InputKeyCatalog.tryGet(key);
    if (vk !== undefined) {
      binding.virtualKey = vk;
    } else {
      builder.warn(
        line,
        format(
          t('The HotKeySet shortcut “{0}” was not mapped to a global shortcut.'),
          spec,
        ),
      );
    }

    return binding;
  }

  private static resolveButton(name?: string): MouseButton {
    switch ((name ?? 'left').trim().toLowerCase()) {
      case 'right':
      case 'secondary':
        return MouseButton.Right;
      case 'middle':
        return MouseButton.Middle;
      case 'x1':
        return MouseButton.X1;
      case 'x2':
        return MouseButton.X2;
      default:
        return MouseButton.Left;
    }
  }

  private static isControlFlow(code: string): boolean {
    return /^(if|while|for|func|do|switch|select|with)\b/i.test(code);
  }

  private static isControlTerminator(code: string): boolean {
    return /^(endif|wend|next|endfunc|else|elseif|endswitch|endselect|endwith|until|case|return|exit|continueloop|continuecase)\b/i.test(
      code,
    );
  }

  /**
   * Splits off a trailing AutoIt comment (; outside a string).
   */
  private static splitLineComment(line: string): { code: string; comment: string } {
    let quoted = false;
    let quote = '"';

    for (let i = 0; i < line.length; i++) {
      const current = line[i]!;
      if (quoted) {
        if (current === quote) {
          quoted = false;
        }
        continue;
      }
      if (current === '"' || current === "'") {
        quoted = true;
        quote = current;
        continue;
      }
      if (current === ';') {
        return {
          code: line.slice(0, i),
          comment: AutoItImporter.stripLeadingComment(line.slice(i)),
        };
      }
    }

    return { code: line, comment: '' };
  }

  private static stripLeadingComment(text: string): string {
    let value = text.trim();
    while (value.startsWith(';')) {
      value = value.slice(1).trimStart();
    }
    return value.trim();
  }

  private static splitArguments(inside: string): string[] {
    const result: string[] = [];
    let current = '';
    let inString = false;
    let quote = '"';

    for (let i = 0; i < inside.length; i++) {
      const c = inside[i]!;
      if (inString) {
        if (c === quote) {
          if (i + 1 < inside.length && inside[i + 1] === quote) {
            current += quote;
            i++;
          } else {
            inString = false;
          }
        } else {
          current += c;
        }
      } else if (c === '"' || c === "'") {
        inString = true;
        quote = c;
      } else if (c === ',') {
        result.push(current.trim());
        current = '';
      } else {
        current += c;
      }
    }

    result.push(current.trim());
    return result;
  }

  private static tryMilliseconds(token?: string): number | null {
    if (!token) {
      return null;
    }
    const val = parseFloat(token.trim());
    if (isNaN(val) || val < 0) {
      return null;
    }
    return Math.round(val);
  }

  private static tryInt(token?: string): number | null {
    if (!token) {
      return null;
    }
    const val = parseInt(token.trim(), 10);
    return isNaN(val) ? null : val;
  }
}
