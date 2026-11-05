import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import {
  parsePreferencesJson,
  serializePreferencesJson,
  DEFAULT_BIND_MAP_VK,
} from '../../../packages/storage/src/preferences/index.js';
import {
  RunHistoryStore,
  parseRunHistoryJson,
  getAverageDurationMs,
} from '../../../packages/storage/src/history/index.js';
import { MacroLibraryStore } from '../../../packages/storage/src/library/library-store.js';
import { createDefaultMacroDefinition } from '../../../packages/contracts/src/index.js';

import {
  LegacyRunHistoryStoreOracle,
  LegacyMacroLibraryStoreOracle,
} from '../oracle/legacy-oracle.js';
import {
  loadFixtureJson,
  loadFixtureText,
  SETTINGS_FIXTURES,
  HISTORY_FIXTURES,
  RECOVERY_FIXTURES,
} from '../../fixtures/index.js';

describe('Suite 07: Settings, Run History, and Library Recovery', () => {
  let tempRoot: string;
  let store: MacroLibraryStore;

  beforeEach(() => {
    tempRoot = MacroLibraryStore.createTemporaryRoot();
    store = new MacroLibraryStore(tempRoot);
  });

  afterEach(() => {
    MacroLibraryStore.deleteTemporaryRoot(tempRoot);
  });

  // --- 1. Settings ---
  describe('Settings Storage and Migration', () => {
    it('Parses default settings matching canonical default-settings.json', () => {
      const rawText = loadFixtureText(SETTINGS_FIXTURES.DEFAULT_SETTINGS);
      const { preferences } = parsePreferencesJson(rawText);

      expect(preferences.theme).toBe('Dark');
      expect(preferences.languageCode).toBe('ru');
      expect(preferences.startWithWindows).toBe(true);
      expect(preferences.showMacroInformation).toBe(true);
      expect(preferences.recordingStartHotkey.virtualKey).toBe(118); // F7
      expect(preferences.recordingStopHotkey.virtualKey).toBe(119); // F8
      expect(preferences.playbackPauseHotkey.virtualKey).toBe(120); // F9
      expect(preferences.emergencyStopHotkey.virtualKey).toBe(121); // F10
      expect(preferences.bindMapHotkey.virtualKey).toBe(DEFAULT_BIND_MAP_VK); // F11 (122)
    });

    it('Executes one-time F12 to F11 migration matching migrated-f12-to-f11-settings.expected.json', () => {
      const sourceText = loadFixtureText(SETTINGS_FIXTURES.MIGRATED_F12_SETTINGS);
      const expectedJson = loadFixtureJson<Record<string, unknown>>(
        SETTINGS_FIXTURES.MIGRATED_F12_EXPECTED,
      );

      const { preferences, migrated } = parsePreferencesJson(sourceText);
      expect(migrated).toBe(true);
      expect(preferences.bindMapHotkey.virtualKey).toBe(DEFAULT_BIND_MAP_VK); // 0x7A (F11)

      const serialized = serializePreferencesJson(preferences);
      expect(JSON.parse(serialized)).toEqual(expectedJson);
    });

    it('Preserves clearable intent shortcuts matching clearable-intent-hotkeys-settings.expected.json', () => {
      const sourceText = loadFixtureText(SETTINGS_FIXTURES.CLEARABLE_INTENT_SETTINGS);
      const expectedJson = loadFixtureJson<Record<string, unknown>>(
        SETTINGS_FIXTURES.CLEARABLE_INTENT_EXPECTED,
      );

      const { preferences } = parsePreferencesJson(sourceText);
      // Cleared hotkeys
      expect(preferences.recordingStartHotkey.virtualKey).toBe(0);
      expect(preferences.emergencyStopHotkey.virtualKey).toBe(0);
      expect(preferences.pixelCaptureHotkey.virtualKey).toBe(0);

      // Kept hotkeys
      expect(preferences.recordingStopHotkey.virtualKey).toBe(119); // F8
      expect(preferences.playbackPauseHotkey.virtualKey).toBe(120); // F9
      expect(preferences.bindMapHotkey.virtualKey).toBe(DEFAULT_BIND_MAP_VK); // F11

      const serialized = serializePreferencesJson(preferences);
      expect(JSON.parse(serialized)).toEqual(expectedJson);
    });
  });

  // --- 2. Run History ---
  describe('Run History Calculations and Corrupted History Reset', () => {
    it('Parses valid run history and computes aggregates matching expected fixture and legacy oracle', () => {
      const fixtureText = loadFixtureText(HISTORY_FIXTURES.VALID_HISTORY);
      const expectedJson = loadFixtureJson<Record<string, unknown>[]>(
        HISTORY_FIXTURES.VALID_HISTORY_EXPECTED,
      );

      const entries = parseRunHistoryJson(fixtureText);
      expect(entries.size).toBe(2);

      const macro1Id = '77777777-7777-7777-7777-777777777771';
      const macro1 = entries.get(macro1Id);
      expect(macro1).toBeDefined();
      if (!macro1) return;

      expect(macro1.runCount).toBe(24);
      expect(macro1.totalDurationMs).toBe(144000);
      expect(getAverageDurationMs(macro1)).toBe(6000);
      expect(macro1.maxJitterMs).toBe(3.8);
      expect(macro1.totalFailed).toBe(0);

      const expectedMacro1 = expectedJson.find((e) => e['MacroId'] === macro1Id)!;
      expect(macro1.runCount).toBe(expectedMacro1['RunCount']);
      expect(macro1.totalDurationMs).toBe(expectedMacro1['TotalDurationMs']);

      let aggregate = {
        RunCount: 0,
        MeanDurationMilliseconds: 0,
        MaxJitterMilliseconds: 0,
        FailureCount: 0,
      };
      // Runs: 100ms (j=2), 200ms (j=5), 150ms (j=3), 150ms (j=4)
      aggregate = LegacyRunHistoryStoreOracle.updateAggregate(aggregate, 100, 2, false);
      aggregate = LegacyRunHistoryStoreOracle.updateAggregate(aggregate, 200, 5, false);
      aggregate = LegacyRunHistoryStoreOracle.updateAggregate(aggregate, 150, 3, false);
      aggregate = LegacyRunHistoryStoreOracle.updateAggregate(aggregate, 150, 4, false);

      expect(aggregate.RunCount).toBe(4);
      expect(aggregate.MeanDurationMilliseconds).toBe(150);
      expect(aggregate.MaxJitterMilliseconds).toBe(5);
      expect(aggregate.FailureCount).toBe(0);
    });

    it('Resets corrupted run history cleanly without throwing', () => {
      const corruptedText = loadFixtureText(HISTORY_FIXTURES.CORRUPTED_HISTORY);
      // parseRunHistoryJson throws on malformed JSON
      expect(() => parseRunHistoryJson(corruptedText)).toThrow();

      // RunHistoryStore with corrupted file on disk resets to empty cleanly
      const historyDir = path.join(tempRoot, 'Stats');
      fs.mkdirSync(historyDir, { recursive: true });
      fs.writeFileSync(path.join(historyDir, 'run-history.json'), corruptedText);

      const historyStore = new RunHistoryStore(tempRoot);
      expect(historyStore.loadAll()).toHaveLength(0);
    });
  });

  // --- 3. Library Recovery and Disambiguation ---
  describe('Library Recovery and Duplicate ID Disambiguation', () => {
    it('Disambiguates duplicate IDs and names matching duplicate-ids.expected.json', async () => {
      fs.mkdirSync(store.macrosPath, { recursive: true });
      const dupId = '88888888-8888-8888-8888-888888888888';

      const file1 = path.join(store.macrosPath, 'macro-1.macro.json');
      const file2 = path.join(store.macrosPath, 'macro-2-same-id.macro.json');

      const macro1Data = {
        SchemaVersion: 12,
        Id: dupId,
        Name: 'Original Macro',
        Folder: '',
        ModifiedAt: '2026-09-11T00:00:00+00:00',
        Events: [],
      };
      const macro2Data = {
        SchemaVersion: 12,
        Id: dupId,
        Name: 'Original Macro',
        Folder: '',
        ModifiedAt: '2026-09-11T00:00:00+00:00',
        Events: [],
      };

      fs.writeFileSync(file1, JSON.stringify(macro1Data, null, 2));
      fs.writeFileSync(file2, JSON.stringify(macro2Data, null, 2));

      const loaded = await store.loadAll();
      expect(loaded).toHaveLength(2);

      const first = loaded.find((m) => m.name === 'Original Macro');
      const second = loaded.find((m) => m.name === 'Original Macro 2');

      expect(first).toBeDefined();
      expect(first?.id).toBe(dupId);

      expect(second).toBeDefined();
      expect(second?.id).not.toBe(dupId); // Disambiguated with new UUID

      // Legacy oracle nextFreeName
      const taken = new Set(['original macro']);
      expect(LegacyMacroLibraryStoreOracle.nextFreeName('Original Macro', taken)).toBe('Original Macro 2');
    });

    it('Leaves corrupted syntax file untouched on disk for user recovery', async () => {
      fs.mkdirSync(store.macrosPath, { recursive: true });
      const corruptPath = path.join(store.macrosPath, 'corrupted-syntax.macro.json');
      const corruptSyntax = loadFixtureText(RECOVERY_FIXTURES.CORRUPTED_SYNTAX);
      fs.writeFileSync(corruptPath, corruptSyntax);

      const validMacro = createDefaultMacroDefinition({ name: 'ValidMacro' });
      await store.save(validMacro);

      const loaded = await store.loadAll();
      expect(loaded).toHaveLength(1);
      expect(loaded[0]?.name).toBe('ValidMacro');

      // The corrupted file remains on disk untouched for recovery
      expect(fs.existsSync(corruptPath)).toBe(true);
      expect(fs.readFileSync(corruptPath, 'utf-8')).toBe(corruptSyntax);
    });

    it('Reconstructs folder hierarchy and macro counts matching folder-tree.expected.json', async () => {
      await store.save(createDefaultMacroDefinition({ name: 'RootMacro' }));
      await store.save(createDefaultMacroDefinition({ name: 'Combo', folder: 'Gaming' }));
      await store.save(createDefaultMacroDefinition({ name: 'Aim', folder: 'Gaming/Shooter' }));
      await store.save(createDefaultMacroDefinition({ name: 'Email', folder: 'Work' }));
      await store.save(createDefaultMacroDefinition({ name: 'Report', folder: 'Work/Daily' }));

      const info = await store.getFolderTreeInfo();
      const normalizedFolders = info.folders.map((f) => f.replace(/\\/g, '/'));

      expect(normalizedFolders).toEqual(['Gaming', 'Gaming/Shooter', 'Work', 'Work/Daily']);
      expect(info.macroCounts['']).toBe(5);
      expect(info.macroCounts['Gaming']).toBe(2);
      expect(info.macroCounts['Gaming/Shooter']).toBe(1);
      expect(info.macroCounts['Work']).toBe(2);
      expect(info.macroCounts['Work/Daily']).toBe(1);
    });
  });
});
