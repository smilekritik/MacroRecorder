/**
 * AutoHotkey v2 script importer.
 */

import {
  MacroImportFormat,
  MouseButton,
  type MacroImportResult,
  type MacroImportWarning,
} from '../../../../packages/contracts/src/index.js';
import {
  HotkeyBindingModel,
  MacroModel,
  normalizeEvents,
} from '../../../../packages/domain/src/model/index.js';
import { format, t } from '../../../../packages/localization/src/index.js';
import { InputKeyCatalog } from './catalog.js';
import { NumericExpression } from './numeric-expression.js';
import type { ImportProbe } from './probe.js';
import { ScriptTimelineBuilder } from './script-timeline-builder.js';
import { SendSyntax } from './send-syntax.js';
import type { IMacroImporter, ImportOptions } from './types.js';

interface SourceLine {
  readonly number: number;
  text: string;
  readonly comment: string;
  readonly isComment: boolean;
}

interface HotkeySection {
  readonly line: number;
  readonly trigger: string;
  readonly body: SourceLine[];
}

export class AutoHotkeyImporter implements IMacroImporter {
  public readonly format = MacroImportFormat.AutoHotkey;
  public readonly displayName = 'AutoHotkey';
  public readonly extensions = ['.ahk'] as const;
  public readonly sniffPriority = 20;

  public canHandle(probe: ImportProbe): boolean {
    if (probe.looksBinary) {
      return false;
    }
    const text = probe.text;
    return (
      text.toLowerCase().includes('autohotkey') ||
      /(?:^|\n)\s*[^;\r\n]+::/.test(text)
    );
  }

  public import(
    probe: ImportProbe,
    sourceName: string,
    options?: ImportOptions,
  ): MacroImportResult {
    return AutoHotkeyImporter.importText(probe.text, sourceName, options);
  }

  public static import(
    text: string,
    sourceName: string,
    options?: ImportOptions,
  ): MacroImportResult {
    return AutoHotkeyImporter.importText(text, sourceName, options);
  }

  private static readonly HotkeyPattern = /^(?<trigger>[^\s].*?)::\s*(?<tail>.*)$/;
  private static readonly AssignmentPattern = /^(?<name>[A-Za-z_#][\w#]*)\s*(?::=|=)\s*(?<value>.+)$/;
  private static readonly CommandPattern = /^(?<name>[A-Za-z][\w]*)(?:\s*,?\s*)(?<args>.*)$/;

  public static importText(
    text: string,
    sourceName: string,
    _options?: ImportOptions,
  ): MacroImportResult {
    const warnings: MacroImportWarning[] = [];
    const lines = AutoHotkeyImporter.prepareLines(text);
    const globals = AutoHotkeyImporter.parseGlobalConstants(lines, warnings);
    const sections = AutoHotkeyImporter.extractHotkeySections(lines, warnings);
    const imported: Array<{ macro: MacroModel; trigger: string }> = [];

    for (const section of sections) {
      const state = new ScriptTimelineBuilder(warnings);
      for (const [k, v] of globals.entries()) {
        state.variables.set(k.toLowerCase(), v);
      }

      AutoHotkeyImporter.executeRange(section.body, 0, section.body.length, state, 0, true);

      if (!state.events.some((e) => e.type !== 'Comment')) {
        if (
          section.body.some((x) => x.text.length > 0) &&
          !AutoHotkeyImporter.isServiceOnly(section.body)
        ) {
          warnings.push({
            line: section.line,
            message: format(
              'Hotkey “{0}” contains no recognized actions and was skipped.',
              section.trigger,
            ),
          });
        }
        continue;
      }

      const hotkey = AutoHotkeyImporter.parseHotkey(section.trigger, section.line, warnings);
      const macro = new MacroModel({
        name: sourceName,
        description: format('Imported from AutoHotkey. Original hotkey: {0}.', section.trigger),
        isEnabled: false,
        hotkey,
        events: normalizeEvents(state.events.map((e) => e.toEvent())),
      });

      imported.push({ macro, trigger: section.trigger });
    }

    if (imported.length > 1) {
      for (const item of imported) {
        item.macro.name = `${sourceName} — ${item.trigger}`;
      }
    }

    if (imported.length === 0) {
      throw new Error(t('No importable actions were found inside hotkeys in the AHK file.'));
    }

    warnings.push({
      line: null,
      message: t(
        'External macros were imported disabled. Review the timeline, then enable the required macros manually.',
      ),
    });

    return {
      format: MacroImportFormat.AutoHotkey,
      macros: imported.map((x) => x.macro),
      warnings,
    };
  }

  private static isServiceOnly(body: readonly SourceLine[]): boolean {
    return body
      .filter((x) => x.text.length > 0)
      .every((x) => /^(Pause|ExitApp|Reload|Suspend)\s*(?:\(.*\))?$/i.test(x.text));
  }

  private static parseGlobalConstants(
    lines: readonly SourceLine[],
    warnings: MacroImportWarning[],
  ): Map<string, number> {
    const result = new Map<string, number>();
    for (const line of lines) {
      if (AutoHotkeyImporter.HotkeyPattern.test(line.text)) {
        break;
      }
      const match = AutoHotkeyImporter.AssignmentPattern.exec(line.text);
      if (!match) {
        continue;
      }
      const name = match.groups?.['name'] ?? '';
      const valExpr = match.groups?.['value'] ?? '';
      const evalResult = NumericExpression.tryEvaluate(valExpr, result);
      if (evalResult.success) {
        result.set(name.toLowerCase(), evalResult.value);
      } else {
        warnings.push({
          line: line.number,
          message: format('Global variable {0} is not a static number.', name),
        });
      }
    }
    return result;
  }

  private static prepareLines(text: string): SourceLine[] {
    const result: SourceLine[] = [];
    let blockComment = false;
    const source = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

    for (let i = 0; i < source.length; i++) {
      const trimmed = source[i]!.trim();
      if (blockComment) {
        const closing = trimmed.indexOf('*/');
        if (closing >= 0) {
          blockComment = false;
          AutoHotkeyImporter.addCommentLine(result, i + 1, trimmed.slice(0, closing));
        } else {
          AutoHotkeyImporter.addCommentLine(result, i + 1, trimmed);
        }
        continue;
      }

      if (trimmed.startsWith('/*')) {
        const closing = trimmed.indexOf('*/', 2);
        blockComment = closing < 0;
        AutoHotkeyImporter.addCommentLine(
          result,
          i + 1,
          closing < 0 ? trimmed.slice(2) : trimmed.slice(2, closing),
        );
        continue;
      }

      const { code, comment } = AutoHotkeyImporter.splitLineComment(source[i]!);
      const trimmedCode = code.trim();
      if (trimmedCode.length === 0) {
        AutoHotkeyImporter.addCommentLine(result, i + 1, comment);
        continue;
      }
      result.push({
        number: i + 1,
        text: trimmedCode,
        comment: AutoHotkeyImporter.cleanCommentText(comment),
        isComment: false,
      });
    }
    return result;
  }

  private static addCommentLine(lines: SourceLine[], number: number, text: string): void {
    const val = AutoHotkeyImporter.cleanCommentText(text);
    if (val.length === 0) {
      return;
    }
    lines.push({
      number,
      text: '',
      comment: val,
      isComment: true,
    });
  }

  private static cleanCommentText(text: string): string {
    let value = text.trim();
    while (value.startsWith(';')) {
      value = value.slice(1).trimStart();
    }
    if (value.startsWith('* ')) {
      value = value.slice(2).trimStart();
    }
    return value.trim();
  }

  private static splitLineComment(line: string): { code: string; comment: string } {
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const cur = line[i]!;
      if (cur === '`') {
        i++;
        continue;
      }
      if (cur === '"') {
        quoted = !quoted;
        continue;
      }
      if (cur !== ';' || quoted) {
        continue;
      }
      if (i > 0 && !/\s/.test(line[i - 1]!)) {
        continue;
      }
      return {
        code: line.slice(0, i),
        comment: line.slice(i + 1),
      };
    }
    return { code: line, comment: '' };
  }

  private static extractHotkeySections(
    lines: readonly SourceLine[],
    warnings: MacroImportWarning[],
  ): HotkeySection[] {
    const result: HotkeySection[] = [];
    let pending = 0;

    for (let i = 0; i < lines.length; i++) {
      const match = AutoHotkeyImporter.HotkeyPattern.exec(lines[i]!.text);
      if (!match) {
        continue;
      }
      const hotkeyLine = lines[i]!.number;
      const trigger = match.groups?.['trigger']?.trim() ?? '';
      const tail = match.groups?.['tail']?.trim() ?? '';
      const body: SourceLine[] = [];

      for (let lead = pending; lead < i; lead++) {
        if (lines[lead]!.isComment) {
          body.push(lines[lead]!);
        }
      }

      if (tail.startsWith('{')) {
        let depth = AutoHotkeyImporter.braceDelta(tail);
        const afterBrace = tail.slice(1).trim();
        if (afterBrace.length > 0 && afterBrace !== '}') {
          body.push({
            number: lines[i]!.number,
            text: afterBrace.endsWith('}') ? afterBrace.slice(0, -1).trim() : afterBrace,
            comment: lines[i]!.comment,
            isComment: false,
          });
        }
        while (depth > 0 && ++i < lines.length) {
          depth += AutoHotkeyImporter.braceDelta(lines[i]!.text);
          let content = lines[i]!.text;
          if (depth === 0 && content.trim() === '}') {
            continue;
          }
          if (depth === 0) {
            const lastBrace = content.lastIndexOf('}');
            content = content.slice(0, lastBrace);
          }
          body.push({
            number: lines[i]!.number,
            text: content.trim(),
            comment: lines[i]!.comment,
            isComment: lines[i]!.isComment,
          });
        }
        if (depth > 0) {
          warnings.push({
            line: hotkeyLine,
            message: format('Unclosed hotkey block “{0}”.', trigger),
          });
        }
      } else if (tail.length > 0) {
        body.push({
          number: lines[i]!.number,
          text: tail,
          comment: lines[i]!.comment,
          isComment: false,
        });
      } else {
        let cursor = i + 1;
        while (
          cursor < lines.length &&
          !AutoHotkeyImporter.HotkeyPattern.test(lines[cursor]!.text) &&
          lines[cursor]!.text.toLowerCase() !== 'return'
        ) {
          body.push(lines[cursor++]!);
        }
        i = cursor - 1;
      }
      pending = i + 1;
      result.push({ line: hotkeyLine, trigger, body });
    }

    if (result.length > 0) {
      for (let rest = pending; rest < lines.length; rest++) {
        if (lines[rest]!.isComment) {
          result[result.length - 1]!.body.push(lines[rest]!);
        }
      }
    }

    return result;
  }

  private static braceDelta(text: string): number {
    let delta = 0;
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i]!;
      if (c === '"') {
        quoted = !quoted;
      }
      if (quoted) {
        continue;
      }
      if (c === '{') {
        delta++;
      } else if (c === '}') {
        delta--;
      }
    }
    return delta;
  }

  private static executeRange(
    lines: readonly SourceLine[],
    start: number,
    end: number,
    state: ScriptTimelineBuilder,
    depth: number,
    allowCommentRows: boolean,
  ): void {
    if (depth > 16) {
      state.warn(null, t('Block nesting is too deep; the remainder was skipped.'));
      return;
    }
    for (let i = start; i < end; i++) {
      const line = lines[i]!;
      if (line.isComment) {
        if (allowCommentRows) {
          state.commentRow(line.comment);
        }
        continue;
      }
      const producedFrom = state.events.length;
      i = AutoHotkeyImporter.executeLine(lines, i, end, state, depth, allowCommentRows);
      state.attachComment(line.comment, producedFrom, allowCommentRows);
    }
  }

  private static executeLine(
    lines: readonly SourceLine[],
    index: number,
    end: number,
    state: ScriptTimelineBuilder,
    depth: number,
    allowCommentRows: boolean,
  ): number {
    const line = lines[index]!;
    const code = line.text.trim();
    if (code.length === 0 || code === '{' || code === '}' || code.startsWith('#')) {
      return index;
    }

    const loopHeader = AutoHotkeyImporter.tryLoopHeader(code, state);
    if (loopHeader !== null) {
      const open = code.includes('{')
        ? index
        : AutoHotkeyImporter.nextCodeLine(lines, index + 1, end);
      if (open >= end || (open !== index && lines[open]!.text.trim() !== '{')) {
        state.warn(line.number, t('Loop without a static block was skipped.'));
        return index;
      }
      const close = AutoHotkeyImporter.findClosingBrace(lines, open, end);
      if (close < 0) {
        state.warn(line.number, t('Unclosed Loop was skipped.'));
        return index;
      }
      if (loopHeader < 0 || loopHeader > 10_000) {
        state.warn(line.number, t('Loop count is outside 0–10000; the block was skipped.'));
      } else {
        for (let repeat = 0; repeat < loopHeader; repeat++) {
          AutoHotkeyImporter.executeRange(
            lines,
            open + 1,
            close,
            state,
            depth + 1,
            allowCommentRows && repeat === 0,
          );
        }
      }
      return close;
    }

    if (AutoHotkeyImporter.startsDynamicBlock(code)) {
      const open = code.includes('{')
        ? index
        : AutoHotkeyImporter.nextCodeLine(lines, index + 1, end);
      const close = open < end ? AutoHotkeyImporter.findClosingBrace(lines, open, end) : -1;
      state.warn(
        line.number,
        t('A conditional, dynamic, or function block was not executed during safe import.'),
      );
      return close >= 0 ? close : index;
    }

    const assignMatch = AutoHotkeyImporter.AssignmentPattern.exec(code);
    if (assignMatch) {
      const name = assignMatch.groups?.['name'] ?? '';
      const valExpr = assignMatch.groups?.['value'] ?? '';
      const evalResult = NumericExpression.tryEvaluate(valExpr, state.variables);
      if (evalResult.success) {
        state.variables.set(name.toLowerCase(), evalResult.value);
        return index;
      }
    }

    const cmdMatch = AutoHotkeyImporter.CommandPattern.exec(code);
    if (!cmdMatch) {
      state.warn(line.number, format('Not recognized: {0}', code));
      return index;
    }

    const name = cmdMatch.groups?.['name'] ?? '';
    const rawArgs = cmdMatch.groups?.['args'] ?? '';
    const args = AutoHotkeyImporter.normalizeCommandArguments(rawArgs);

    switch (name.toLowerCase()) {
      case 'sleep': {
        const sleepUs = AutoHotkeyImporter.tryDuration(args, state);
        if (sleepUs !== null) {
          state.timeUs += sleepUs;
        } else {
          state.warn(line.number, format('Could not evaluate Sleep: {0}', args));
        }
        break;
      }
      case 'send':
      case 'sendinput':
      case 'sendevent':
      case 'sendplay':
        SendSyntax.parseSend(
          AutoHotkeyImporter.unquoteCommandArgument(args),
          line.number,
          state,
          'AutoHotkey',
        );
        break;
      case 'sendtext':
        AutoHotkeyImporter.parsePlainText(
          AutoHotkeyImporter.unquoteCommandArgument(args),
          line.number,
          state,
        );
        break;
      case 'click':
        SendSyntax.parseClick(
          AutoHotkeyImporter.unquoteCommandArgument(args),
          line.number,
          state,
        );
        break;
      case 'mouseclick':
        AutoHotkeyImporter.parseMouseClick(args, line.number, state);
        break;
      case 'setkeydelay':
        AutoHotkeyImporter.parseDelaySettings(args, state, true, line.number);
        break;
      case 'setmousedelay':
        AutoHotkeyImporter.parseDelaySettings(args, state, false, line.number);
        break;
      case 'return':
      case 'pause':
      case 'exitapp':
        break;
      default:
        state.warn(
          line.number,
          format('Command {0} was not executed during static import.', name),
        );
        break;
    }
    return index;
  }

  private static nextCodeLine(lines: readonly SourceLine[], index: number, end: number): number {
    let cur = index;
    while (cur < end && lines[cur]!.isComment) {
      cur++;
    }
    return cur;
  }

  private static tryLoopHeader(code: string, state: ScriptTimelineBuilder): number | null {
    const match = /^Loop(?:\s*,?\s*)(?<count>[^\s{]+)\s*\{?\s*$/i.exec(code);
    if (!match) {
      return null;
    }
    const countExpr = match.groups?.['count'] ?? '';
    const res = NumericExpression.tryEvaluate(countExpr, state.variables);
    if (res.success && res.value >= 0) {
      return Math.round(res.value);
    }
    return null;
  }

  private static findClosingBrace(
    lines: readonly SourceLine[],
    open: number,
    end: number,
  ): number {
    let depth = 0;
    for (let i = open; i < end; i++) {
      depth += AutoHotkeyImporter.braceDelta(lines[i]!.text);
      if (depth === 0 && i > open) {
        return i;
      }
    }
    return -1;
  }

  private static startsDynamicBlock(code: string): boolean {
    return /^(if|else|while|for|try|catch|finally|class)\b|^[A-Za-z_]\w*\s*\([^)]*\)\s*\{/i.test(
      code,
    );
  }

  private static tryDuration(value: string, state: ScriptTimelineBuilder): number | null {
    let expr = value.trim();
    if (expr.startsWith(',')) {
      expr = expr.slice(1).trim();
    }
    if (expr.startsWith('%') && expr.endsWith('%')) {
      expr = expr.slice(1, -1);
    }
    const res = NumericExpression.tryEvaluate(expr, state.variables);
    if (res.success && Number.isFinite(res.value) && res.value >= 0) {
      return Math.round(res.value * 1000);
    }
    return null;
  }

  private static normalizeCommandArguments(args: string): string {
    const value = args.trim();
    if (value.length >= 2 && value[0] === '(' && value[value.length - 1] === ')') {
      return value.slice(1, -1).trim();
    }
    return value;
  }

  private static unquoteCommandArgument(args: string): string {
    let value = args.trim();
    if (value.startsWith(',')) {
      value = value.slice(1).trim();
    }
    if (value.length >= 2 && value[0] === '"' && value[value.length - 1] === '"') {
      return value.slice(1, -1).replace(/`"/g, '"');
    }
    return value;
  }

  private static parsePlainText(text: string, line: number, state: ScriptTimelineBuilder): void {
    for (const char of text) {
      const vk = InputKeyCatalog.tryGet(char);
      if (vk !== undefined) {
        state.keyPress(vk);
      } else {
        state.warn(
          line,
          format('Character “{0}” from SendText could not be mapped to a physical key.', char),
        );
      }
    }
  }

  private static parseMouseClick(args: string, line: number, state: ScriptTimelineBuilder): void {
    let cleaned = args.trim();
    if (cleaned.startsWith(',')) {
      cleaned = cleaned.slice(1);
    }
    const parts = cleaned.split(',').map((p) => p.trim());
    const buttonName = parts[0] || 'Left';
    let button: MouseButton = MouseButton.Left;
    if (buttonName.toLowerCase() === 'r' || buttonName.toLowerCase().startsWith('right')) {
      button = MouseButton.Right;
    } else if (buttonName.toLowerCase() === 'm' || buttonName.toLowerCase().startsWith('middle')) {
      button = MouseButton.Middle;
    } else if (buttonName.toLowerCase() === 'x1') {
      button = MouseButton.X1;
    } else if (buttonName.toLowerCase() === 'x2') {
      button = MouseButton.X2;
    }

    const mode = parts[5] || '';
    if (mode.toLowerCase() === 'd') {
      state.mouse(button, true);
    } else if (mode.toLowerCase() === 'u') {
      state.mouse(button, false);
    } else {
      const parsedCount = parseInt(parts[3] ?? '1', 10);
      const count = Number.isNaN(parsedCount) ? 1 : Math.max(1, Math.min(10_000, parsedCount));
      for (let c = 0; c < count; c++) {
        state.mouseClick(button);
      }
    }

    if (parts.length >= 3 && (parts[1]?.length || parts[2]?.length)) {
      state.warn(
        line,
        t('MouseClick coordinates were not imported; the click will use the current cursor position.'),
      );
    }
  }

  private static parseDelaySettings(
    args: string,
    state: ScriptTimelineBuilder,
    keyboard: boolean,
    line: number,
  ): void {
    let cleaned = args.trim();
    if (cleaned.startsWith(',')) {
      cleaned = cleaned.slice(1);
    }
    const values = cleaned.split(',').map((p) => p.trim());
    const delay = AutoHotkeyImporter.tryDuration(values[0] ?? '', state);
    if (delay === null) {
      state.warn(line, t('Could not read the delay setting.'));
      return;
    }
    if (keyboard) {
      state.keyDelayUs = delay;
      if (values.length > 1) {
        const duration = AutoHotkeyImporter.tryDuration(values[1] ?? '', state);
        if (duration !== null) {
          state.keyDurationUs = duration;
        }
      }
    } else {
      state.mouseDelayUs = delay;
    }
  }

  private static parseHotkey(
    trigger: string,
    line: number,
    warnings: MacroImportWarning[],
  ): HotkeyBindingModel {
    let value = trigger.trim();
    const binding = new HotkeyBindingModel({
      control: value.includes('^'),
      alt: value.includes('!'),
      shift: value.includes('+'),
      windows: value.includes('#'),
      virtualKey: 0,
      mouseButton: MouseButton.None,
      wheel: 'None',
    });

    if (value.includes('*')) {
      warnings.push({
        line,
        message: t('The * wildcard modifier is not supported; an exact shortcut was imported.'),
      });
    }

    value = value.replace(/^[$~*<>^!+#]+/, '').trim();
    if (value.toLowerCase().endsWith(' up')) {
      value = value.slice(0, -3).trim();
    }

    if (value.includes('&')) {
      warnings.push({
        line,
        message: format('Combined hotkey “{0}” cannot be assigned automatically.', trigger),
      });
      return binding;
    }

    if (value.toLowerCase() === 'xbutton1') {
      binding.mouseButton = MouseButton.X1;
    } else if (value.toLowerCase() === 'xbutton2') {
      binding.mouseButton = MouseButton.X2;
    } else {
      const vk = InputKeyCatalog.tryGet(value);
      if (vk !== undefined) {
        binding.virtualKey = vk;
      } else {
        warnings.push({
          line,
          message: format('Hotkey “{0}” could not be mapped to a global shortcut.', trigger),
        });
      }
    }
    return binding;
  }
}
