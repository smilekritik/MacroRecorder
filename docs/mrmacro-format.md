# `.mrmacro` portable macro package

`.mrmacro` is the portable exchange format for Macro Recorder. It is a ZIP container so one macro remains a single file while future versions can add previews, icons, scripts, or migration metadata without changing the extension.

## Container layout

```text
example.mrmacro
├── manifest.json
└── macro.json
```

Both entry names are case-sensitive. JSON is UTF-8 and uses camel-case property names. Enum values are serialized as strings.

## Manifest version 1

```json
{
  "format": "macro-recorder/macro-package",
  "formatVersion": 1,
  "macroSchemaVersion": 11,
  "createdAtUtc": "2026-08-06T20:00:00+00:00",
  "macroEntry": "macro.json",
  "macroSha256": "lowercase SHA-256 of the exact macro.json bytes",
  "sourceDpi": 96
}
```

- `format` is the stable package signature.
- `formatVersion` versions the container and manifest contract.
- `macroSchemaVersion` versions the macro data model independently.
- `macroEntry` allows a future container version to move or rename the payload.
- `macroSha256` detects truncation, accidental modification, and damaged transfers. It is an integrity check, not a digital signature.
- `sourceDpi` records the effective display DPI at export time (96 = 100%). It is optional and does not change `formatVersion`: old packages omit it and import unchanged. When present and different from the importing machine's DPI, screen coordinates (pixel triggers, `WaitForPixelGone`, absolute moves) are rescaled by `targetDpi / sourceDpi`.

## Import safety

- The importer rejects unsupported future package and macro schema versions with an explicit update message.
- `manifest.json` is limited to 1 MiB, `macro.json` to 50 MiB, and a macro to 1,000,000 events.
- Imported macros receive a new ID and are disabled before being stored. Their hotkey is retained for review.
- Target-window settings are retained but produce a portability warning. Screen coordinates are rescaled to the importing machine's DPI when `sourceDpi` is known; otherwise they are retained with a portability warning, because they can still differ across resolutions and monitor layouts.
- No archive entry is extracted to the filesystem.

## Compatibility

Macro Recorder continues to import native `.macro.json`, legacy recorder JSON, AutoHotkey `.ahk`, and AMC `.amc`, and additionally imports Jitbit / Bartels Macro Recorder `.mrf`, AutoIt `.au3` (AU3Recorder), Razer Synapse 3/4 `.xml`, and TinyTask `.rec` (a binary Win32 `EVENTMSG` array). None of these bump the container `formatVersion` or the macro schema — every format maps onto existing event types. The importer is a registry (`MacroImporterRegistry`): a file is matched by extension first, then by content sniffing, so a renamed file still resolves and an extension never loses to another format's greedy sniff. Unrecognized commands never fail an import; they become comment rows with a warning. Native JSON recognition is case-insensitive for `SchemaVersion` so both historical Pascal-case files and future camel-case files remain readable.

## Schema 10 — comments

Schema 10 adds annotations. Every event carries an optional `Comment` string, and the new `Comment`
event type is a standalone timeline row that sends no input and consumes no time: its timestamp always
mirrors the preceding action. Files written by schema 9 load unchanged — the new field defaults to
an empty string. AutoHotkey import maps `;` line comments and `/* … */` blocks to comment rows, while a
trailing `;` comment on a code line becomes the `Comment` of the action that line produced.
