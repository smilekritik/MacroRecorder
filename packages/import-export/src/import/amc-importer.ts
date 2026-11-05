/**
 * AMC macro importer (.amc).
 * Parses XML-based Oscar / Bloody AMC macro files.
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
import {
  MacroImportFormat,
  type IMacroImporter,
  type ImportOptions,
  type MacroImportResult,
  type MacroImportWarning,
} from './types.js';
import { parseXml } from './xml-parser.js';

export class AmcMacroImporter implements IMacroImporter {
  public readonly format = MacroImportFormat.Amc;
  public readonly displayName = 'AMC';
  public readonly extensions: readonly string[] = ['.amc'];
  public readonly sniffPriority = 40;

  public canHandle(probe: ImportProbe): boolean {
    if (probe.looksBinary) {
      return false;
    }
    const text = probe.text.trimStart().toLowerCase();
    return text.startsWith('<root') && text.includes('defaultmacro');
  }

  public import(
    probe: ImportProbe,
    sourceName: string,
    options?: ImportOptions,
  ): MacroImportResult {
    return AmcMacroImporter.importText(probe.text, sourceName, options);
  }

  public static import(
    xml: string,
    sourceName: string,
    options?: ImportOptions,
  ): MacroImportResult {
    return AmcMacroImporter.importText(xml, sourceName, options);
  }

  private static importText(
    xml: string,
    sourceName: string,
    options?: ImportOptions,
  ): MacroImportResult {
    const warnings: MacroImportWarning[] = [];
    let root;
    try {
      root = parseXml(xml);
    } catch {
      throw new Error(t('Damaged AMC/XML file.'));
    }

    const nodes = root.descendants('DefaultMacro');
    if (nodes.length === 0) {
      throw new Error(t('The AMC file has no DefaultMacro section.'));
    }

    const macros: MacroModel[] = [];
    for (const node of nodes) {
      const name = node.childValue('Major')?.trim() || sourceName;
      const description = node.childValue('Description')?.trim() ?? '';
      const keyDown = node.element('KeyDown');
      const syntax = keyDown?.element('Syntax')?.value ?? '';
      const events = AmcMacroImporter.parseSyntax(syntax, warnings);

      if (events.length === 0) {
        warnings.push({
          line: null,
          message: format(t('AMC macro “{0}” contains no recognized actions.'), name),
        });
        continue;
      }

      macros.push(
        new MacroModel({
          name,
          description,
          isEnabled: options?.isEnabled ?? false,
          events: normalizeEvents(events.map((e) => e.toEvent())),
        }),
      );
    }

    if (macros.length === 0) {
      throw new Error(t('No importable actions were found in the AMC file.'));
    }

    warnings.push({
      line: null,
      message: t(
        'AMC has no compatible global shortcut. The macro was imported disabled; assign a shortcut and review the timeline.',
      ),
    });

    return {
      format: MacroImportFormat.Amc,
      macros,
      warnings,
    };
  }

  private static parseSyntax(
    syntax: string,
    warnings: MacroImportWarning[],
  ): MacroEventModel[] {
    const result: MacroEventModel[] = [];
    let timeUs = 0;
    const lines = syntax.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]?.trim() ?? '';
      if (line.length === 0) {
        continue;
      }

      const parts = line.split(/\s+/).filter(Boolean);
      const command = parts[0] ?? '';

      if (command.toLowerCase() === 'delay' && parts.length > 1) {
        const delay = parseFloat(parts[1]!);
        if (!isNaN(delay) && delay >= 0) {
          timeUs += Math.round(delay * 1000);
          continue;
        }
      }

      if (
        (command.toLowerCase() === 'keydown' || command.toLowerCase() === 'keyup') &&
        parts.length > 1
      ) {
        const vk = parseInt(parts[1]!, 10);
        if (!isNaN(vk)) {
          result.push(
            new MacroEventModel({
              timeMicroseconds: timeUs,
              device: InputDevice.Keyboard,
              type: command.toLowerCase().endsWith('down')
                ? MacroEventType.KeyDown
                : MacroEventType.KeyUp,
              virtualKey: vk,
            }),
          );
          continue;
        }
      }

      const mouseCmd = AmcMacroImporter.tryMouseCommand(command);
      if (mouseCmd.matched) {
        result.push(
          new MacroEventModel({
            timeMicroseconds: timeUs,
            device: InputDevice.Mouse,
            type: mouseCmd.down
              ? MacroEventType.MouseButtonDown
              : MacroEventType.MouseButtonUp,
            button: mouseCmd.button,
          }),
        );
        continue;
      }

      if (
        (command.toLowerCase() === 'wheel' || command.toLowerCase() === 'hwheel') &&
        parts.length > 1
      ) {
        const wheel = parseInt(parts[1]!, 10);
        if (!isNaN(wheel)) {
          result.push(
            new MacroEventModel({
              timeMicroseconds: timeUs,
              device: InputDevice.Mouse,
              type: command.toUpperCase().startsWith('H')
                ? MacroEventType.HorizontalWheel
                : MacroEventType.Wheel,
              wheelDelta: wheel,
            }),
          );
          continue;
        }
      }

      warnings.push({
        line: i + 1,
        message: format(t('AMC command not recognized: {0}'), line),
      });
    }

    return result;
  }

  private static tryMouseCommand(command: string): {
    matched: boolean;
    button: MouseButton;
    down: boolean;
  } {
    const isDown = command.toLowerCase().endsWith('down');
    const isUp = command.toLowerCase().endsWith('up');
    if (!isDown && !isUp) {
      return { matched: false, button: MouseButton.None, down: false };
    }

    const prefix = command
      .replace(/down$/i, '')
      .replace(/up$/i, '')
      .toLowerCase();

    let button: MouseButton;
    switch (prefix) {
      case 'left':
        button = MouseButton.Left;
        break;
      case 'right':
        button = MouseButton.Right;
        break;
      case 'middle':
        button = MouseButton.Middle;
        break;
      case 'x1':
        button = MouseButton.X1;
        break;
      case 'x2':
        button = MouseButton.X2;
        break;
      default:
        button = MouseButton.None;
        break;
    }

    return {
      matched: button !== MouseButton.None,
      button,
      down: isDown,
    };
  }
}
