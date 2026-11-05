/**
 * Jitbit / Bartels Macro Recorder (.mrf) importer.
 * The format is line-based with fields separated by " : " (space colon space).
 */

import {
  MacroEventType,
  MouseButton,
} from '../../../../packages/contracts/src/index.js';
import {
  MacroEventModel,
  MacroModel,
  normalizeEvents,
} from '../../../../packages/domain/src/model/index.js';
import { format, t } from '../../../../packages/localization/src/index.js';
import { InputKeyCatalog } from './catalog.js';
import type { ImportProbe } from './probe.js';
import { ScriptTimelineBuilder } from './script-timeline-builder.js';
import {
  MacroImportFormat,
  type IMacroImporter,
  type ImportOptions,
  type MacroImportResult,
  type MacroImportWarning,
} from './types.js';

export class JitbitMrfImporter implements IMacroImporter {
  private static readonly Delimiter = ' : ';

  public readonly format = MacroImportFormat.JitbitMrf;
  public readonly displayName = 'Jitbit / Bartels';
  public readonly extensions: readonly string[] = ['.mrf'];
  public readonly sniffPriority = 10;

  public canHandle(probe: ImportProbe): boolean {
    if (probe.looksBinary) {
      return false;
    }
    const lines = JitbitMrfImporter.enumerateLines(probe.text);
    for (const raw of lines) {
      const line = raw.trim();
      if (line.length === 0) {
        continue;
      }
      const command = JitbitMrfImporter.commandOf(line);
      return (
        command === 'DELAY' ||
        command === 'KEYBOARD' ||
        command === 'MOUSE' ||
        command === 'TYPE TEXT' ||
        command === 'WAIT FOR' ||
        command === 'WAIT FOR PROCESS' ||
        command === 'WAIT FOR USER' ||
        command === 'COMMENT' ||
        command === 'MESSAGE BOX'
      );
    }
    return false;
  }

  public import(
    probe: ImportProbe,
    sourceName: string,
    options?: ImportOptions,
  ): MacroImportResult {
    return JitbitMrfImporter.importText(probe.text, sourceName, options);
  }

  public static import(
    text: string,
    sourceName: string,
    options?: ImportOptions,
  ): MacroImportResult {
    return JitbitMrfImporter.importText(text, sourceName, options);
  }

  private static importText(
    text: string,
    sourceName: string,
    options?: ImportOptions,
  ): MacroImportResult {
    const warnings: MacroImportWarning[] = [];
    const builder = new ScriptTimelineBuilder(warnings);
    const coordinateContext = { relativeCoordinatesSeen: false };
    let lineNumber = 0;

    const lines = JitbitMrfImporter.enumerateLines(text);
    for (const raw of lines) {
      lineNumber++;
      const line = raw.trim();
      if (line.length === 0) {
        continue;
      }

      const command = JitbitMrfImporter.commandOf(line);
      const rest = JitbitMrfImporter.restOf(line);
      const args =
        rest.length === 0 ? [] : rest.split(JitbitMrfImporter.Delimiter);

      switch (command) {
        case 'DELAY': {
          const ms = JitbitMrfImporter.tryMilliseconds(args[0]);
          if (ms !== null) {
            builder.timeUs += ms * 1000;
          } else {
            builder.warn(
              lineNumber,
              format(t('Could not read the delay: {0}'), line),
            );
          }
          break;
        }
        case 'KEYBOARD':
          JitbitMrfImporter.importKeyboard(args, lineNumber, builder);
          break;
        case 'MOUSE':
          JitbitMrfImporter.importMouse(args, lineNumber, builder, coordinateContext);
          break;
        case 'TYPE TEXT':
          if (rest.length > 0) {
            builder.typeText(rest);
          }
          break;
        case 'WAIT FOR':
          JitbitMrfImporter.importWaitForWindow(args, false, lineNumber, builder);
          break;
        case 'WAIT FOR PROCESS':
          JitbitMrfImporter.importWaitForWindow(args, true, lineNumber, builder);
          break;
        case 'WAIT FOR USER':
          JitbitMrfImporter.importWaitForUser(args, lineNumber, builder);
          break;
        case 'COMMENT':
          builder.commentRow(rest);
          break;
        case 'BREAKPOINT':
          builder.commentRow('BREAKPOINT');
          break;
        case 'MESSAGE BOX':
          builder.events.push(
            new MacroEventModel({
              timeMicroseconds: builder.timeUs,
              type: MacroEventType.OverlayText,
              text: rest,
              durationMicroseconds: 2_000_000,
            }),
          );
          break;
        case 'LABEL':
        case 'GOTO':
          builder.commentRow(line);
          builder.warn(
            lineNumber,
            format(
              t(
                'Labels and jumps are not supported (loops were intentionally left out); the line “{0}” was kept as a comment.',
              ),
              line,
            ),
          );
          break;
        case 'OPEN FILE':
        case 'SET CLIPBOARD':
        case 'PASTE':
        case 'INCREMENT CLIPBOARD':
          builder.commentRow(line);
          builder.warn(
            lineNumber,
            format(
              t('Command “{0}” has no equivalent and was kept as a comment.'),
              command,
            ),
          );
          break;
        default:
          builder.commentRow(line);
          builder.warn(
            lineNumber,
            format(
              t('.mrf line not recognized and kept as a comment: {0}'),
              line,
            ),
          );
          break;
      }
    }

    if (!builder.events.some((item) => !item.isComment)) {
      throw new Error(t('No importable actions were found in the .mrf file.'));
    }

    if (coordinateContext.relativeCoordinatesSeen) {
      warnings.push({
        line: null,
        message: t(
          'Window-relative coordinates (R prefix) were imported as screen coordinates. Verify them if the window is positioned differently.',
        ),
      });
    }

    warnings.push({
      line: null,
      message: t(
        'The .mrf format has no compatible global shortcut. The macro was imported disabled; assign a shortcut and review the timeline.',
      ),
    });

    const macro = new MacroModel({
      name: sourceName,
      description: t('Imported from Jitbit / Bartels Macro Recorder.'),
      isEnabled: options?.isEnabled ?? false,
      events: normalizeEvents(builder.events.map((e) => e.toEvent())),
    });

    return {
      format: MacroImportFormat.JitbitMrf,
      macros: [macro],
      warnings,
    };
  }

  private static importKeyboard(
    args: readonly string[],
    line: number,
    builder: ScriptTimelineBuilder,
  ): void {
    const vk = JitbitMrfImporter.tryResolveKey(args[0]);
    if (vk === null) {
      builder.warn(
        line,
        format(
          t('The key “{0}” in the Keyboard line was not recognized.'),
          args[0] ?? '',
        ),
      );
      return;
    }
    const action = (args[1] ?? 'KeyPress').trim().toLowerCase();
    if (action === 'keydown') {
      builder.key(vk, true);
    } else if (action === 'keyup') {
      builder.key(vk, false);
    } else {
      builder.keyPress(vk);
    }
  }

  private static importMouse(
    args: readonly string[],
    line: number,
    builder: ScriptTimelineBuilder,
    ctx: { relativeCoordinatesSeen: boolean },
  ): void {
    const xCoord = JitbitMrfImporter.tryCoordinate(args[0], ctx);
    const yCoord = JitbitMrfImporter.tryCoordinate(args[1], ctx);
    const action = (args[2] ?? '').trim();

    let button: MouseButton = MouseButton.Left;
    if (action.toLowerCase().startsWith('right')) {
      button = MouseButton.Right;
    } else if (action.toLowerCase().startsWith('middle')) {
      button = MouseButton.Middle;
    } else if (action.toLowerCase().startsWith('x1')) {
      button = MouseButton.X1;
    } else if (action.toLowerCase().startsWith('x2')) {
      button = MouseButton.X2;
    }

    if (xCoord !== null && yCoord !== null) {
      builder.moveTo(xCoord, yCoord);
    }

    const actionLower = action.toLowerCase();
    if (actionLower.includes('wheel')) {
      const positive = actionLower.includes('up') || actionLower.includes('right');
      const horizontal = actionLower.includes('left') || actionLower.includes('right');
      builder.wheel(horizontal, (positive ? 1 : -1) * 120);
    } else if (actionLower.includes('down')) {
      builder.mouse(button, true);
    } else if (actionLower.includes('up')) {
      builder.mouse(button, false);
    } else if (
      actionLower.includes('dblclick') ||
      actionLower.includes('doubleclick')
    ) {
      builder.mouseClick(button);
      builder.mouseClick(button);
    } else if (actionLower.includes('click')) {
      builder.mouseClick(button);
    } else if (!actionLower.includes('move') && action.length > 0) {
      builder.warn(
        line,
        format(t('Mouse action “{0}” was not recognized.'), action),
      );
    }
  }

  private static importWaitForWindow(
    args: readonly string[],
    byProcess: boolean,
    line: number,
    builder: ScriptTimelineBuilder,
  ): void {
    const target = (args[0] ?? '').trim();
    const mode = (args[1] ?? 'appear').trim();
    if (mode.toLowerCase() === 'disappear') {
      builder.warn(
        line,
        t('Waiting for a window to disappear is not supported; the line was skipped.'),
      );
      return;
    }
    const timeoutMs = JitbitMrfImporter.tryMilliseconds(args[2]) ?? 0;
    const wait = new MacroEventModel({
      timeMicroseconds: builder.timeUs,
      type: MacroEventType.WaitForWindow,
      waitTimeoutMilliseconds: Math.max(0, timeoutMs),
      waitProcessName: byProcess ? target : undefined,
      waitWindowTitle: byProcess ? undefined : target,
    });
    builder.events.push(wait);
  }

  private static importWaitForUser(
    args: readonly string[],
    line: number,
    builder: ScriptTimelineBuilder,
  ): void {
    const vk = JitbitMrfImporter.tryResolveKey(args[0]);
    if (vk === null) {
      builder.warn(
        line,
        t('The user-wait key was not recognized; the line was skipped.'),
      );
      return;
    }
    builder.events.push(
      new MacroEventModel({
        timeMicroseconds: builder.timeUs,
        type: MacroEventType.WaitForKey,
        waitKeyVirtualKey: vk,
      }),
    );
  }

  private static enumerateLines(text: string): string[] {
    return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  }

  private static commandOf(line: string): string {
    const index = line.indexOf(JitbitMrfImporter.Delimiter);
    return (index < 0 ? line : line.slice(0, index)).trim().toUpperCase();
  }

  private static restOf(line: string): string {
    const index = line.indexOf(JitbitMrfImporter.Delimiter);
    return index < 0
      ? ''
      : line.slice(index + JitbitMrfImporter.Delimiter.length);
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

  private static tryCoordinate(
    token: string | undefined,
    ctx: { relativeCoordinatesSeen: boolean },
  ): number | null {
    if (!token) {
      return null;
    }
    let trimmed = token.trim();
    if (trimmed.startsWith('R') || trimmed.startsWith('r')) {
      ctx.relativeCoordinatesSeen = true;
      trimmed = trimmed.slice(1);
    }
    const val = parseInt(trimmed, 10);
    return isNaN(val) ? null : val;
  }

  private static tryResolveKey(token?: string): number | null {
    if (!token || token.trim().length === 0) {
      return null;
    }
    const trimmed = token.trim();
    const parsed = parseInt(trimmed, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 0xff) {
      return parsed;
    }
    const vk = InputKeyCatalog.tryGet(trimmed);
    return vk !== undefined ? vk : null;
  }
}
