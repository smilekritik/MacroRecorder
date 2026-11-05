/**
 * TinyTask .rec binary macro importer.
 * The file body is an array of Win32 EVENTMSG records (20 bytes each, little-endian).
 * Header offset 0..64 is determined by scanning for a valid EVENTMSG sequence.
 */

import {
  InputDevice,
  MacroEventType,
  MouseButton,
} from '../../../../packages/contracts/src/index.js';
import {
  MacroEventModel,
  MacroModel,
  normalizeEvents,
} from '../../../../packages/domain/src/model/index.js';
import { format, t } from '../../../../packages/localization/src/index.js';
import type { ImportProbe } from './probe.js';
import { ScriptTimelineBuilder } from './script-timeline-builder.js';
import {
  MacroImportFormat,
  type IMacroImporter,
  type ImportOptions,
  type MacroImportResult,
  type MacroImportWarning,
} from './types.js';

export class TinyTaskImporter implements IMacroImporter {
  private static readonly RecordSize = 20;
  private static readonly MaxHeaderOffset = 64;

  private static readonly JournalMessages = new Set<number>([
    0x100, 0x101, 0x104, 0x105, // WM_KEYDOWN/UP, WM_SYSKEYDOWN/UP
    0x200, 0x201, 0x202, 0x203, // WM_MOUSEMOVE, WM_LBUTTONDOWN/UP/DBLCLK
    0x204, 0x205, 0x206, 0x207, 0x208, 0x209, 0x20a, // R/M-button down/up/dblclk, WM_MOUSEWHEEL
  ]);

  public readonly format = MacroImportFormat.TinyTask;
  public readonly displayName = 'TinyTask';
  public readonly extensions: readonly string[] = ['.rec'];
  public readonly sniffPriority = 60;

  public canHandle(probe: ImportProbe): boolean {
    return probe.looksBinary && TinyTaskImporter.findHeaderOffset(probe.bytes) >= 0;
  }

  public import(
    probe: ImportProbe,
    sourceName: string,
    options?: ImportOptions,
  ): MacroImportResult {
    return TinyTaskImporter.importBytes(probe.bytes, sourceName, options);
  }

  public static import(
    bytes: Uint8Array,
    sourceName: string,
    options?: ImportOptions,
  ): MacroImportResult {
    return TinyTaskImporter.importBytes(bytes, sourceName, options);
  }

  private static importBytes(
    bytes: Uint8Array,
    sourceName: string,
    options?: ImportOptions,
  ): MacroImportResult {
    const offset = TinyTaskImporter.findHeaderOffset(bytes);
    if (offset < 0) {
      throw new Error(
        t(
          'The .rec file does not look like a TinyTask recording: its header was not recognized.',
        ),
      );
    }

    const warnings: MacroImportWarning[] = [];
    const builder = new ScriptTimelineBuilder(warnings);
    const count = Math.floor((bytes.length - offset) / TinyTaskImporter.RecordSize);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let firstTime: number | null = null;

    for (let i = 0; i < count; i++) {
      const position = offset + i * TinyTaskImporter.RecordSize;
      const message = view.getUint32(position, true);
      const paramL = view.getUint32(position + 4, true);
      const time = view.getUint32(position + 12, true);

      if (firstTime === null) {
        firstTime = time;
      }
      builder.timeUs = Math.max(0, (time - firstTime) * 1000);

      switch (message) {
        case 0x100:
        case 0x104:
          builder.events.push(
            TinyTaskImporter.keyEvent(builder.timeUs, MacroEventType.KeyDown, paramL),
          );
          break;
        case 0x101:
        case 0x105:
          builder.events.push(
            TinyTaskImporter.keyEvent(builder.timeUs, MacroEventType.KeyUp, paramL),
          );
          break;
        case 0x200:
          builder.moveTo(
            view.getInt32(position + 4, true),
            view.getInt32(position + 8, true),
          );
          break;
        case 0x201:
          builder.mouse(MouseButton.Left, true);
          break;
        case 0x202:
          builder.mouse(MouseButton.Left, false);
          break;
        case 0x203:
          builder.mouseClick(MouseButton.Left);
          break;
        case 0x204:
          builder.mouse(MouseButton.Right, true);
          break;
        case 0x205:
          builder.mouse(MouseButton.Right, false);
          break;
        case 0x206:
          builder.mouseClick(MouseButton.Right);
          break;
        case 0x207:
          builder.mouse(MouseButton.Middle, true);
          break;
        case 0x208:
          builder.mouse(MouseButton.Middle, false);
          break;
        case 0x209:
          builder.mouseClick(MouseButton.Middle);
          break;
        case 0x20a: {
          const wheelDelta = view.getInt16(position + 10, true);
          builder.wheel(false, wheelDelta);
          break;
        }
        default:
          warnings.push({
            line: i + 1,
            message: format(
              t('.rec message 0x{0:X} is not supported and was skipped.'),
              message.toString(16).toUpperCase(),
            ),
          });
          break;
      }
    }

    if (!builder.events.some((item) => !item.isComment)) {
      throw new Error(
        t('No importable actions were found in the .rec file.'),
      );
    }

    warnings.push({
      line: null,
      message: t(
        'The .rec format has no shortcut. The macro was imported disabled; assign one and review the timeline.',
      ),
    });

    const macro = new MacroModel({
      name: sourceName,
      description: t('Imported from TinyTask.'),
      isEnabled: options?.isEnabled ?? false,
      events: normalizeEvents(builder.events.map((e) => e.toEvent())),
    });

    return {
      format: MacroImportFormat.TinyTask,
      macros: [macro],
      warnings,
    };
  }

  private static keyEvent(
    timeUs: number,
    type: MacroEventType,
    paramL: number,
  ): MacroEventModel {
    return new MacroEventModel({
      timeMicroseconds: timeUs,
      device: InputDevice.Keyboard,
      type,
      virtualKey: paramL & 0xff,
      scanCode: (paramL >> 8) & 0xff,
    });
  }

  public static findHeaderOffset(bytes: Uint8Array): number {
    for (
      let offset = 0;
      offset <= TinyTaskImporter.MaxHeaderOffset;
      offset++
    ) {
      const remaining = bytes.length - offset;
      if (remaining < TinyTaskImporter.RecordSize) {
        break;
      }
      if (remaining % TinyTaskImporter.RecordSize !== 0) {
        continue;
      }
      if (TinyTaskImporter.isValidArray(bytes, offset)) {
        return offset;
      }
    }
    return -1;
  }

  private static isValidArray(bytes: Uint8Array, offset: number): boolean {
    const count = Math.floor((bytes.length - offset) / TinyTaskImporter.RecordSize);
    const sample = Math.min(count, 16);
    let previousTime = -1;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    for (let i = 0; i < sample; i++) {
      const position = offset + i * TinyTaskImporter.RecordSize;
      const message = view.getUint32(position, true);
      if (!TinyTaskImporter.JournalMessages.has(message)) {
        return false;
      }
      const time = view.getUint32(position + 12, true);
      if (previousTime >= 0 && time < previousTime) {
        return false;
      }
      previousTime = time;
    }

    return true;
  }
}
