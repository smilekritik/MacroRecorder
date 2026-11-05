/**
 * Legacy unversioned JSON macro importer.
 * Converts old recorder format with duration_ms and events[t_ms, device, type, ...]
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
import type { ImportProbe } from './probe.js';
import {
  MacroImportFormat,
  type IMacroImporter,
  type ImportOptions,
  type MacroImportResult,
} from './types.js';

export class LegacyMacroImporter implements IMacroImporter {
  public readonly format = MacroImportFormat.LegacyJson;
  public readonly displayName = 'legacy JSON';
  public readonly extensions: readonly string[] = ['.json'];
  public readonly sniffPriority = 0;

  public canHandle(probe: ImportProbe): boolean {
    if (probe.looksBinary) {
      return false;
    }
    try {
      const data = JSON.parse(probe.text);
      return (
        typeof data === 'object' &&
        data !== null &&
        !('schemaVersion' in data) &&
        !('SchemaVersion' in data) &&
        Array.isArray(data.events)
      );
    } catch {
      return false;
    }
  }

  public import(
    probe: ImportProbe,
    sourceName: string,
    options?: ImportOptions,
  ): MacroImportResult {
    return LegacyMacroImporter.importText(probe.text, sourceName, options);
  }

  public static import(
    textOrObj: string | Record<string, unknown>,
    sourceName: string,
    options?: ImportOptions,
  ): MacroImportResult {
    const root =
      typeof textOrObj === 'string' ? JSON.parse(textOrObj) : textOrObj;
    return LegacyMacroImporter.importObject(root, sourceName, options);
  }

  public static importMacro(
    root: Record<string, unknown>,
    sourceName: string,
    options?: ImportOptions,
  ): MacroModel {
    return LegacyMacroImporter.importObject(root, sourceName, options).macros[0] as MacroModel;
  }

  private static importText(
    text: string,
    sourceName: string,
    options?: ImportOptions,
  ): MacroImportResult {
    const root = JSON.parse(text);
    return LegacyMacroImporter.importObject(root, sourceName, options);
  }

  private static importObject(
    root: Record<string, unknown>,
    sourceName: string,
    options?: ImportOptions,
  ): MacroImportResult {
    const rawEvents = Array.isArray(root['events']) ? root['events'] : [];
    const events: MacroEventModel[] = [];

    for (const old of rawEvents) {
      if (typeof old !== 'object' || old === null) {
        continue;
      }
      const deviceStr = String(old.device ?? '').toLowerCase();
      const typeStr = String(old.type ?? '').toLowerCase();
      const tMs = Number(old.t_ms ?? 0);
      const vk = Number(old.vk ?? 0);
      const sc = Number(old.sc ?? 0);
      const dxRaw = Number(old.dx_raw ?? 0);
      const dyRaw = Number(old.dy_raw ?? 0);
      const buttonStr = String(old.button ?? '');

      const isMouse = deviceStr === 'mouse';
      const device = isMouse ? InputDevice.Mouse : InputDevice.Keyboard;

      let type: MacroEventType;
      if (!isMouse && typeStr === 'down') {
        type = MacroEventType.KeyDown;
      } else if (!isMouse && typeStr === 'up') {
        type = MacroEventType.KeyUp;
      } else if (isMouse && typeStr === 'move') {
        type = MacroEventType.MouseMove;
      } else if (isMouse && typeStr === 'down') {
        type = MacroEventType.MouseButtonDown;
      } else if (isMouse && typeStr === 'up') {
        type = MacroEventType.MouseButtonUp;
      } else {
        type = MacroEventType.Delay;
      }

      const item = new MacroEventModel({
        timeMicroseconds: Math.round(tMs * 1000),
        device,
        type,
        virtualKey: vk,
        scanCode: sc,
        deltaX: dxRaw,
        deltaY: dyRaw,
        button: LegacyMacroImporter.parseButton(buttonStr),
      });

      events.push(item);
    }

    const macro = new MacroModel({
      name: sourceName,
      isEnabled: options?.isEnabled ?? false,
      events: normalizeEvents(events.map((e) => e.toEvent())),
    });

    return {
      format: MacroImportFormat.LegacyJson,
      macros: [macro],
      warnings: [],
    };
  }

  private static parseButton(value: string): MouseButton {
    switch (value.toUpperCase()) {
      case 'L':
        return MouseButton.Left;
      case 'R':
        return MouseButton.Right;
      case 'M':
        return MouseButton.Middle;
      case 'X1':
        return MouseButton.X1;
      case 'X2':
        return MouseButton.X2;
      default:
        return MouseButton.None;
    }
  }
}
