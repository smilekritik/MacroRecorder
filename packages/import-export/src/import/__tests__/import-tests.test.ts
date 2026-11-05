/**
 * Unit tests matching MacroRecorder.Tests/ImportTests.cs
 * Tests through.
 */

import { describe, expect, it } from 'vitest';
import {
  MacroEventType,
  MacroImportFormat,
  MouseButton,
} from '../../../../contracts/src/index.js';
import { AmcMacroImporter } from '../amc-importer.js';
import { AutoHotkeyImporter } from '../autohotkey-importer.js';
import { AutoItImporter } from '../autoit-importer.js';
import { importMacro } from '../dispatcher.js';
import { JitbitMrfImporter } from '../jitbit-mrf-importer.js';
import { LegacyMacroImporter } from '../legacy-json-importer.js';
import { NativeJsonImporter } from '../native-json-importer.js';
import { ImportProbe } from '../probe.js';
import { RazerMacroImporter } from '../razer-importer.js';
import { MacroImporterRegistry } from '../registry.js';
import { TinyTaskImporter } from '../tinytask-importer.js';

describe('ImportTests', () => {
  it('LegacyImporter_ConvertsOldRecorderJson', () => {
    const json = JSON.parse(
      '{"duration_ms":20,"events":[{"t_ms":1,"device":"keyboard","type":"down","vk":65,"sc":30},{"t_ms":10,"device":"mouse","type":"down","button":"X1"}]}',
    );
    const result = LegacyMacroImporter.import(json, 'legacy');
    const macro = result.macros[0]!;
    expect(macro.name).toBe('legacy');
    expect(macro.events.length).toBe(2);
    expect(macro.events[0]!.timeMicroseconds).toBe(1000);
    expect((macro.events[1] as { button?: MouseButton }).button).toBe(MouseButton.X1);
  });

  it('NativeJsonExport_IsRecognizedByItsOwnImporter', () => {
    const source = JSON.stringify({
      SchemaVersion: 12,
      Name: 'native',
      Events: [
        {
          Type: 'KeyDown',
          VirtualKey: 0x45,
          TimeMicroseconds: 12_000,
        },
      ],
    });
    const probe = ImportProbe.fromText('.macro.json', source);
    const result = NativeJsonImporter.import(probe.text, 'native');

    expect(result.format).toBe(MacroImportFormat.NativeJson);
    expect(result.macros.length).toBe(1);
    const imported = result.macros[0]!;
    expect(imported.name).toBe('native');
    expect(imported.events.length).toBe(1);
    expect((imported.events[0] as { virtualKey?: number }).virtualKey).toBe(0x45);
    expect(imported.isEnabled).toBe(false);
  });

  it('AutoHotkeyImporter_ParsesV2HotkeyVariablesSendSleepClickAndLoop', () => {
    const source = `
#Requires AutoHotkey v2.0
delay := 30
XButton1:: {
    Send "{e down}"
    Sleep delay
    Send "{e up}"
    Loop 2 {
        Click "down"
        Sleep 10
        Click "up"
    }
}
F7::Pause()
`;
    const result = AutoHotkeyImporter.import(source, 'sample');
    expect(result.macros.length).toBe(1);
    const macro = result.macros[0]!;
    expect(result.format).toBe(MacroImportFormat.AutoHotkey);
    expect(macro.isEnabled).toBe(false);
    expect(macro.hotkey.mouseButton).toBe(MouseButton.X1);
    expect(macro.events.length).toBe(6);
    expect(Math.max(0, ...macro.events.map((e) => e.timeMicroseconds))).toBe(50_000);

    const hasKeyDown = macro.events.some(
      (x) =>
        x.type === MacroEventType.KeyDown &&
        (x as { virtualKey?: number }).virtualKey === 0x45 &&
        x.timeMicroseconds === 0,
    );
    const hasKeyUp = macro.events.some(
      (x) =>
        x.type === MacroEventType.KeyUp &&
        (x as { virtualKey?: number }).virtualKey === 0x45 &&
        x.timeMicroseconds === 30_000,
    );
    expect(hasKeyDown).toBe(true);
    expect(hasKeyUp).toBe(true);
  });

  it('AmcImporter_ParsesXmlSyntaxTimeline', () => {
    const source = `<Root><DefaultMacro><Major>AMC sample</Major><Description>description</Description>
<KeyDown><Syntax>KeyDown 69 1
Delay 30
KeyUp 69 1
Delay 20
LeftDown 1
Delay 10
LeftUp 1</Syntax></KeyDown></DefaultMacro></Root>`;

    const result = AmcMacroImporter.import(source, 'sample');
    expect(result.macros.length).toBe(1);
    const macro = result.macros[0]!;
    expect(macro.name).toBe('AMC sample');
    expect(macro.isEnabled).toBe(false);
    expect(macro.events.length).toBe(4);
    expect(Math.max(0, ...macro.events.map((e) => e.timeMicroseconds))).toBe(60_000);
    const lastEvent = macro.events[macro.events.length - 1] as { button?: MouseButton };
    expect(lastEvent.button).toBe(MouseButton.Left);
  });

  it('Store_AutoDetectsAhkAndPersistsImportedMacro', () => {
    const source = 'XButton2:: {\nSend "{q down}"\nSleep 25\nSend "{q up}"\n}';
    const probe = ImportProbe.fromText('.ahk', source);
    const result = importMacro(probe, 'test');

    expect(result.macros.length).toBe(1);
    const macro = result.macros[0]!;
    expect(result.format).toBe(MacroImportFormat.AutoHotkey);
    expect(macro.isEnabled).toBe(false);
    expect(macro.hotkey.mouseButton).toBe(MouseButton.X2);
    expect(macro.events.length).toBe(2);
  });

  it('JitbitMrfImporter_ParsesDelimitedTimeline', () => {
    const source = `DELAY : 30
Keyboard : 65 : KeyPress
Mouse : 100 : 200 : LeftClick : 0 : 0
TYPE TEXT : hello : world
COMMENT : note
GOTO : loop`;

    const result = JitbitMrfImporter.import(source, 'sample');
    expect(result.macros.length).toBe(1);
    const macro = result.macros[0]!;
    expect(result.format).toBe(MacroImportFormat.JitbitMrf);
    expect(macro.isEnabled).toBe(false);

    expect(
      macro.events.some(
        (x) =>
          x.type === MacroEventType.KeyDown &&
          (x as { virtualKey?: number }).virtualKey === 0x41 &&
          x.timeMicroseconds === 30_000,
      ),
    ).toBe(true);
    expect(
      macro.events.some(
        (x) =>
          x.type === MacroEventType.MouseMove &&
          (x as { absoluteMove?: boolean }).absoluteMove &&
          (x as { deltaX?: number }).deltaX === 100 &&
          (x as { deltaY?: number }).deltaY === 200,
      ),
    ).toBe(true);
    expect(
      macro.events.some(
        (x) =>
          x.type === MacroEventType.TypeText &&
          (x as { text?: string }).text === 'hello : world',
      ),
    ).toBe(true);
    expect(
      macro.events.some(
        (x) =>
          x.type === MacroEventType.Comment &&
          (x as { text?: string }).text === 'note',
      ),
    ).toBe(true);
    expect(
      macro.events.some(
        (x) =>
          x.type === MacroEventType.Comment &&
          ((x as { text?: string }).text ?? '').includes('GOTO'),
      ),
    ).toBe(true);
  });

  it('AutoItImporter_ParsesSendMouseSleepAndHotkey', () => {
    const source = `; recorded by AU3Recorder (mentions AutoHotkey to test greedy sniff)
HotKeySet("{F7}", "_go")
Sleep(20)
Send("{TAB}")
MouseClick("left", 50, 60, 1)`;

    const result = AutoItImporter.import(source, 'sample');
    expect(result.macros.length).toBe(1);
    const macro = result.macros[0]!;
    expect(result.format).toBe(MacroImportFormat.AutoIt);
    expect(macro.hotkey.virtualKey).toBe(0x76);
    expect(
      macro.events.some(
        (x) =>
          x.type === MacroEventType.KeyDown &&
          (x as { virtualKey?: number }).virtualKey === 0x09 &&
          x.timeMicroseconds === 20_000,
      ),
    ).toBe(true);
    expect(
      macro.events.some(
        (x) =>
          x.type === MacroEventType.MouseMove &&
          (x as { absoluteMove?: boolean }).absoluteMove &&
          (x as { deltaX?: number }).deltaX === 50 &&
          (x as { deltaY?: number }).deltaY === 60,
      ),
    ).toBe(true);
  });

  it('RazerMacroImporter_ParsesEventsByChildName', () => {
    const source = `<Macro><Name>Razer sample</Name><MacroEvents>
  <MacroEvent><Delay>15</Delay><KeyboardEvent><VirtualKey>65</VirtualKey><State>Down</State></KeyboardEvent></MacroEvent>
  <MacroEvent><KeyboardEvent><VirtualKey>65</VirtualKey><State>Up</State></KeyboardEvent></MacroEvent>
  <MacroEvent><MouseMovementEvent><X>120</X><Y>240</Y></MouseMovementEvent></MacroEvent>
  <MacroEvent><MouseEvent><MouseButton>Left</MouseButton><State>Down</State></MouseEvent></MacroEvent>
</MacroEvents></Macro>`;

    const result = RazerMacroImporter.import(source, 'sample');
    expect(result.macros.length).toBe(1);
    const macro = result.macros[0]!;
    expect(result.format).toBe(MacroImportFormat.Razer);
    expect(macro.name).toBe('Razer sample');
    expect(
      macro.events.some(
        (x) =>
          x.type === MacroEventType.KeyDown &&
          (x as { virtualKey?: number }).virtualKey === 0x41 &&
          x.timeMicroseconds === 15_000,
      ),
    ).toBe(true);
    expect(
      macro.events.some(
        (x) =>
          x.type === MacroEventType.MouseMove &&
          (x as { absoluteMove?: boolean }).absoluteMove &&
          (x as { deltaX?: number }).deltaX === 120 &&
          (x as { deltaY?: number }).deltaY === 240,
      ),
    ).toBe(true);
    expect(
      macro.events.some(
        (x) =>
          x.type === MacroEventType.MouseButtonDown &&
          (x as { button?: MouseButton }).button === MouseButton.Left,
      ),
    ).toBe(true);
  });

  it('TinyTaskImporter_ParsesSyntheticEventMsgArray', () => {
    const bytes: number[] = [0x4d, 0x52, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05]; // 8-byte header offset search
    function put(value: number): void {
      bytes.push(
        value & 0xff,
        (value >> 8) & 0xff,
        (value >> 16) & 0xff,
        (value >> 24) & 0xff,
      );
    }
    function record(
      message: number,
      paramL: number,
      paramH: number,
      time: number,
    ): void {
      put(message);
      put(paramL);
      put(paramH);
      put(time);
      put(0);
    }

    record(0x100, 0x1e41, 0, 0); // WM_KEYDOWN vk=0x41 sc=0x1E
    record(0x101, 0x1e41, 0, 5); // WM_KEYUP
    record(0x200, 100, 200, 10); // WM_MOUSEMOVE
    record(0x201, 0, 0, 12); // WM_LBUTTONDOWN

    const result = TinyTaskImporter.import(new Uint8Array(bytes), 'sample');
    expect(result.macros.length).toBe(1);
    const macro = result.macros[0]!;
    expect(result.format).toBe(MacroImportFormat.TinyTask);
    expect(
      macro.events.some(
        (x) =>
          x.type === MacroEventType.KeyDown &&
          (x as { virtualKey?: number }).virtualKey === 0x41 &&
          (x as { scanCode?: number }).scanCode === 0x1e &&
          x.timeMicroseconds === 0,
      ),
    ).toBe(true);
    expect(
      macro.events.some(
        (x) =>
          x.type === MacroEventType.MouseMove &&
          (x as { absoluteMove?: boolean }).absoluteMove &&
          (x as { deltaX?: number }).deltaX === 100 &&
          (x as { deltaY?: number }).deltaY === 200 &&
          x.timeMicroseconds === 10_000,
      ),
    ).toBe(true);
    expect(
      macro.events.some(
        (x) =>
          x.type === MacroEventType.MouseButtonDown &&
          (x as { button?: MouseButton }).button === MouseButton.Left,
      ),
    ).toBe(true);
  });

  it('MacroImporterRegistry_HasNoDuplicateExtensionsAndFilterCoversThem', () => {
    const extensions = MacroImporterRegistry.importers.flatMap((x) => x.extensions);
    const distinct = Array.from(new Set(extensions.map((x) => x.toLowerCase())));
    expect(extensions.length).toBe(distinct.length);

    const nativeLower = MacroImporterRegistry.nativeExtensions.map((x) =>
      x.toLowerCase(),
    );
    for (const ext of distinct) {
      expect(nativeLower.includes(ext)).toBe(false);
    }

    const filter = MacroImporterRegistry.buildDialogFilter();
    for (const ext of extensions) {
      expect(filter).toContain('*' + ext);
    }
    expect(filter).toContain('*.mrmacro');
  });

  it.each([
    ['.mrf', 'DELAY : 10\nKeyboard : 65 : KeyPress', MacroImportFormat.JitbitMrf],
    ['.au3', 'Sleep(10)\nSend("{TAB}")', MacroImportFormat.AutoIt],
    [
      '.xml',
      '<Macro><Name>n</Name><MacroEvents><MacroEvent><KeyboardEvent><VirtualKey>65</VirtualKey><State>Down</State></KeyboardEvent></MacroEvent></MacroEvents></Macro>',
      MacroImportFormat.Razer,
    ],
  ])(
    'Store_AutoDetectsTextImporterByExtension(%s)',
    (extension, content, expected) => {
      const probe = ImportProbe.fromText(extension, content);
      const result = importMacro(probe, 'sample');
      expect(result.format).toBe(expected);
      expect(result.macros[0]!.isEnabled).toBe(false);
    },
  );

  it('Store_ExtensionWinsOverGreedySniffForAutoIt', () => {
    // A .au3 file with the word AutoHotkey in a comment must go to AutoIt, not AHK
    const content = '; looks like AutoHotkey but is not\nSleep(5)\nSend("{ENTER}")';
    const probe = ImportProbe.fromText('.au3', content);
    const result = importMacro(probe, 'recorded');
    expect(result.format).toBe(MacroImportFormat.AutoIt);
  });

  it('Store_AutoDetectsTinyTaskRecording', () => {
    const bytes: number[] = [];
    function put(value: number): void {
      bytes.push(
        value & 0xff,
        (value >> 8) & 0xff,
        (value >> 16) & 0xff,
        (value >> 24) & 0xff,
      );
    }
    function record(
      message: number,
      paramL: number,
      paramH: number,
      time: number,
    ): void {
      put(message);
      put(paramL);
      put(paramH);
      put(time);
      put(0);
    }

    record(0x100, 0x1e41, 0, 0);
    record(0x101, 0x1e41, 0, 5);

    const probe = ImportProbe.fromBytes('.rec', new Uint8Array(bytes));
    const result = importMacro(probe, 'sample');
    expect(result.format).toBe(MacroImportFormat.TinyTask);
  });

  it('AutoHotkeyImporter_ImportsAllCommentKindsAsRowsAndActionNotes', () => {
    const source = `
; script header
/*
block about the mode
second line of the block
*/
#Requires AutoHotkey v2.0
XButton1:: {
    ; --- N2D ---
    Click "down"   ; open
    Sleep 10
    Click "up"
}
`;
    const result = AutoHotkeyImporter.import(source, 'sample');
    expect(result.macros.length).toBe(1);
    const macro = result.macros[0]!;
    const comments = macro.events
      .filter((x) => x.type === MacroEventType.Comment)
      .map((x) => (x as { text?: string }).text);

    expect(comments).toEqual([
      'script header',
      'block about the mode',
      'second line of the block',
      '--- N2D ---',
    ]);
    expect(
      macro.events.filter((x) => x.type === MacroEventType.Comment).length,
    ).toBe(4);

    const mouseDown = macro.events.find(
      (x) => x.type === MacroEventType.MouseButtonDown,
    );
    expect((mouseDown as { comment?: string })?.comment).toBe('open');

    // Comments do not shift the timing of the real actions
    expect(Math.max(0, ...macro.events.map((e) => e.timeMicroseconds))).toBe(10_000);
    expect(
      macro.events
        .filter((x) => x.type === MacroEventType.Comment)
        .every((x) => x.timeMicroseconds === 0),
    ).toBe(true);
  });

  it('AutoHotkeyImporter_KeepsSemicolonInsideQuotedTextAndSkipsEmptyComments', () => {
    const source = `
F8::
Send "a;b"
;
Sleep 5
return
`;
    const result = AutoHotkeyImporter.import(source, 'sample');
    expect(result.macros.length).toBe(1);
    const macro = result.macros[0]!;

    // A semicolon inside quotes is part of the text, not a comment; an empty ";" creates no row
    expect(macro.events.some((x) => x.type === MacroEventType.Comment)).toBe(
      false,
    );
    // a, ; and b — three printable keys (';' is mapped to VK_OEM_1 in the catalog), each down+up
    const keyEvents = macro.events.filter(
      (x) => x.type === MacroEventType.KeyDown || x.type === MacroEventType.KeyUp,
    );
    expect(keyEvents.length).toBe(6);
  });
});
