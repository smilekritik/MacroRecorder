/**
 * Process startup orchestration and startup-to-tray management.
 * Handles --minimized launch without window flash, hotkey and automatic macro initialization,
 * and first-run onboarding checks.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { BrowserWindow, BrowserWindowConstructorOptions } from 'electron';
import { extractExternalFiles } from './single-instance.js';
import type { StartupOptions } from './types.js';
import {
  createDefaultMacroDefinition,
  toWireMacroDefinition,
  type MacroDefinition,
  type MacroEvent,
} from '../../../../../packages/contracts/src/index.js';

export interface MacroPlaybackCandidate {
  readonly id: string;
  readonly name: string;
  readonly isEnabled: boolean;
  readonly isAutomaticTrigger?: boolean | undefined;
  readonly eventCount: number;
}

export interface FirstRunSeedOptions {
  readonly libraryPath: string;
  readonly defaultMacros?: ReadonlyArray<{ name: string; content: string }> | undefined;
}

export interface LegacyMigrationOptions {
  readonly sourceRoot: string;
  readonly targetRoot: string;
}

export interface LegacyMigrationResult {
  readonly copiedFiles: number;
  readonly skippedFiles: number;
  readonly alreadyCompleted: boolean;
}

export class StartupCoordinator {
  /**
   * Parses command-line arguments into structured StartupOptions.
   */
  public static parseArgs(argv: readonly string[], preferencesPath?: string): StartupOptions {
    const isMinimized = argv.some((arg) => arg.toLowerCase() === '--minimized');
    const files = extractExternalFiles(argv);
    const isFirstRun = preferencesPath ? !fs.existsSync(preferencesPath) : false;

    return {
      minimized: isMinimized,
      files,
      isFirstRun,
      rawArgs: argv,
    };
  }

  /**
   * Generates BrowserWindow creation options tailored for startup mode.
   * If launched with --minimized, guarantees no visible window flash.
   */
  public static getWindowOptions(
    isMinimized: boolean,
    baseOptions: BrowserWindowConstructorOptions = {},
  ): BrowserWindowConstructorOptions {
    if (isMinimized) {
      return {
        ...baseOptions,
        show: false,
        skipTaskbar: true,
        // Start in minimized or hidden state
      };
    }

    return {
      ...baseOptions,
      show: true,
      skipTaskbar: false,
    };
  }

  /**
   * Configures window visibility immediately after creation based on startup flags.
   */
  public static applyStartupVisibility(window: BrowserWindow, isMinimized: boolean): void {
    if (isMinimized) {
      window.hide();
      window.setSkipTaskbar(true);
      window.minimize();
    } else {
      window.show();
      window.setSkipTaskbar(false);
      window.focus();
    }
  }

  /**
   * Filters and determines which macros should be automatically started on Windows logon / startup.
   * Matches legacy rule: macro.IsEnabled && !macro.IsAutomaticTrigger && macro.Events.Count > 0.
   */
  public static selectStartupMacros<T extends MacroPlaybackCandidate>(macros: readonly T[]): T[] {
    return macros.filter(
      (macro) => macro.isEnabled && !macro.isAutomaticTrigger && macro.eventCount > 0,
    );
  }

  /**
   * Copies data into a distinct production root without overwriting or deleting sources.
   * A marker makes subsequent launches idempotent.
   */
  public static migrateLegacyData(options: LegacyMigrationOptions): LegacyMigrationResult {
    const sourceRoot = path.resolve(options.sourceRoot);
    const targetRoot = path.resolve(options.targetRoot);
    const marker = path.join(targetRoot, '.legacy-csharp-import-v1.json');
    if (sourceRoot.toLowerCase() === targetRoot.toLowerCase() || fs.existsSync(marker)) {
      return { copiedFiles: 0, skippedFiles: 0, alreadyCompleted: true };
    }

    fs.mkdirSync(targetRoot, { recursive: true });
    let copiedFiles = 0;
    let skippedFiles = 0;
    for (const relativePath of ['Macros', 'settings.json', path.join('Stats', 'run-history.json')]) {
      const source = path.join(sourceRoot, relativePath);
      const destination = path.join(targetRoot, relativePath);
      if (!fs.existsSync(source)) continue;
      if (fs.existsSync(destination)) {
        skippedFiles++;
        continue;
      }
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.cpSync(source, destination, { recursive: true, errorOnExist: false, force: false });
      copiedFiles++;
    }

    fs.writeFileSync(marker, JSON.stringify({
      schemaVersion: 1,
      sourceRoot,
      completedAt: new Date().toISOString(),
      copiedFiles,
      skippedFiles,
    }, null, 2), 'utf8');
    return { copiedFiles, skippedFiles, alreadyCompleted: false };
  }

  public static createDefaultSampleMacros(): ReadonlyArray<{ name: string; content: string }> {
    const event = (values: Record<string, unknown>): MacroEvent => ({
      id: String(values['id']),
      type: String(values['type']) as MacroEvent['type'],
      timeMicroseconds: Number(values['timeMicroseconds'] ?? 0),
      comment: String(values['comment'] ?? ''),
      ...values,
    } as unknown as MacroEvent);
    const create = (values: Partial<MacroDefinition>): string => JSON.stringify(
      toWireMacroDefinition(createDefaultMacroDefinition(values), true),
      null,
      2,
    ) + '\n';

    return [
      {
        name: 'Example - sequence with comments',
        content: create({
          id: 'b6d46031-2a01-4f63-b221-000000000001',
          name: 'Example - sequence with comments',
          description: 'Shows key presses, clicks, pauses, comment rows and per-action notes.',
          isEnabled: false,
          hotkey: { virtualKey: 0x31, mouseButton: 'None', wheel: 'None', control: true, alt: false, shift: true, windows: false },
          events: [
            event({ id: 'b6d46031-2a01-4f63-b221-000000000011', type: 'Comment', timeMicroseconds: 0, text: '--- Example: three-step sequence ---' }),
            event({ id: 'b6d46031-2a01-4f63-b221-000000000012', type: 'OverlayText', timeMicroseconds: 0, durationMicroseconds: 1500000, text: 'Sample macro: A → B → two clicks', showOverlayTiming: true }),
            event({ id: 'b6d46031-2a01-4f63-b221-000000000013', type: 'KeyDown', timeMicroseconds: 0, virtualKey: 0x41, comment: 'Press the A key' }),
            event({ id: 'b6d46031-2a01-4f63-b221-000000000014', type: 'KeyUp', timeMicroseconds: 30000, virtualKey: 0x41 }),
            event({ id: 'b6d46031-2a01-4f63-b221-000000000015', type: 'KeyDown', timeMicroseconds: 350000, virtualKey: 0x42, comment: 'Press the B key' }),
            event({ id: 'b6d46031-2a01-4f63-b221-000000000016', type: 'KeyUp', timeMicroseconds: 380000, virtualKey: 0x42 }),
            event({ id: 'b6d46031-2a01-4f63-b221-000000000017', type: 'MouseButtonDown', timeMicroseconds: 1070000, button: 'Left', comment: 'First click' }),
            event({ id: 'b6d46031-2a01-4f63-b221-000000000018', type: 'MouseButtonUp', timeMicroseconds: 1080000, button: 'Left' }),
            event({ id: 'b6d46031-2a01-4f63-b221-000000000019', type: 'MouseButtonDown', timeMicroseconds: 1265000, button: 'Left', comment: 'Second click' }),
            event({ id: 'b6d46031-2a01-4f63-b221-000000000020', type: 'MouseButtonUp', timeMicroseconds: 1275000, button: 'Left' }),
          ],
        }),
      },
      {
        name: 'Example - colour trigger',
        content: create({
          id: 'b6d46031-2a01-4f63-b221-000000000002',
          name: 'Example - colour trigger',
          description: 'A pixel trigger watches the configured pixel and presses Space when it matches.',
          isEnabled: false,
          events: [
            event({ id: 'b6d46031-2a01-4f63-b221-000000000021', type: 'Comment', timeMicroseconds: 0, text: '--- Example: start on pixel colour ---' }),
            event({ id: 'b6d46031-2a01-4f63-b221-000000000022', type: 'PixelColorTrigger', timeMicroseconds: 0, pixelX: 960, pixelY: 540, pixelColor: 0x57e06a, triggerCooldownMilliseconds: 3000 }),
            event({ id: 'b6d46031-2a01-4f63-b221-000000000023', type: 'KeyDown', timeMicroseconds: 0, virtualKey: 0x20 }),
            event({ id: 'b6d46031-2a01-4f63-b221-000000000024', type: 'KeyUp', timeMicroseconds: 40000, virtualKey: 0x20 }),
          ],
        }),
      },
    ];
  }

  /**
   * Performs first-run initialization and seeds default sample macros if library folder is empty.
   */
  public static seedFirstRunLibrary(options: FirstRunSeedOptions): boolean {
    const macrosDir = path.join(options.libraryPath, 'Macros');

    try {
      if (!fs.existsSync(macrosDir)) {
        fs.mkdirSync(macrosDir, { recursive: true });
      }

      const existingEntries = fs.readdirSync(macrosDir);
      if (
        existingEntries.length === 0 &&
        options.defaultMacros &&
        options.defaultMacros.length > 0
      ) {
        for (const sample of options.defaultMacros) {
          const sampleFile = path.join(macrosDir, `${sample.name}.macro.json`);
          fs.writeFileSync(sampleFile, sample.content, 'utf-8');
        }
        return true;
      }
    } catch {
      // Best-effort seeding
    }

    return false;
  }
}
