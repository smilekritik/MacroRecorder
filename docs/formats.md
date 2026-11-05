# Macro Recorder Supported File Formats Specification

Macro Recorder supports a comprehensive suite of macro interchange, persistence, and legacy formats. This document specifies every supported file format, container structure, schema versioning rule, and import/export behavior.

---

## Format Overview Matrix

| Extension | Format Name | I/O Direction | Primary Purpose | Underlying Format |
|---|---|---|---|---|
| `.mrmacro` | Macro Package | Import / Export | Single-macro portable distribution | ZIP archive (Manifest + JSON) |
| `.macro.json` | Native Macro Definition | Import / Export | Library storage and raw JSON exchange | UTF-8 JSON (Schema 12) |
| `.mrbackup` | Library Backup Archive | Import / Export | Complete library and settings backup | UTF-8 JSON Archive + SHA-256 |
| `.ahk` | AutoHotkey Script | Import / Export | AHK v1/v2 import; AHK v2 script export | Plaintext script |
| `.amc` | AMC Macro | Import Only | AMC / XML macro interchange | XML |
| `.mrf` | Jitbit Macro Script | Import Only | Jitbit / Bartels Macro Recorder scripts | Plaintext script / commands |
| `.au3` | AutoIt Script | Import Only | AutoIt / AU3Recorder recordings | Plaintext script |
| `.xml` | Razer Synapse Macro | Import Only | Razer Synapse 3 & 4 macro exchange | XML schema |
| `.rec` | TinyTask Recording | Import Only | Binary Windows message recordings | Binary Win32 `EVENTMSG` stream |

---

## 1. Portable Macro Package (`.mrmacro`)

The `.mrmacro` container is the primary interchange format for sharing individual macros.

### Container Layout

```text
package.mrmacro (ZIP Archive)
├── manifest.json
└── macro.json
```

- Both entries are located at the root of the ZIP container (no parent folder inside).
- Entry names are strictly case-sensitive.
- All JSON payloads are UTF-8 encoded with no BOM.
- Property names use `camelCase`.
- Enumerations are serialized as string values.

### Manifest Contract (`manifest.json`)

```json
{
  "format": "macro-recorder/macro-package",
  "formatVersion": 1,
  "macroSchemaVersion": 12,
  "createdAtUtc": "2026-09-11T20:00:00.000Z",
  "macroEntry": "macro.json",
  "macroSha256": "5f9b4... (lowercase hex 64 chars)",
  "sourceDpi": 96
}
```

#### Field Specifications:
- `format` *(string, required)*: Constant identifier `"macro-recorder/macro-package"`.
- `formatVersion` *(integer, required)*: Container structure version. Current version is `1`.
- `macroSchemaVersion` *(integer, required)*: Macro data model schema version. Current version is `12`.
- `createdAtUtc` *(string, ISO 8601)*: Timestamp when the package was authored.
- `macroEntry` *(string, required)*: Relative path within the ZIP to the payload (default `"macro.json"`).
- `macroSha256` *(string, required)*: Lowercase hex-encoded SHA-256 hash of the exact uncompressed bytes of `macroEntry`.
- `sourceDpi` *(integer, optional)*: Display DPI of the authoring machine (96 = 100%, 120 = 125%, 144 = 150%, 192 = 200%).

### Import Safety & Constraints
1. **Size Limits**:
   - `manifest.json` max size: 1 MiB (1,048,576 bytes).
   - `macro.json` max size: 50 MiB (52,428,800 bytes).
   - Maximum events per macro: 1,000,000 actions.
2. **Integrity Enforcement**:
   - The SHA-256 hash of `macro.json` is computed before deserialization. If it fails to match `macroSha256`, import is aborted immediately.
3. **Safety Defaults**:
   - Imported macros receive a freshly generated unique ID (`UUIDv4`).
   - Imported macros arrive in a **disabled** state (`isEnabled: false`) to avoid accidental firing.
   - Assigned hotkeys are retained for review, but are checked for conflicts before activation.
4. **DPI Rescaling**:
   - When `sourceDpi` is present and differs from the importing display DPI, screen coordinates (pixel trigger X/Y, `WaitForPixelGone` coordinates, and absolute mouse moves) are automatically scaled:
     $$\text{coordinate}_{\text{target}} = \text{round}\left(\text{coordinate}_{\text{source}} \times \frac{\text{targetDpi}}{\text{sourceDpi}}\right)$$
   - If `sourceDpi` is missing, coordinates are retained as-is with an informational portability warning displayed in the UI.
5. **Sandboxed Decompression**:
   - Archive entries are inspected and read purely in memory. No temporary files are written to disk.

---

## 2. Native Macro Definition (`.macro.json`)

The `.macro.json` format persists macros within the local library (`%LocalAppData%\MacroRecorder` or portable directory) and represents individual exported macros.

### Schema Version History
- **Schema 9**: Baseline event timeline with microsecond timestamps and intervals.
- **Schema 10**: Introduced annotations. Every event carries an optional `comment` string, and standalone `Comment` rows are supported.
- **Schema 11**: Added window-targeted input delivery configurations, background message delivery parameters, and DPI metadata.
- **Schema 12**: Enhanced gamepad axis calibration models and multi-monitor absolute coordinate tags.

### JSON Structure (Schema 12)

```json
{
  "schemaVersion": 12,
  "id": "c7a8b412-9214-4e2b-b91c-29d91f2a33a1",
  "name": "Rapid Crafting Sequence",
  "isEnabled": false,
  "shortcut": {
    "key": "F6",
    "modifiers": ["Ctrl"],
    "behavior": "PressToStop",
    "passThrough": false,
    "onlyWhenTargetActive": false
  },
  "playbackSettings": {
    "speed": 1.0,
    "repeatCount": 1,
    "infiniteRepeat": false,
    "delayBetweenRepeatsMs": 0,
    "randomDelayMinMs": 0,
    "randomDelayMaxMs": 0,
    "deliveryMode": "StandardInput",
    "targetWindow": null
  },
  "events": [
    {
      "id": 1,
      "type": "Comment",
      "timestampUs": 0,
      "intervalUs": 0,
      "comment": "Initialize crafting bench sequence"
    },
    {
      "id": 2,
      "type": "KeyDown",
      "timestampUs": 150000,
      "intervalUs": 150000,
      "vkCode": 69,
      "scanCode": 18,
      "isExtended": false,
      "comment": "Press E to interact"
    },
    {
      "id": 3,
      "type": "KeyUp",
      "timestampUs": 200000,
      "intervalUs": 50000,
      "vkCode": 69,
      "scanCode": 18,
      "isExtended": false
    },
    {
      "id": 4,
      "type": "WaitForPixelGone",
      "timestampUs": 200000,
      "intervalUs": 0,
      "x": 960,
      "y": 540,
      "expectedColorHex": "#FFFFFF",
      "timeoutMs": 5000,
      "comment": "Wait for inventory screen"
    }
  ]
}
```

### Event Catalogue

| Event Type | Required Properties | Description |
|---|---|---|
| `KeyDown` | `vkCode`, `scanCode`, `isExtended` | Physical or virtual key down |
| `KeyUp` | `vkCode`, `scanCode`, `isExtended` | Physical or virtual key release |
| `KeyPress` | `vkCode`, `scanCode`, `isExtended`, `holdDurationUs` | Paired key down and up |
| `TypeText` | `text` | Unicode character string injected via `WM_CHAR` |
| `MouseDown` | `button` (`Left`, `Right`, `Middle`, `X1`, `X2`), `x`, `y` | Mouse button press |
| `MouseUp` | `button`, `x`, `y` | Mouse button release |
| `MouseClick` | `button`, `x`, `y`, `holdDurationUs` | Paired mouse button click |
| `MouseMove` | `x`, `y`, `isRelative`, `deltaX`, `deltaY` | Absolute cursor placement or relative Raw Input delta |
| `MouseWheel` | `delta`, `axis` (`Vertical`, `Horizontal`) | Mouse wheel rotation |
| `GamepadButtonDown` | `button` (`A`, `B`, `X`, `Y`, `LB`, `RB`, `Back`, `Start`, `LS`, `RS`, `DpadUp`, etc.) | Virtual gamepad button down |
| `GamepadButtonUp` | `button` | Virtual gamepad button release |
| `GamepadAxis` | `axis` (`LeftThumbX`, `LeftThumbY`, `RightThumbX`, `RightThumbY`, `LeftTrigger`, `RightTrigger`), `value` | Analogue stick/trigger axis position (-32768..32767 or 0..255) |
| `PixelTrigger` | `x`, `y`, `expectedColorHex`, `tolerance` | Watch pixel; fires when matched |
| `WaitForPixelGone` | `x`, `y`, `expectedColorHex`, `timeoutMs` | Pause playback until colour changes |
| `WaitForWindow` | `windowTitle`, `className`, `timeoutMs` | Pause playback until window exists |
| `WaitForKey` | `vkCode`, `timeoutMs` | Pause playback until user taps key |
| `RunMacro` | `targetMacroName`, `targetMacroId` | Execute nested macro (up to depth 16) |
| `Delay` | `durationUs` | Pure timeline wait |
| `OverlayText` | `message`, `durationMs`, `showCountdown` | Non-interactive click-through HUD text |
| `Comment` | `comment` | Standalone timeline note (0 duration) |

---

## 3. Full Library Backup Archive (`.mrbackup`)

`.mrbackup` provides whole-library snapshot, archival, and restoration.

### Format Structure

`.mrbackup` is a single UTF-8 encoded JSON document containing all library folders, macro JSON definitions, optional application configuration, and an embedded SHA-256 checksum:

```json
{
  "format": "macro-recorder/library-backup",
  "formatVersion": 1,
  "createdAtUtc": "2026-09-11T20:00:00.000Z",
  "appVersion": "1.0.0",
  "folders": [
    { "id": "fld-1", "parentId": null, "name": "Gaming" },
    { "id": "fld-2", "parentId": "fld-1", "name": "Combos" }
  ],
  "macros": [
    {
      "folderId": "fld-2",
      "data": { /* Complete .macro.json payload */ }
    }
  ],
  "settings": {
    /* Optional export of application settings */
  },
  "contentSha256": "4a1e9... (SHA-256 digest of folders + macros data)"
}
```

### Restore Modes
- **Merge Mode**: Adds imported macros and folders into the existing library. In case of name collisions, imported items receive numeric suffixes (`Combo (1)`, `Combo (2)`).
- **Replace Mode**: Safely moves the active library to the Windows Recycle Bin, then recreates the entire library hierarchy from the backup.

---

## 4. AutoHotkey Script (`.ahk`)

### Import Capabilities
- Static parser supporting AutoHotkey v1 and v2 basic syntax.
- Maps `Send`, `SendInput`, `SendEvent`, `Click`, `MouseMove`, `Sleep`, `ToolTip`.
- Line comments (`;`) and block comments (`/* ... */`) are parsed into `Comment` rows.
- Trailing inline comments on command lines become the `comment` property of the resulting event.
- Non-convertible scripting logic (variables, loops, expressions, DLL calls) are preserved as formatted `Comment` rows so script intent remains legible.

### Export Capabilities
- Exports active macro into standard, self-contained **AutoHotkey v2** script.
- Generates clean hotkey headers (e.g. `^F6::`).
- Emits accurate microsecond-scaled `DllCall("Sleep", ...)` or `Sleep` commands.
- Encodes relative and absolute mouse movements (`MouseMove`, `Click`).
- Annotates overlay, pixel triggers, and gamepad actions as commented notes.

---

## 5. Third-Party Format Importers

Macro Recorder provides built-in compatibility with legacy formats via the `MacroImporterRegistry`:

### AMC Macros (`.amc`)
- XML-based macro files used by hardware mice and macro utilities.
- Maps mouse button events, wheel movements, keyboard scan codes, and timing delays.

### Jitbit / Bartels Macro Recorder (`.mrf`)
- Proprietary command-based scripts.
- Parses `DELAY`, `Keyboard : KeyPress`, `Mouse : Click`, `Type text` commands.

### AutoIt Scripts (`.au3` / AU3Recorder)
- Parses AU3Recorder recordings (`_AU3RecordEnable()`, `Send()`, `MouseMove()`, `MouseDown()`, `MouseUp()`, `Sleep()`).

### Razer Synapse 3 & 4 (`.xml`)
- Parses XML macro recordings exported from Razer Synapse.
- Translates KeyDown, KeyUp, Delay, MouseButton, and MouseMove nodes.

### TinyTask Recordings (`.rec`)
- Binary format consisting of a sequential stream of Win32 `EVENTMSG` structures:
  ```c
  typedef struct tagEVENTMSG {
    UINT  message;
    UINT  paramL;
    UINT  paramH;
    DWORD time;
    HWND  hwnd;
  } EVENTMSG;
  ```
- Parsed into native Key, Mouse, and Delay events while retaining relative delta timings.

---

## 6. `MacroImporterRegistry` Architecture

The importer subsystem resolves files through a multi-stage process:

1. **Extension Matching**: Attempts immediate resolution via file extension (`.mrmacro`, `.macro.json`, `.ahk`, `.amc`, `.mrf`, `.au3`, `.xml`, `.rec`).
2. **Content Sniffing**: If extension matching is inconclusive (e.g. file renamed or lacking extension), the importer inspects initial magic bytes:
   - ZIP PK header (`PK\x03\x04`) $\rightarrow$ sniff for `manifest.json` $\rightarrow$ `.mrmacro`.
   - JSON root with `"schemaVersion"` or `"SchemaVersion"` $\rightarrow$ `.macro.json`.
   - XML declaration (`<?xml`) with root tags $\rightarrow$ `.amc` or Razer `.xml`.
   - Binary `EVENTMSG` pattern $\rightarrow$ `.rec`.
   - Text heuristics (`#Requires AutoHotkey`, `;`, `SendInput`) $\rightarrow$ `.ahk`.
3. **Graceful Degeneracy**: Unrecognized commands within valid scripts never cause import failure; they are converted into yellow-flagged `Comment` rows with detailed diagnostics.
