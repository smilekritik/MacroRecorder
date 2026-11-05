/**
 * Send syntax parsing for AutoHotkey and AutoIt script importers.
 */

import { MouseButton } from '../../../../packages/contracts/src/index.js';
import { format, t } from '../../../../packages/localization/src/index.js';
import { InputKeyCatalog } from './catalog.js';
import type { ScriptTimelineBuilder } from './script-timeline-builder.js';

export type SendDialect = 'AutoHotkey' | 'AutoIt';

export class SendSyntax {
  public static parseSend(
    text: string,
    line: number,
    builder: ScriptTimelineBuilder,
    dialect: SendDialect,
  ): void {
    const modifiers: number[] = [];
    let i = 0;
    while (i < text.length) {
      modifiers.length = 0;
      while (i < text.length && '^!+#'.includes(text[i]!)) {
        const modChar = text[i]!;
        const vk =
          modChar === '^' ? 0x11 : modChar === '!' ? 0x12 : modChar === '+' ? 0x10 : 0x5b;
        modifiers.push(vk);
        i++;
      }

      const distinctMods = Array.from(new Set(modifiers));
      for (const mod of distinctMods) {
        builder.key(mod, true);
      }

      if (i >= text.length) {
        for (let m = distinctMods.length - 1; m >= 0; m--) {
          builder.key(distinctMods[m]!, false);
        }
        break;
      }

      if (text[i] === '{') {
        const close = text.indexOf('}', i + 1);
        if (close < 0) {
          builder.warn(line, t('Unclosed brace in Send.'));
          for (let m = distinctMods.length - 1; m >= 0; m--) {
            builder.key(distinctMods[m]!, false);
          }
          break;
        }
        const token = text.slice(i + 1, close).trim();
        SendSyntax.parseSendToken(token, line, builder, dialect);
        i = close + 1;
      } else {
        const char = text[i++]!;
        const vk = InputKeyCatalog.tryGet(char);
        if (vk === undefined) {
          builder.warn(line, format('Character “{0}” could not be mapped to a key.', char));
        } else {
          builder.keyPress(vk);
        }
      }

      for (let m = distinctMods.length - 1; m >= 0; m--) {
        builder.key(distinctMods[m]!, false);
      }
    }
  }

  private static parseSendToken(
    token: string,
    line: number,
    builder: ScriptTimelineBuilder,
    dialect: SendDialect,
  ): void {
    const lower = token.toLowerCase();
    if (lower === 'blind' || lower === 'text' || lower === 'raw') {
      return;
    }

    if (dialect === 'AutoIt' && !token.includes(' ')) {
      const hold = SendSyntax.trySplitAutoItHold(token);
      if (hold) {
        builder.key(hold.virtualKey, hold.down);
        return;
      }
    }

    const parts = token.split(/\s+/).filter((p) => p.length > 0);
    if (parts.length === 0) {
      return;
    }

    if (parts[0]!.toLowerCase() === 'click') {
      SendSyntax.parseClick(parts.slice(1).join(' '), line, builder);
      return;
    }

    if (dialect === 'AutoIt' && parts[0]!.toUpperCase() === 'ASC') {
      builder.warn(
        line,
        t('The {ASC} sequence was not imported: the character code depends on the code page.'),
      );
      return;
    }

    const vk = InputKeyCatalog.tryGet(parts[0]!);
    if (vk === undefined) {
      builder.warn(line, format('Key “{0}” in Send was not recognized.', parts[0]!));
      return;
    }

    if (parts.length >= 2 && parts[1]!.toLowerCase() === 'down') {
      builder.key(vk, true);
      return;
    }

    if (parts.length >= 2 && parts[1]!.toLowerCase() === 'up') {
      builder.key(vk, false);
      return;
    }

    let repeat = 1;
    if (parts.length >= 2) {
      const parsed = parseInt(parts[1]!, 10);
      if (!Number.isNaN(parsed)) {
        repeat = Math.max(0, Math.min(10_000, parsed));
      }
    }

    for (let r = 0; r < repeat; r++) {
      builder.keyPress(vk);
    }
  }

  private static trySplitAutoItHold(
    token: string,
  ): { virtualKey: number; down: boolean } | null {
    for (const [suffix, isDown] of [
      ['DOWN', true],
      ['UP', false],
    ] as const) {
      if (token.toUpperCase().endsWith(suffix)) {
        const name = token.slice(0, -suffix.length);
        if (name.length > 0) {
          const vk = InputKeyCatalog.tryGet(name);
          if (vk !== undefined) {
            return { virtualKey: vk, down: isDown };
          }
        }
      }
    }
    return null;
  }

  public static parseClick(args: string, line: number, builder: ScriptTimelineBuilder): void {
    const normalized = args.replace(/,/g, ' ').replace(/"/g, '').trim();
    const parts = normalized.split(/\s+/).filter((p) => p.length > 0);
    const button = SendSyntax.resolveButton(parts);

    const isWheel = parts.some(
      (x) =>
        x.toLowerCase() === 'wheelup' ||
        x.toLowerCase() === 'wheeldown' ||
        x.toLowerCase() === 'wheelleft' ||
        x.toLowerCase() === 'wheelright',
    );

    if (isWheel) {
      const horizontal = parts.some((x) => {
        const l = x.toLowerCase();
        return l.includes('left') || l.includes('right');
      });
      const positive = parts.some((x) => {
        const l = x.toLowerCase();
        return l.includes('up') || l.includes('right');
      });
      let count = 1;
      for (const p of parts) {
        const n = parseInt(p, 10);
        if (!Number.isNaN(n) && n > 0) {
          count = n;
          break;
        }
      }
      builder.wheel(horizontal, (positive ? 1 : -1) * 120 * count);
      return;
    }

    const down = parts.some((x) => {
      const l = x.toLowerCase();
      return l === 'down' || l === 'd';
    });
    const up = parts.some((x) => {
      const l = x.toLowerCase();
      return l === 'up' || l === 'u';
    });

    if (down || up) {
      builder.mouse(button, down);
    } else {
      builder.mouseClick(button);
    }

    const numericCount = parts.filter((x) => !Number.isNaN(parseFloat(x))).length;
    if (numericCount >= 2) {
      builder.warn(
        line,
        t(
          'Click coordinates were not imported; the click will use the current cursor position.',
        ),
      );
    }
  }

  public static resolveButton(parts: readonly string[]): MouseButton {
    if (
      parts.some((x) => {
        const l = x.toLowerCase();
        return l === 'right' || l === 'r' || l === 'secondary';
      })
    ) {
      return MouseButton.Right;
    }
    if (
      parts.some((x) => {
        const l = x.toLowerCase();
        return l === 'middle' || l === 'm';
      })
    ) {
      return MouseButton.Middle;
    }
    if (
      parts.some((x) => {
        const l = x.toLowerCase();
        return l === 'x1' || l === 'button4';
      })
    ) {
      return MouseButton.X1;
    }
    if (
      parts.some((x) => {
        const l = x.toLowerCase();
        return l === 'x2' || l === 'button5';
      })
    ) {
      return MouseButton.X2;
    }
    return MouseButton.Left;
  }
}
