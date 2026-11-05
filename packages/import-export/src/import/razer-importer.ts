/**
 * Razer Synapse 3/4 macro (.xml) importer.
 * Events are parsed by child element local name rather than numeric <Type>.
 */

import {
  MouseButton,
} from '../../../../packages/contracts/src/index.js';
import {
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
import { parseXml, type XmlElement } from './xml-parser.js';

export class RazerMacroImporter implements IMacroImporter {
  public readonly format = MacroImportFormat.Razer;
  public readonly displayName = 'Razer Synapse';
  public readonly extensions: readonly string[] = ['.xml'];
  public readonly sniffPriority = 50;

  public canHandle(probe: ImportProbe): boolean {
    if (probe.looksBinary) {
      return false;
    }
    try {
      const doc = parseXml(probe.text);
      return doc
        .descendants('Macro')
        .some((macro) => macro.descendants('MacroEvents').length > 0);
    } catch {
      return false;
    }
  }

  public import(
    probe: ImportProbe,
    sourceName: string,
    options?: ImportOptions,
  ): MacroImportResult {
    return RazerMacroImporter.importText(probe.text, sourceName, options);
  }

  public static import(
    xml: string,
    sourceName: string,
    options?: ImportOptions,
  ): MacroImportResult {
    return RazerMacroImporter.importText(xml, sourceName, options);
  }

  private static importText(
    xml: string,
    sourceName: string,
    options?: ImportOptions,
  ): MacroImportResult {
    const warnings: MacroImportWarning[] = [];
    let doc: XmlElement;
    try {
      doc = parseXml(xml);
    } catch {
      throw new Error(t('Damaged Razer XML file.'));
    }

    const macroNodes = doc.descendants('Macro');
    if (macroNodes.length === 0) {
      throw new Error(t('The Razer XML file has no Macro section.'));
    }

    const macros: MacroModel[] = [];
    let index = 0;

    for (const node of macroNodes) {
      index++;
      const builder = new ScriptTimelineBuilder(warnings);
      for (const element of node.descendants('MacroEvent')) {
        RazerMacroImporter.importEvent(element, builder, warnings);
      }

      if (!builder.events.some((item) => !item.isComment)) {
        warnings.push({
          line: null,
          message: format(
            t('Razer macro “{0}” contains no recognized actions.'),
            node.childValue('Name') ?? sourceName,
          ),
        });
        continue;
      }

      const named = node.childValue('Name')?.trim();
      const macroName =
        named && named.length > 0
          ? named
          : macroNodes.length > 1
            ? `${sourceName} ${index}`
            : sourceName;

      macros.push(
        new MacroModel({
          name: macroName,
          description: t('Imported from Razer Synapse.'),
          isEnabled: options?.isEnabled ?? false,
          events: normalizeEvents(builder.events.map((e) => e.toEvent())),
        }),
      );
    }

    if (macros.length === 0) {
      throw new Error(
        t('No importable actions were found in the Razer XML file.'),
      );
    }

    warnings.push({
      line: null,
      message: t(
        'Razer has no compatible global shortcut. The macro was imported disabled; assign a shortcut and review the timeline.',
      ),
    });

    return {
      format: MacroImportFormat.Razer,
      macros,
      warnings,
    };
  }

  private static importEvent(
    macroEvent: XmlElement,
    builder: ScriptTimelineBuilder,
    warnings: MacroImportWarning[],
  ): void {
    for (const child of macroEvent.elements()) {
      const local = child.localName;
      const localLower = local.toLowerCase();

      if (localLower === 'delay') {
        const ms = parseFloat(child.value.trim());
        if (!isNaN(ms) && ms >= 0) {
          builder.timeUs += Math.round(ms * 1000);
        }
      } else if (localLower.includes('mousemovement')) {
        const x = RazerMacroImporter.tryInt(child.childValue('X'));
        const y = RazerMacroImporter.tryInt(child.childValue('Y'));
        if (x !== null && y !== null) {
          builder.moveTo(x, y);
        }
      } else if (
        localLower.includes('mousewheel') ||
        localLower.includes('scroll')
      ) {
        const raw = RazerMacroImporter.tryInt(
          child.childValue('Direction') ??
            child.childValue('Amount') ??
            child.value,
        );
        const delta = raw ?? 0;
        builder.wheel(false, delta === 0 ? 120 : Math.sign(delta) * 120);
      } else if (localLower.includes('mouse')) {
        const button = RazerMacroImporter.resolveButton(
          child.childValue('MouseButton') ?? child.childValue('Button'),
        );
        if (button === MouseButton.None) {
          warnings.push({
            line: null,
            message: format(
              t('Razer mouse button not recognized: {0}'),
              local,
            ),
          });
          continue;
        }
        const down = RazerMacroImporter.resolveState(
          child.childValue('State') ?? child.childValue('Flags'),
        );
        if (down === null) {
          warnings.push({
            line: null,
            message: format(
              t('Razer mouse button state not recognized: {0}'),
              local,
            ),
          });
          continue;
        }
        builder.mouse(button, down);
      } else if (localLower.includes('key')) {
        const vk = RazerMacroImporter.tryInt(
          child.childValue('VirtualKey') ??
            child.childValue('VK') ??
            child.childValue('KeyCode'),
        );
        if (vk === null) {
          warnings.push({
            line: null,
            message: format(t('Razer key code not recognized: {0}'), local),
          });
          continue;
        }
        const down = RazerMacroImporter.resolveState(
          child.childValue('State') ?? child.childValue('Flags'),
        );
        if (down === null) {
          warnings.push({
            line: null,
            message: format(t('Razer key state not recognized: {0}'), local),
          });
          continue;
        }
        builder.key(vk, down);
      } else {
        warnings.push({
          line: null,
          message: format(
            t('Razer element “{0}” is not supported and was skipped.'),
            local,
          ),
        });
      }
    }
  }

  private static resolveButton(value?: string | null): MouseButton {
    if (!value || value.trim().length === 0) {
      return MouseButton.None;
    }
    const text = value.trim().toLowerCase();
    switch (text) {
      case 'left':
      case 'leftbutton':
      case 'left_button':
        return MouseButton.Left;
      case 'right':
      case 'rightbutton':
      case 'right_button':
        return MouseButton.Right;
      case 'middle':
      case 'middlebutton':
      case 'middle_button':
        return MouseButton.Middle;
      case 'x1':
      case 'xbutton1':
      case 'button4':
        return MouseButton.X1;
      case 'x2':
      case 'xbutton2':
      case 'button5':
        return MouseButton.X2;
      default: {
        const code = parseInt(text, 10);
        if (!isNaN(code)) {
          switch (code) {
            case 1:
              return MouseButton.Left;
            case 2:
              return MouseButton.Right;
            case 3:
              return MouseButton.Middle;
            case 4:
              return MouseButton.X1;
            case 5:
              return MouseButton.X2;
            default:
              return MouseButton.None;
          }
        }
        return MouseButton.None;
      }
    }
  }

  private static resolveState(value?: string | null): boolean | null {
    if (!value || value.trim().length === 0) {
      return null;
    }
    const text = value.trim().toLowerCase();
    if (
      text === 'down' ||
      text === 'press' ||
      text === 'pressed' ||
      text === '1' ||
      text === 'true'
    ) {
      return true;
    }
    if (
      text === 'up' ||
      text === 'release' ||
      text === 'released' ||
      text === '0' ||
      text === 'false'
    ) {
      return false;
    }
    return null;
  }

  private static tryInt(token?: string | null): number | null {
    if (!token) {
      return null;
    }
    const val = parseInt(token.trim(), 10);
    return isNaN(val) ? null : val;
  }
}
