import { describe, it, expect } from 'vitest';
import { extractKeysFromContent } from '../src/index.js';

describe('static extraction', () => {
  it('extracts keys from TypeScript source code', () => {
    const tsCode = `
      import { t, format } from '@macro-recorder/localization';
      const label = t("Gamepad");
      const status = format("Slot {0}", 1);
      const other = translate('waiting for input…');
    `;

    const extracted = extractKeysFromContent(tsCode, 'app/component.ts');
    const keys = extracted.map((e) => e.key);

    expect(keys).toContain('Gamepad');
    expect(keys).toContain('Slot {0}');
    expect(keys).toContain('waiting for input…');
  });

  it('extracts keys from React JSX / Tr component syntax', () => {
    const tsxCode = `
      import { Tr } from '@macro-recorder/localization';
      export function Header() {
        return (
          <div>
            <Tr text="Install HidHide" />
            <Tr text='Download HidHide' />
          </div>
        );
      }
    `;

    const extracted = extractKeysFromContent(tsxCode, 'app/Header.tsx');
    const keys = extracted.map((e) => e.key);

    expect(keys).toContain('Install HidHide');
    expect(keys).toContain('Download HidHide');
  });

  it('extracts keys', () => {
    const csCode = `
      var text = LocalizedText.Get("Left mouse button");
      var title = LocalizationManager.Instance.Format("Emergency stop: {0}", hotkey);
      var sub = LocalizedText.Format("Start recording: {0} · stop: {1}", k1, k2);
    `;

    const extracted = extractKeysFromContent(csCode, 'MacroRecorder/Main.cs');
    const keys = extracted.map((e) => e.key);

    expect(keys).toContain('Left mouse button');
    expect(keys).toContain('Emergency stop: {0}');
    expect(keys).toContain('Start recording: {0} · stop: {1}');
  });

  it('extracts keys', () => {
    const xamlCode = `
      <TextBlock Text="{local:Tr Text='Gamepad test'}" />
      <Button Content='{local:Tr Text="Install driver"}' />
      <Label Content="{Tr Text='Raw axes (WGI)'}" />
    `;

    const extracted = extractKeysFromContent(xamlCode, 'MacroRecorder/MainWindow.xaml');
    const keys = extracted.map((e) => e.key);

    expect(keys).toContain('Gamepad test');
    expect(keys).toContain('Install driver');
    expect(keys).toContain('Raw axes (WGI)');
  });

  it('computes accurate line and column numbers', () => {
    const code = 'const a = 1;\nconst b = t("Hello");';
    const extracted = extractKeysFromContent(code, 'test.ts');

    expect(extracted).toHaveLength(1);
    expect(extracted[0]!.key).toBe('Hello');
    expect(extracted[0]!.line).toBe(2);
    expect(extracted[0]!.column).toBe(11);
  });
});
