#!/usr/bin/env python3
"""
generate_fixtures.py
Deterministically generates the complete suite of immutable legacy fixtures,
expected normalized results, expected warnings, package containers (.mrmacro, .mrbackup),
binary TinyTask (.rec), corrupted checksum scenarios, recovery edge cases, settings,
run history, and manifests for Macro Recorder rewrite compatibility verification.
"""

import os
import sys
import json
import struct
import zipfile
import hashlib
from datetime import datetime, timezone

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FIXED_TIMESTAMP = (2026, 9, 11, 0, 0, 0)
FIXED_ISO = "2026-09-11T00:00:00+00:00"

def write_text(rel_path, content):
    full_path = os.path.join(BASE_DIR, rel_path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)
    return full_path

def write_bytes(rel_path, data):
    full_path = os.path.join(BASE_DIR, rel_path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "wb") as f:
        f.write(data)
    return full_path

def write_json(rel_path, obj):
    return write_text(rel_path, json.dumps(obj, indent=2, ensure_ascii=False) + "\n")

def create_deterministic_zip(rel_path, entries):
    """
    Creates a ZIP file where each entry has a fixed timestamp and compression
    so the resulting ZIP file has an exact deterministic SHA-256 hash.
    entries: list of (arcname, bytes_content)
    """
    full_path = os.path.join(BASE_DIR, rel_path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with zipfile.ZipFile(full_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for arcname, data in entries:
            zinfo = zipfile.ZipInfo(filename=arcname, date_time=FIXED_TIMESTAMP)
            zinfo.compress_type = zipfile.ZIP_DEFLATED
            zinfo.external_attr = 0o644 << 16
            zf.writestr(zinfo, data)
    return full_path

def compute_sha256(data):
    return hashlib.sha256(data).hexdigest().lower()

def compute_bundle_hash(entries):
    """
    Matches C# MacroLibraryStore.ComputeBundleHash:
    Entries sorted ordinally by Name.
    For each: header = utf8(name + "\n"), then bytes.
    SHA-256 transform.
    """
    sorted_entries = sorted(entries, key=lambda x: x[0])
    sha = hashlib.sha256()
    for name, data in sorted_entries:
        header = (name + "\n").encode("utf-8")
        sha.update(header)
        sha.update(data)
    return sha.hexdigest().lower()


# ==============================================================================
# 1. SCHEMAS & DEFAULT EDGES
# ==============================================================================

def generate_schemas():
    print("Generating schema fixtures...")

    # Schema 12 (Current) - PascalCase property names as written by C# MacroLibraryStore.SaveAsync
    schema_12 = {
        "SchemaVersion": 12,
        "Id": "11111111-1111-1111-1111-111111111112",
        "Name": "Standard Schema 12 Macro",
        "Folder": "Production",
        "Description": "Production macro with full Schema 12 features including per-macro overlay overrides and wheel binds.",
        "IsEnabled": True,
        "Tags": ["production", "schema12", "golden"],
        "ModifiedAt": FIXED_ISO,
        "Recording": {
            "Keyboard": True,
            "MouseButtons": True,
            "MouseMovement": True,
            "MouseWheel": True,
            "Gamepad": True,
            "MouseMoveBucketMilliseconds": 10,
            "CountdownSeconds": 3
        },
        "Playback": {
            "ActivationMode": "ToggleStop",
            "TargetMode": "SpecificWindow",
            "FocusLossBehavior": "Continue",
            "PassThroughHotkey": False,
            "HotkeyScopedToTarget": True,
            "TargetProcessName": "game.exe",
            "TargetWindowTitle": "Game Window",
            "Speed": 1.5,
            "RandomizeTiming": True,
            "TimingJitterMilliseconds": 15,
            "RepeatCount": 3,
            "RepeatDelayMilliseconds": 250,
            "PreferScanCodes": True,
            "InfoCardOverride": "ForceHide",
            "CustomTextOverride": "ForceShow"
        },
        "Hotkey": {
            "VirtualKey": 0,
            "MouseButton": "None",
            "Wheel": "Up",
            "Control": True,
            "Alt": False,
            "Shift": True,
            "Windows": False
        },
        "Events": [
            {
                "Id": "a0000001-0000-0000-0000-000000000001",
                "TimeMicroseconds": 0,
                "Device": "Keyboard",
                "Type": "Comment",
                "VirtualKey": 0,
                "ScanCode": 0,
                "Extended": False,
                "Button": "None",
                "DeltaX": 0,
                "DeltaY": 0,
                "WheelDelta": 0,
                "AbsoluteMove": False,
                "GamepadButton": "None",
                "GamepadAxis": "None",
                "AxisValue": 0,
                "PadIndex": 0,
                "Text": "Initial sequence comment",
                "Comment": "",
                "DurationMicroseconds": 0,
                "ShowOverlayTiming": True,
                "PixelX": 0,
                "PixelY": 0,
                "PixelColor": 0,
                "TriggerCooldownMilliseconds": 3000,
                "WaitProcessName": "",
                "WaitWindowTitle": "",
                "WaitKeyVirtualKey": 0,
                "WaitTimeoutMilliseconds": 0,
                "SubMacroName": ""
            },
            {
                "Id": "a0000001-0000-0000-0000-000000000002",
                "TimeMicroseconds": 10000,
                "Device": "Keyboard",
                "Type": "KeyDown",
                "VirtualKey": 65,
                "ScanCode": 30,
                "Extended": False,
                "Button": "None",
                "DeltaX": 0,
                "DeltaY": 0,
                "WheelDelta": 0,
                "AbsoluteMove": False,
                "GamepadButton": "None",
                "GamepadAxis": "None",
                "AxisValue": 0,
                "PadIndex": 0,
                "Text": "",
                "Comment": "Press A",
                "DurationMicroseconds": 0,
                "ShowOverlayTiming": True,
                "PixelX": 0,
                "PixelY": 0,
                "PixelColor": 0,
                "TriggerCooldownMilliseconds": 3000,
                "WaitProcessName": "",
                "WaitWindowTitle": "",
                "WaitKeyVirtualKey": 0,
                "WaitTimeoutMilliseconds": 0,
                "SubMacroName": ""
            },
            {
                "Id": "a0000001-0000-0000-0000-000000000003",
                "TimeMicroseconds": 40000,
                "Device": "Keyboard",
                "Type": "KeyUp",
                "VirtualKey": 65,
                "ScanCode": 30,
                "Extended": False,
                "Button": "None",
                "DeltaX": 0,
                "DeltaY": 0,
                "WheelDelta": 0,
                "AbsoluteMove": False,
                "GamepadButton": "None",
                "GamepadAxis": "None",
                "AxisValue": 0,
                "PadIndex": 0,
                "Text": "",
                "Comment": "",
                "DurationMicroseconds": 0,
                "ShowOverlayTiming": True,
                "PixelX": 0,
                "PixelY": 0,
                "PixelColor": 0,
                "TriggerCooldownMilliseconds": 3000,
                "WaitProcessName": "",
                "WaitWindowTitle": "",
                "WaitKeyVirtualKey": 0,
                "WaitTimeoutMilliseconds": 0,
                "SubMacroName": ""
            }
        ]
    }
    write_json("schemas/schema-12-current.macro.json", schema_12)
    write_json("schemas/schema-12-current.expected.json", schema_12)

    # Schema 11 (Portable container package representation, camelCase)
    schema_11 = {
        "schemaVersion": 11,
        "id": "11111111-1111-1111-1111-111111111111",
        "name": "Package Macro Schema 11",
        "folder": "",
        "description": "Portable macro package schema 11 format with camelCase fields.",
        "isEnabled": True,
        "tags": ["portable", "schema11"],
        "modifiedAt": FIXED_ISO,
        "recording": {
            "keyboard": True,
            "mouseButtons": True,
            "mouseMovement": True,
            "mouseWheel": True,
            "gamepad": False,
            "mouseMoveBucketMilliseconds": 10,
            "countdownSeconds": 0
        },
        "playback": {
            "activationMode": "Once",
            "targetMode": "ForegroundAtStart",
            "focusLossBehavior": "Continue",
            "passThroughHotkey": False,
            "hotkeyScopedToTarget": False,
            "targetProcessName": "",
            "targetWindowTitle": "",
            "speed": 1.0,
            "randomizeTiming": False,
            "timingJitterMilliseconds": 10,
            "repeatCount": 1,
            "repeatDelayMilliseconds": 0,
            "preferScanCodes": False,
            "infoCardOverride": "Inherit",
            "customTextOverride": "Inherit"
        },
        "hotkey": {
            "virtualKey": 112,
            "mouseButton": "None",
            "wheel": "None",
            "control": False,
            "alt": False,
            "shift": False,
            "windows": False
        },
        "events": [
            {
                "id": "b0000001-0000-0000-0000-000000000001",
                "timeMicroseconds": 0,
                "device": "Keyboard",
                "type": "KeyDown",
                "virtualKey": 112,
                "scanCode": 59,
                "extended": False,
                "button": "None",
                "deltaX": 0,
                "deltaY": 0,
                "wheelDelta": 0,
                "absoluteMove": False,
                "gamepadButton": "None",
                "gamepadAxis": "None",
                "axisValue": 0,
                "padIndex": 0,
                "text": "",
                "comment": "F1 down",
                "durationMicroseconds": 0,
                "showOverlayTiming": True,
                "pixelX": 0,
                "pixelY": 0,
                "pixelColor": 0,
                "triggerCooldownMilliseconds": 3000,
                "waitProcessName": "",
                "waitWindowTitle": "",
                "waitKeyVirtualKey": 0,
                "waitTimeoutMilliseconds": 0,
                "subMacroName": ""
            }
        ]
    }
    write_json("schemas/schema-11-package.macro.json", schema_11)
    # Expected migration to schema 12
    schema_11_expected = json.loads(json.dumps(schema_12))
    schema_11_expected["SchemaVersion"] = 12
    schema_11_expected["Id"] = schema_11["id"]
    schema_11_expected["Name"] = schema_11["name"]
    schema_11_expected["Folder"] = ""
    schema_11_expected["Description"] = schema_11["description"]
    schema_11_expected["Playback"]["ActivationMode"] = "Once"
    schema_11_expected["Playback"]["TargetMode"] = "ForegroundAtStart"
    schema_11_expected["Playback"]["HotkeyScopedToTarget"] = False
    schema_11_expected["Playback"]["TargetProcessName"] = ""
    schema_11_expected["Playback"]["TargetWindowTitle"] = ""
    schema_11_expected["Playback"]["Speed"] = 1.0
    schema_11_expected["Playback"]["RandomizeTiming"] = False
    schema_11_expected["Playback"]["RepeatCount"] = 1
    schema_11_expected["Playback"]["RepeatDelayMilliseconds"] = 0
    schema_11_expected["Playback"]["PreferScanCodes"] = False
    schema_11_expected["Playback"]["InfoCardOverride"] = "Inherit"
    schema_11_expected["Playback"]["CustomTextOverride"] = "Inherit"
    schema_11_expected["Hotkey"] = {
        "VirtualKey": 112,
        "MouseButton": "None",
        "Wheel": "None",
        "Control": False,
        "Alt": False,
        "Shift": False,
        "Windows": False
    }
    schema_11_expected["Events"] = [
        {
            "Id": "b0000001-0000-0000-0000-000000000001",
            "TimeMicroseconds": 0,
            "Device": "Keyboard",
            "Type": "KeyDown",
            "VirtualKey": 112,
            "ScanCode": 59,
            "Extended": False,
            "Button": "None",
            "DeltaX": 0,
            "DeltaY": 0,
            "WheelDelta": 0,
            "AbsoluteMove": False,
            "GamepadButton": "None",
            "GamepadAxis": "None",
            "AxisValue": 0,
            "PadIndex": 0,
            "Text": "",
            "Comment": "F1 down",
            "DurationMicroseconds": 0,
            "ShowOverlayTiming": True,
            "PixelX": 0,
            "PixelY": 0,
            "PixelColor": 0,
            "TriggerCooldownMilliseconds": 3000,
            "WaitProcessName": "",
            "WaitWindowTitle": "",
            "WaitKeyVirtualKey": 0,
            "WaitTimeoutMilliseconds": 0,
            "SubMacroName": ""
        }
    ]
    write_json("schemas/schema-11-package.expected.json", schema_11_expected)

    # Schema 10: Annotations, standalone Comment rows, FocusLossBehavior.Continue
    schema_10 = {
        "SchemaVersion": 10,
        "Id": "11111111-1111-1111-1111-111111111110",
        "Name": "Schema 10 Annotations Macro",
        "Folder": "Annotated",
        "Description": "Macro exercising Schema 10 Comment rows and FocusLossBehavior",
        "IsEnabled": True,
        "Tags": ["annotations"],
        "ModifiedAt": FIXED_ISO,
        "Recording": {
            "Keyboard": True,
            "MouseButtons": True,
            "MouseMovement": False,
            "MouseWheel": False,
            "Gamepad": False,
            "MouseMoveBucketMilliseconds": 10,
            "CountdownSeconds": 0
        },
        "Playback": {
            "ActivationMode": "WhileHeld",
            "TargetMode": "ForegroundAtStart",
            "FocusLossBehavior": "Continue",
            "PassThroughHotkey": False,
            "HotkeyScopedToTarget": False,
            "TargetProcessName": "",
            "TargetWindowTitle": "",
            "Speed": 1.0,
            "RandomizeTiming": False,
            "TimingJitterMilliseconds": 10,
            "RepeatCount": 1,
            "RepeatDelayMilliseconds": 0,
            "PreferScanCodes": False
        },
        "Hotkey": {
            "VirtualKey": 0,
            "MouseButton": "None",
            "Wheel": "Down",
            "Control": True,
            "Alt": False,
            "Shift": False,
            "Windows": False
        },
        "Events": [
            {
                "Id": "c0000001-0000-0000-0000-000000000001",
                "TimeMicroseconds": 0,
                "Device": "Keyboard",
                "Type": "Comment",
                "Text": "Section header comment",
                "Comment": ""
            },
            {
                "Id": "c0000001-0000-0000-0000-000000000002",
                "TimeMicroseconds": 25000,
                "Device": "Mouse",
                "Type": "MouseButtonDown",
                "Button": "Right",
                "Comment": "Right click for menu"
            }
        ]
    }
    write_json("schemas/schema-10-annotations.macro.json", schema_10)

    # Expected migration for Schema 10: gains InfoCardOverride/CustomTextOverride defaulted to Inherit
    schema_10_expected = json.loads(json.dumps(schema_10))
    schema_10_expected["SchemaVersion"] = 12
    schema_10_expected["Playback"]["InfoCardOverride"] = "Inherit"
    schema_10_expected["Playback"]["CustomTextOverride"] = "Inherit"
    schema_10_expected["Events"][1]["TimeMicroseconds"] = 25000
    write_json("schemas/schema-10-annotations.expected.json", schema_10_expected)

    # Schema 9: Legacy schema without comments or wheel bind
    schema_9 = {
        "SchemaVersion": 9,
        "Id": "11111111-1111-1111-1111-111111111109",
        "Name": "Legacy Schema 9 Macro",
        "Folder": "Old",
        "Description": "Legacy schema 9 without comments property",
        "IsEnabled": True,
        "Tags": ["legacy", "v9"],
        "ModifiedAt": FIXED_ISO,
        "Recording": {
            "Keyboard": True,
            "MouseButtons": True,
            "MouseMovement": True,
            "MouseWheel": True,
            "Gamepad": False
        },
        "Playback": {
            "ActivationMode": "Once",
            "TargetMode": "ForegroundAtStart",
            "Speed": 1.0,
            "RepeatCount": 1
        },
        "Hotkey": {
            "VirtualKey": 65,
            "MouseButton": "None",
            "Control": True,
            "Alt": False,
            "Shift": False,
            "Windows": False
        },
        "Events": [
            {
                "Id": "d0000001-0000-0000-0000-000000000001",
                "TimeMicroseconds": 15000,
                "Device": "Keyboard",
                "Type": "KeyDown",
                "VirtualKey": 65
            }
        ]
    }
    write_json("schemas/schema-09-legacy.macro.json", schema_9)

    schema_9_expected = {
        "SchemaVersion": 12,
        "Id": schema_9["Id"],
        "Name": schema_9["Name"],
        "Folder": schema_9["Folder"],
        "Description": schema_9["Description"],
        "IsEnabled": True,
        "Tags": ["legacy", "v9"],
        "ModifiedAt": FIXED_ISO,
        "Recording": {
            "Keyboard": True,
            "MouseButtons": True,
            "MouseMovement": True,
            "MouseWheel": True,
            "Gamepad": False,
            "MouseMoveBucketMilliseconds": 10,
            "CountdownSeconds": 0
        },
        "Playback": {
            "ActivationMode": "Once",
            "TargetMode": "ForegroundAtStart",
            "FocusLossBehavior": "Continue",
            "PassThroughHotkey": False,
            "HotkeyScopedToTarget": False,
            "TargetProcessName": "",
            "TargetWindowTitle": "",
            "Speed": 1.0,
            "RandomizeTiming": False,
            "TimingJitterMilliseconds": 10,
            "RepeatCount": 1,
            "RepeatDelayMilliseconds": 0,
            "PreferScanCodes": False,
            "InfoCardOverride": "Inherit",
            "CustomTextOverride": "Inherit"
        },
        "Hotkey": {
            "VirtualKey": 65,
            "MouseButton": "None",
            "Wheel": "None",
            "Control": True,
            "Alt": False,
            "Shift": False,
            "Windows": False
        },
        "Events": [
            {
                "Id": "d0000001-0000-0000-0000-000000000001",
                "TimeMicroseconds": 15000,
                "Device": "Keyboard",
                "Type": "KeyDown",
                "VirtualKey": 65,
                "ScanCode": 0,
                "Extended": False,
                "Button": "None",
                "DeltaX": 0,
                "DeltaY": 0,
                "WheelDelta": 0,
                "AbsoluteMove": False,
                "GamepadButton": "None",
                "GamepadAxis": "None",
                "AxisValue": 0,
                "PadIndex": 0,
                "Text": "",
                "Comment": "",
                "DurationMicroseconds": 0,
                "ShowOverlayTiming": True,
                "PixelX": 0,
                "PixelY": 0,
                "PixelColor": 0,
                "TriggerCooldownMilliseconds": 3000,
                "WaitProcessName": "",
                "WaitWindowTitle": "",
                "WaitKeyVirtualKey": 0,
                "WaitTimeoutMilliseconds": 0,
                "SubMacroName": ""
            }
        ]
    }
    write_json("schemas/schema-09-legacy.expected.json", schema_9_expected)

    # Schema 4/5: Older schema with ToggleRepeat activation mode
    schema_4_5 = {
        "SchemaVersion": 5,
        "Id": "11111111-1111-1111-1111-111111111105",
        "Name": "Legacy Schema 5 ToggleRepeat Macro",
        "Folder": "",
        "Description": "Macro from schema v5 using ToggleRepeat activation",
        "IsEnabled": True,
        "Playback": {
            "ActivationMode": "ToggleRepeat",
            "Speed": 2.0,
            "RepeatCount": 5
        },
        "Hotkey": {
            "VirtualKey": 113
        },
        "Events": [
            {
                "TimeMicroseconds": 10000,
                "Device": "Keyboard",
                "Type": "KeyDown",
                "VirtualKey": 32
            }
        ]
    }
    write_json("schemas/schema-04-05-legacy.macro.json", schema_4_5)

    schema_4_5_expected = json.loads(json.dumps(schema_9_expected))
    schema_4_5_expected["SchemaVersion"] = 12
    schema_4_5_expected["Id"] = schema_4_5["Id"]
    schema_4_5_expected["Name"] = schema_4_5["Name"]
    schema_4_5_expected["Folder"] = ""
    schema_4_5_expected["Description"] = schema_4_5["Description"]
    schema_4_5_expected["Tags"] = []
    schema_4_5_expected["Playback"]["ActivationMode"] = "ToggleStop"  # ToggleRepeat migrated to ToggleStop
    schema_4_5_expected["Playback"]["Speed"] = 2.0
    schema_4_5_expected["Playback"]["RepeatCount"] = 5
    schema_4_5_expected["Hotkey"]["VirtualKey"] = 113
    schema_4_5_expected["Hotkey"]["Control"] = False
    schema_4_5_expected["Events"][0]["TimeMicroseconds"] = 10000
    schema_4_5_expected["Events"][0]["VirtualKey"] = 32
    schema_4_5_expected["Events"][0]["Id"] = schema_9_expected["Events"][0]["Id"]
    write_json("schemas/schema-04-05-legacy.expected.json", schema_4_5_expected)

    # Legacy unversioned recorder JSON (LegacyMacroImporter)
    legacy_recorder = {
        "duration_ms": 25,
        "events": [
            {"t_ms": 5, "device": "keyboard", "type": "down", "vk": 65, "sc": 30},
            {"t_ms": 15, "device": "mouse", "type": "move", "dx_raw": 15, "dy_raw": -8},
            {"t_ms": 25, "device": "mouse", "type": "down", "button": "X1"}
        ]
    }
    write_json("schemas/legacy-recorder-unversioned.json", legacy_recorder)

    legacy_recorder_expected = {
        "Name": "sample-legacy",
        "Events": [
            {
                "TimeMicroseconds": 5000,
                "Device": "Keyboard",
                "Type": "KeyDown",
                "VirtualKey": 65,
                "ScanCode": 30,
                "Button": "None"
            },
            {
                "TimeMicroseconds": 15000,
                "Device": "Mouse",
                "Type": "MouseMove",
                "DeltaX": 15,
                "DeltaY": -8,
                "Button": "None"
            },
            {
                "TimeMicroseconds": 25000,
                "Device": "Mouse",
                "Type": "MouseButtonDown",
                "Button": "X1"
            }
        ]
    }
    write_json("schemas/legacy-recorder-unversioned.expected.json", legacy_recorder_expected)

    # Edge: Minimal Defaults (almost completely empty object)
    edge_minimal = {
        "Name": "Minimal Default Macro"
    }
    write_json("schemas/edge-minimal-defaults.macro.json", edge_minimal)

    edge_minimal_expected = json.loads(json.dumps(schema_9_expected))
    edge_minimal_expected["Name"] = "Minimal Default Macro"
    edge_minimal_expected["Folder"] = ""
    edge_minimal_expected["Description"] = ""
    edge_minimal_expected["Tags"] = []
    edge_minimal_expected["Hotkey"]["VirtualKey"] = 0
    edge_minimal_expected["Hotkey"]["Control"] = False
    edge_minimal_expected["Events"] = []
    write_json("schemas/edge-minimal-defaults.expected.json", edge_minimal_expected)

    # Edge: Case-Insensitive SchemaVersion ("schemaversion": 12)
    edge_case_insensitive = {
        "schemaversion": 12,
        "name": "Case Insensitive Schema Macro",
        "events": []
    }
    write_json("schemas/edge-case-insensitive-schema.macro.json", edge_case_insensitive)
    edge_case_insensitive_expected = json.loads(json.dumps(edge_minimal_expected))
    edge_case_insensitive_expected["Name"] = "Case Insensitive Schema Macro"
    write_json("schemas/edge-case-insensitive-schema.expected.json", edge_case_insensitive_expected)

    # Edge: Forward Compatibility with unknown future fields
    edge_future = json.loads(json.dumps(schema_12))
    edge_future["FutureSchemaAdditions"] = {
        "aiAssistedOptimization": True,
        "targetEngineVersion": "2.5.0"
    }
    edge_future["CustomUnknownTag"] = "ExperimentalFeatureAlpha"
    write_json("schemas/edge-future-unknown-fields.macro.json", edge_future)
    write_json("schemas/edge-future-unknown-fields.expected.json", edge_future)

    # Edge: RepeatForever = true forces ToggleStop activation
    edge_repeat_forever = json.loads(json.dumps(schema_12))
    edge_repeat_forever["Playback"]["RepeatCount"] = 0  # RepeatCount 0 = RepeatForever
    edge_repeat_forever["Playback"]["ActivationMode"] = "Once"  # Must be forced to ToggleStop
    write_json("schemas/edge-repeat-forever-toggle.macro.json", edge_repeat_forever)
    edge_repeat_forever_expected = json.loads(json.dumps(edge_repeat_forever))
    edge_repeat_forever_expected["Playback"]["ActivationMode"] = "ToggleStop"
    write_json("schemas/edge-repeat-forever-toggle.expected.json", edge_repeat_forever_expected)

    # Edge: All 19 MacroEventType enum values represented in a single macro
    event_types = [
        ("KeyDown", {"VirtualKey": 65, "ScanCode": 30}),
        ("KeyUp", {"VirtualKey": 65, "ScanCode": 30}),
        ("MouseMove", {"DeltaX": 20, "DeltaY": -15, "AbsoluteMove": True}),
        ("MouseButtonDown", {"Button": "Left"}),
        ("MouseButtonUp", {"Button": "Left"}),
        ("Wheel", {"WheelDelta": 120}),
        ("HorizontalWheel", {"WheelDelta": -120}),
        ("Delay", {"DurationMicroseconds": 50000}),
        ("OverlayText", {"Text": "Test Overlay", "DurationMicroseconds": 1500000, "ShowOverlayTiming": True}),
        ("PixelColorTrigger", {"PixelX": 250, "PixelY": 350, "PixelColor": 0x33FF55, "TriggerCooldownMilliseconds": 2000}),
        ("Comment", {"Text": "Step 1 complete"}),
        ("GamepadButtonDown", {"GamepadButton": "A", "PadIndex": 0}),
        ("GamepadButtonUp", {"GamepadButton": "A", "PadIndex": 0}),
        ("GamepadAxis", {"GamepadAxis": "LeftStickX", "AxisValue": 16000, "PadIndex": 0}),
        ("TypeText", {"Text": "Auto text payload"}),
        ("WaitForPixelGone", {"PixelX": 250, "PixelY": 350, "PixelColor": 0x33FF55, "WaitTimeoutMilliseconds": 5000}),
        ("WaitForWindow", {"WaitProcessName": "notepad.exe", "WaitWindowTitle": "Untitled - Notepad", "WaitTimeoutMilliseconds": 10000}),
        ("WaitForKey", {"WaitKeyVirtualKey": 13, "WaitTimeoutMilliseconds": 3000}),
        ("RunMacro", {"SubMacroName": "SubRoutine1"})
    ]

    all_events = []
    curr_time = 0
    for idx, (etype, extra) in enumerate(event_types):
        item = {
            "Id": f"f0000001-0000-0000-0000-{idx+1:012d}",
            "TimeMicroseconds": curr_time,
            "Device": "Gamepad" if "Gamepad" in etype else ("Mouse" if "Mouse" in etype or "Wheel" in etype else "Keyboard"),
            "Type": etype,
            "VirtualKey": 0,
            "ScanCode": 0,
            "Extended": False,
            "Button": "None",
            "DeltaX": 0,
            "DeltaY": 0,
            "WheelDelta": 0,
            "AbsoluteMove": False,
            "GamepadButton": "None",
            "GamepadAxis": "None",
            "AxisValue": 0,
            "PadIndex": 0,
            "Text": "",
            "Comment": f"Note for {etype}",
            "DurationMicroseconds": 0,
            "ShowOverlayTiming": True,
            "PixelX": 0,
            "PixelY": 0,
            "PixelColor": 0,
            "TriggerCooldownMilliseconds": 3000,
            "WaitProcessName": "",
            "WaitWindowTitle": "",
            "WaitKeyVirtualKey": 0,
            "WaitTimeoutMilliseconds": 0,
            "SubMacroName": ""
        }
        item.update(extra)
        all_events.append(item)
        if etype not in ("Comment", "Delay"):
            curr_time += 10000

    edge_all_events = json.loads(json.dumps(schema_12))
    edge_all_events["Name"] = "All Event Types Comprehensive Macro"
    edge_all_events["Events"] = all_events
    write_json("schemas/edge-all-event-types.macro.json", edge_all_events)
    write_json("schemas/edge-all-event-types.expected.json", edge_all_events)


# ==============================================================================
# 2. PACKAGES (.mrmacro, .mrbackup)
# ==============================================================================

def generate_packages():
    print("Generating package fixtures (.mrmacro, .mrbackup)...")

    # --- Valid .mrmacro ---
    macro_content = {
        "schemaVersion": 12,
        "id": "22222222-2222-2222-2222-222222222222",
        "name": "Transfer Macro",
        "description": "Valid portable package transfer macro",
        "isEnabled": True,
        "tags": ["transfer", "valid"],
        "modifiedAt": FIXED_ISO,
        "recording": {
            "keyboard": True,
            "mouseButtons": True,
            "mouseMovement": True,
            "mouseWheel": True,
            "gamepad": False,
            "mouseMoveBucketMilliseconds": 10,
            "countdownSeconds": 0
        },
        "playback": {
            "activationMode": "ToggleStop",
            "targetMode": "SpecificWindow",
            "focusLossBehavior": "Continue",
            "passThroughHotkey": False,
            "hotkeyScopedToTarget": True,
            "targetProcessName": "target_app.exe",
            "targetWindowTitle": "Target Application Window",
            "speed": 1.0,
            "randomizeTiming": False,
            "timingJitterMilliseconds": 10,
            "repeatCount": 1,
            "repeatDelayMilliseconds": 0,
            "preferScanCodes": False,
            "infoCardOverride": "Inherit",
            "customTextOverride": "Inherit"
        },
        "hotkey": {
            "virtualKey": 0,
            "mouseButton": "X1",
            "wheel": "None",
            "control": True,
            "alt": False,
            "shift": False,
            "windows": False
        },
        "events": [
            {
                "id": "22220001-0000-0000-0000-000000000001",
                "timeMicroseconds": 0,
                "device": "Keyboard",
                "type": "PixelColorTrigger",
                "pixelX": 140,
                "pixelY": -30,
                "pixelColor": 0x123ABC,
                "triggerCooldownMilliseconds": 4200
            },
            {
                "id": "22220001-0000-0000-0000-000000000002",
                "timeMicroseconds": 50000,
                "device": "Keyboard",
                "type": "KeyDown",
                "virtualKey": 69,
                "scanCode": 18
            }
        ]
    }
    macro_bytes = (json.dumps(macro_content, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
    macro_hash = compute_sha256(macro_bytes)

    valid_manifest = {
        "format": "macro-recorder/macro-package",
        "formatVersion": 1,
        "macroSchemaVersion": 12,
        "createdAtUtc": FIXED_ISO,
        "macroEntry": "macro.json",
        "macroSha256": macro_hash,
        "sourceDpi": 96
    }
    manifest_bytes = (json.dumps(valid_manifest, indent=2, ensure_ascii=False) + "\n").encode("utf-8")

    create_deterministic_zip("packages/valid.mrmacro", [
        ("manifest.json", manifest_bytes),
        ("macro.json", macro_bytes)
    ])
    write_json("packages/valid.mrmacro.manifest.json", valid_manifest)

    expected_valid_mrmacro = json.loads(json.dumps(macro_content))
    expected_valid_mrmacro["isEnabled"] = False  # Always disabled on import
    write_json("packages/valid.mrmacro.expected.json", expected_valid_mrmacro)
    write_json("packages/valid.mrmacro.expected.warnings.json", [
        "The target window is computer-specific. Select it again before enabling the macro.",
        "The macro contains screen coordinates. Verify them when using a different resolution, DPI, or monitor layout."
    ])

    # --- Tampered Checksum .mrmacro ---
    tampered_macro_bytes = b'{"modified": true, "name": "Damaged payload"}\n'
    create_deterministic_zip("packages/tampered-checksum.mrmacro", [
        ("manifest.json", manifest_bytes),  # original manifest with old hash
        ("macro.json", tampered_macro_bytes) # tampered payload
    ])

    # --- Tampered Manifest: Unsupported Format Version .mrmacro ---
    unsupported_ver_manifest = dict(valid_manifest)
    unsupported_ver_manifest["formatVersion"] = 99
    unsupported_ver_manifest_bytes = (json.dumps(unsupported_ver_manifest, indent=2) + "\n").encode("utf-8")
    create_deterministic_zip("packages/tampered-manifest-unsupported-version.mrmacro", [
        ("manifest.json", unsupported_ver_manifest_bytes),
        ("macro.json", macro_bytes)
    ])

    # --- Tampered Manifest: Bad Format Identifier .mrmacro ---
    bad_format_manifest = dict(valid_manifest)
    bad_format_manifest["format"] = "invalid-archive-format"
    bad_format_manifest_bytes = (json.dumps(bad_format_manifest, indent=2) + "\n").encode("utf-8")
    create_deterministic_zip("packages/tampered-manifest-bad-format.mrmacro", [
        ("manifest.json", bad_format_manifest_bytes),
        ("macro.json", macro_bytes)
    ])

    # --- Tampered: Missing macro.json in .mrmacro ---
    create_deterministic_zip("packages/tampered-missing-macro.mrmacro", [
        ("manifest.json", manifest_bytes)
    ])

    # --- Valid .mrbackup ---
    bk_macro1 = {
        "SchemaVersion": 12,
        "Id": "33333333-3333-3333-3333-333333333331",
        "Name": "Root macro",
        "Folder": "",
        "Description": "Backup root macro",
        "IsEnabled": True,
        "Tags": ["backup"],
        "ModifiedAt": FIXED_ISO,
        "Recording": {"Keyboard": True, "MouseButtons": True},
        "Playback": {"ActivationMode": "Once"},
        "Hotkey": {"VirtualKey": 65},
        "Events": [{"TimeMicroseconds": 10000, "Type": "KeyDown", "VirtualKey": 65}]
    }
    bk_macro2 = {
        "SchemaVersion": 12,
        "Id": "33333333-3333-3333-3333-333333333332",
        "Name": "Nested macro",
        "Folder": "Games",
        "Description": "Backup nested macro in Games folder",
        "IsEnabled": True,
        "Tags": ["backup", "games"],
        "ModifiedAt": FIXED_ISO,
        "Recording": {"Keyboard": True, "MouseButtons": True},
        "Playback": {"ActivationMode": "Once"},
        "Hotkey": {"VirtualKey": 66},
        "Events": [{"TimeMicroseconds": 20000, "Type": "KeyDown", "VirtualKey": 66}]
    }

    bk1_bytes = (json.dumps(bk_macro1, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
    bk2_bytes = (json.dumps(bk_macro2, indent=2, ensure_ascii=False) + "\n").encode("utf-8")

    archive_macro_entries = [
        ("Macros/Root macro.macro.json", bk1_bytes),
        ("Macros/Games/Nested macro.macro.json", bk2_bytes)
    ]
    bundle_hash = compute_bundle_hash(archive_macro_entries)

    backup_manifest = {
        "format": "macro-recorder/library-backup",
        "formatVersion": 1,
        "createdAtUtc": FIXED_ISO,
        "macroCount": 2,
        "sha256": bundle_hash,
        "includesSettings": False
    }
    backup_manifest_bytes = (json.dumps(backup_manifest, indent=2, ensure_ascii=False) + "\n").encode("utf-8")

    create_deterministic_zip("packages/valid.mrbackup", [
        ("manifest.json", backup_manifest_bytes),
        ("Macros/Root macro.macro.json", bk1_bytes),
        ("Macros/Games/Nested macro.macro.json", bk2_bytes)
    ])
    write_json("packages/valid.mrbackup.manifest.json", backup_manifest)
    write_json("packages/valid.mrbackup.expected.json", {
        "macroCount": 2,
        "macros": [
            {"Name": "Root macro", "Folder": ""},
            {"Name": "Nested macro", "Folder": "Games"}
        ]
    })

    # --- Tampered Checksum .mrbackup ---
    hacked_macro_bytes = b'{"Name": "Hacked macro content"}\n'
    create_deterministic_zip("packages/tampered-checksum.mrbackup", [
        ("manifest.json", backup_manifest_bytes), # old bundle hash
        ("Macros/Root macro.macro.json", hacked_macro_bytes),
        ("Macros/Games/Nested macro.macro.json", bk2_bytes)
    ])

    # --- Tampered Manifest: Bad Format .mrbackup ---
    bad_backup_manifest = dict(backup_manifest)
    bad_backup_manifest["format"] = "invalid-library-backup-format"
    bad_backup_manifest_bytes = (json.dumps(bad_backup_manifest, indent=2) + "\n").encode("utf-8")
    create_deterministic_zip("packages/tampered-manifest-bad-format.mrbackup", [
        ("manifest.json", bad_backup_manifest_bytes),
        ("Macros/Root macro.macro.json", bk1_bytes)
    ])

    # --- Tampered: Missing manifest.json in .mrbackup ---
    create_deterministic_zip("packages/tampered-missing-manifest.mrbackup", [
        ("Macros/Root macro.macro.json", bk1_bytes)
    ])


# ==============================================================================
# 3. IMPORTERS (ALL 10 SUPPORTED FORMATS)
# ==============================================================================

def generate_importers():
    print("Generating importer fixtures (all 10 formats)...")

    # 1. NativeJson (.macro.json, .json)
    native_content = {
        "SchemaVersion": 12,
        "Id": "44444444-4444-4444-4444-444444444444",
        "Name": "Sample Native Import",
        "Description": "Imported through NativeJson importer",
        "IsEnabled": True,
        "Events": [
            {"TimeMicroseconds": 12000, "Type": "KeyDown", "VirtualKey": 69}
        ]
    }
    write_json("importers/native-json/sample.macro.json", native_content)
    native_expected = json.loads(json.dumps(native_content))
    native_expected["IsEnabled"] = False  # Disabled on import
    write_json("importers/native-json/sample.macro.expected.json", native_expected)
    write_json("importers/native-json/sample.macro.expected.warnings.json", [])

    # 2. LegacyJson (.json)
    legacy_json = {
        "duration_ms": 30,
        "events": [
            {"t_ms": 1, "device": "keyboard", "type": "down", "vk": 65, "sc": 30},
            {"t_ms": 10, "device": "mouse", "type": "down", "button": "X1"}
        ]
    }
    write_json("importers/legacy-json/sample-legacy.json", legacy_json)
    legacy_expected = {
        "Name": "sample-legacy",
        "IsEnabled": False,
        "Events": [
            {"TimeMicroseconds": 1000, "Device": "Keyboard", "Type": "KeyDown", "VirtualKey": 65, "ScanCode": 30},
            {"TimeMicroseconds": 10000, "Device": "Mouse", "Type": "MouseButtonDown", "Button": "X1"}
        ]
    }
    write_json("importers/legacy-json/sample-legacy.expected.json", legacy_expected)
    write_json("importers/legacy-json/sample-legacy.expected.warnings.json", [])

    # 3. AutoHotkey (.ahk)
    ahk_script = (
        "#Requires AutoHotkey v2.0\n"
        "delay := 30\n"
        "XButton1:: {\n"
        '    Send "{e down}"\n'
        "    Sleep delay\n"
        '    Send "{e up}"\n'
        "    Loop 2 {\n"
        '        Click "down"\n'
        "        Sleep 10\n"
        '        Click "up"\n'
        "    }\n"
        "}\n"
        "F7::Pause()\n"
    )
    write_text("importers/autohotkey/sample.ahk", ahk_script)
    ahk_expected = {
        "Name": "sample",
        "IsEnabled": False,
        "Hotkey": {"MouseButton": "X1"},
        "DurationMicroseconds": 50000,
        "Events": [
            {"TimeMicroseconds": 0, "Type": "KeyDown", "VirtualKey": 0x45},
            {"TimeMicroseconds": 30000, "Type": "KeyUp", "VirtualKey": 0x45},
            {"TimeMicroseconds": 30000, "Type": "MouseButtonDown", "Button": "Left"},
            {"TimeMicroseconds": 40000, "Type": "MouseButtonUp", "Button": "Left"},
            {"TimeMicroseconds": 40000, "Type": "MouseButtonDown", "Button": "Left"},
            {"TimeMicroseconds": 50000, "Type": "MouseButtonUp", "Button": "Left"}
        ]
    }
    write_json("importers/autohotkey/sample.expected.json", ahk_expected)
    write_json("importers/autohotkey/sample.expected.warnings.json", [
        "External macros were imported disabled. Review the timeline, then enable the required macros manually."
    ])

    # 3b. AutoHotkey with comments and semicolon inside quotes
    ahk_comments = (
        "; script header\n"
        "/*\n"
        "block about the mode\n"
        "second line of the block\n"
        "*/\n"
        "#Requires AutoHotkey v2.0\n"
        "XButton1:: {\n"
        "    ; --- N2D ---\n"
        '    Click "down"   ; open\n'
        "    Sleep 10\n"
        '    Click "up"\n'
        '    Send "a;b"\n'
        "    ;\n"
        "}\n"
    )
    write_text("importers/autohotkey/comments.ahk", ahk_comments)
    ahk_comments_expected = {
        "Name": "comments",
        "Comments": ["script header", "block about the mode", "second line of the block", "--- N2D ---"],
        "ActionComment": "open",
        "DurationMicroseconds": 10000
    }
    write_json("importers/autohotkey/comments.expected.json", ahk_comments_expected)
    write_json("importers/autohotkey/comments.expected.warnings.json", [
        "External macros were imported disabled. Review the timeline, then enable the required macros manually."
    ])

    # 4. Amc (.amc) XML
    amc_content = (
        "<Root><DefaultMacro><Major>AMC sample</Major><Description>description</Description>\n"
        "<KeyDown><Syntax>KeyDown 69 1\n"
        "Delay 30\n"
        "KeyUp 69 1\n"
        "Delay 20\n"
        "LeftDown 1\n"
        "Delay 10\n"
        "LeftUp 1</Syntax></KeyDown></DefaultMacro></Root>\n"
    )
    write_text("importers/amc/sample.amc", amc_content)
    amc_expected = {
        "Name": "AMC sample",
        "Description": "description",
        "IsEnabled": False,
        "DurationMicroseconds": 60000,
        "Events": [
            {"TimeMicroseconds": 0, "Type": "KeyDown", "VirtualKey": 69},
            {"TimeMicroseconds": 30000, "Type": "KeyUp", "VirtualKey": 69},
            {"TimeMicroseconds": 50000, "Type": "MouseButtonDown", "Button": "Left"},
            {"TimeMicroseconds": 60000, "Type": "MouseButtonUp", "Button": "Left"}
        ]
    }
    write_json("importers/amc/sample.expected.json", amc_expected)
    write_json("importers/amc/sample.expected.warnings.json", [
        "AMC has no compatible global shortcut. The macro was imported disabled; assign a shortcut and review the timeline."
    ])

    # 5. JitbitMrf (.mrf)
    mrf_content = (
        "DELAY : 30\n"
        "Keyboard : 65 : KeyPress\n"
        "Mouse : 100 : 200 : LeftClick : 0 : 0\n"
        "TYPE TEXT : hello : world\n"
        "COMMENT : note\n"
        "GOTO : loop\n"
    )
    write_text("importers/jitbit-mrf/sample.mrf", mrf_content)
    mrf_expected = {
        "Name": "sample",
        "IsEnabled": False,
        "Events": [
            {"TimeMicroseconds": 30000, "Type": "KeyDown", "VirtualKey": 0x41},
            {"TimeMicroseconds": 30000, "Type": "KeyUp", "VirtualKey": 0x41},
            {"TimeMicroseconds": 30000, "Type": "MouseMove", "DeltaX": 100, "DeltaY": 200, "AbsoluteMove": True},
            {"TimeMicroseconds": 30000, "Type": "MouseButtonDown", "Button": "Left"},
            {"TimeMicroseconds": 30000, "Type": "MouseButtonUp", "Button": "Left"},
            {"TimeMicroseconds": 30000, "Type": "TypeText", "Text": "hello : world"},
            {"TimeMicroseconds": 30000, "Type": "Comment", "Text": "note"},
            {"TimeMicroseconds": 30000, "Type": "Comment", "Text": "GOTO : loop"}
        ]
    }
    write_json("importers/jitbit-mrf/sample.expected.json", mrf_expected)
    write_json("importers/jitbit-mrf/sample.expected.warnings.json", [
        "Labels and jumps are not supported (loops were intentionally left out); the line “GOTO : loop” was kept as a comment.",
        "The .mrf format has no compatible global shortcut. The macro was imported disabled; assign a shortcut and review the timeline."
    ])

    # 6. AutoIt (.au3)
    au3_content = (
        "; recorded by AU3Recorder\n"
        'HotKeySet("{F7}", "_go")\n'
        "Sleep(20)\n"
        'Send("{TAB}")\n'
        'MouseClick("left", 50, 60, 1)\n'
    )
    write_text("importers/autoit/sample.au3", au3_content)
    au3_expected = {
        "Name": "sample",
        "IsEnabled": False,
        "Hotkey": {"VirtualKey": 0x76},  # F7
        "Events": [
            {"TimeMicroseconds": 0, "Type": "Comment", "Text": "recorded by AU3Recorder"},
            {"TimeMicroseconds": 20000, "Type": "KeyDown", "VirtualKey": 0x09},
            {"TimeMicroseconds": 20000, "Type": "KeyUp", "VirtualKey": 0x09},
            {"TimeMicroseconds": 20000, "Type": "MouseMove", "DeltaX": 50, "DeltaY": 60, "AbsoluteMove": True},
            {"TimeMicroseconds": 20000, "Type": "MouseButtonDown", "Button": "Left"},
            {"TimeMicroseconds": 20000, "Type": "MouseButtonUp", "Button": "Left"}
        ]
    }
    write_json("importers/autoit/sample.expected.json", au3_expected)
    write_json("importers/autoit/sample.expected.warnings.json", [])

    # 7. Razer (.xml)
    razer_content = (
        "<Macro><Name>Razer sample</Name><MacroEvents>\n"
        "  <MacroEvent><Delay>15</Delay><KeyboardEvent><VirtualKey>65</VirtualKey><State>Down</State></KeyboardEvent></MacroEvent>\n"
        "  <MacroEvent><KeyboardEvent><VirtualKey>65</VirtualKey><State>Up</State></KeyboardEvent></MacroEvent>\n"
        "  <MacroEvent><MouseMovementEvent><X>120</X><Y>240</Y></MouseMovementEvent></MacroEvent>\n"
        "  <MacroEvent><MouseEvent><MouseButton>Left</MouseButton><State>Down</State></MouseEvent></MacroEvent>\n"
        "</MacroEvents></Macro>\n"
    )
    write_text("importers/razer/sample.xml", razer_content)
    razer_expected = {
        "Name": "Razer sample",
        "IsEnabled": False,
        "Events": [
            {"TimeMicroseconds": 15000, "Type": "KeyDown", "VirtualKey": 0x41},
            {"TimeMicroseconds": 15000, "Type": "KeyUp", "VirtualKey": 0x41},
            {"TimeMicroseconds": 15000, "Type": "MouseMove", "DeltaX": 120, "DeltaY": 240, "AbsoluteMove": True},
            {"TimeMicroseconds": 15000, "Type": "MouseButtonDown", "Button": "Left"}
        ]
    }
    write_json("importers/razer/sample.expected.json", razer_expected)
    write_json("importers/razer/sample.expected.warnings.json", [
        "Razer has no compatible global shortcut. The macro was imported disabled; assign a shortcut and review the timeline."
    ])

    # 8. TinyTask (.rec) binary Win32 EVENTMSG array
    # Header: 8 bytes (0x4D, 0x52, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05)
    rec_bytes = bytearray([0x4D, 0x52, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05])
    def add_eventmsg(msg, paramL, paramH, time_ms, hwnd=0):
        rec_bytes.extend(struct.pack("<IIIII", msg, paramL, paramH, time_ms, hwnd))

    add_eventmsg(0x100, 0x1E41, 0, 0)   # WM_KEYDOWN vk=0x41 sc=0x1E, time=0
    add_eventmsg(0x101, 0x1E41, 0, 5)   # WM_KEYUP time=5ms
    add_eventmsg(0x200, 100, 200, 10)   # WM_MOUSEMOVE x=100 y=200 time=10ms
    add_eventmsg(0x201, 0, 0, 12)       # WM_LBUTTONDOWN time=12ms
    write_bytes("importers/tinytask/sample.rec", bytes(rec_bytes))

    tinytask_expected = {
        "Name": "sample",
        "IsEnabled": False,
        "Events": [
            {"TimeMicroseconds": 0, "Type": "KeyDown", "VirtualKey": 0x41, "ScanCode": 0x1E},
            {"TimeMicroseconds": 5000, "Type": "KeyUp", "VirtualKey": 0x41, "ScanCode": 0x1E},
            {"TimeMicroseconds": 10000, "Type": "MouseMove", "DeltaX": 100, "DeltaY": 200, "AbsoluteMove": True},
            {"TimeMicroseconds": 12000, "Type": "MouseButtonDown", "Button": "Left"}
        ]
    }
    write_json("importers/tinytask/sample.expected.json", tinytask_expected)
    write_json("importers/tinytask/sample.expected.warnings.json", [
        "The .rec format has no shortcut. The macro was imported disabled; assign one and review the timeline."
    ])

    # 9. MacroPackage (.mrmacro)
    # Copy from packages/valid.mrmacro
    valid_mrmacro_path = os.path.join(BASE_DIR, "packages/valid.mrmacro")
    with open(valid_mrmacro_path, "rb") as f:
        pkg_data = f.read()
    with open(os.path.join(BASE_DIR, "packages/valid.mrmacro.expected.json"), "r", encoding="utf-8") as f:
        expected_valid_mrmacro = json.load(f)
    write_bytes("importers/macro-package/sample.mrmacro", pkg_data)
    write_json("importers/macro-package/sample.expected.json", expected_valid_mrmacro)
    write_json("importers/macro-package/sample.expected.warnings.json", [
        "The target window is computer-specific. Select it again before enabling the macro.",
        "The macro contains screen coordinates. Verify them when using a different resolution, DPI, or monitor layout."
    ])

    # 10. LibraryBackup (.mrbackup)
    valid_mrbackup_path = os.path.join(BASE_DIR, "packages/valid.mrbackup")
    with open(valid_mrbackup_path, "rb") as f:
        bk_data = f.read()
    write_bytes("importers/library-backup/sample.mrbackup", bk_data)
    write_json("importers/library-backup/sample.expected.json", {
        "macroCount": 2,
        "macros": [
            {"Name": "Root macro", "Folder": ""},
            {"Name": "Nested macro", "Folder": "Games"}
        ]
    })
    write_json("importers/library-backup/sample.expected.warnings.json", [])


# ==============================================================================
# 4. EXPORTERS (ALL 7 SUPPORTED FORMATS)
# ==============================================================================

def generate_exporters():
    print("Generating exporter fixtures (all 7 formats)...")

    # 1. AutoHotkeyV2 (.ahk)
    ahk_export_source = {
        "Name": "combo",
        "Hotkey": {
            "VirtualKey": 113,
            "MouseButton": "None",
            "Wheel": "None",
            "Control": False,
            "Alt": False,
            "Shift": False,
            "Windows": False
        },
        "Events": [
            {"TimeMicroseconds": 0, "Type": "Comment", "Text": "note"},
            {"TimeMicroseconds": 0, "Type": "KeyDown", "VirtualKey": 0x41},
            {"TimeMicroseconds": 0, "Type": "KeyUp", "VirtualKey": 0x41},
            {"TimeMicroseconds": 50000, "Type": "KeyDown", "VirtualKey": 0x0D},
            {"TimeMicroseconds": 50000, "Type": "KeyUp", "VirtualKey": 0x0D},
            {"TimeMicroseconds": 60000, "Type": "MouseMove", "DeltaX": 12, "DeltaY": -8},
            {"TimeMicroseconds": 60000, "Type": "MouseButtonDown", "Button": "Left"},
            {"TimeMicroseconds": 60000, "Type": "MouseButtonUp", "Button": "Left"},
            {"TimeMicroseconds": 70000, "Type": "TypeText", "Text": 'Hi "x"'},
            {"TimeMicroseconds": 80000, "Type": "GamepadButtonDown", "GamepadButton": "A"}
        ]
    }
    write_json("exporters/autohotkey-v2/source.macro.json", ahk_export_source)

    expected_ahk = (
        "#Requires AutoHotkey v2.0\n"
        "#SingleInstance Force\n\n"
        "; Exported from Macro Recorder — combo\n"
        "; Original bind: F2 (run this script to replay the macro)\n"
        "; Gamepad, overlay, pixel-trigger and sub-macro actions have no AutoHotkey equivalent and appear as comments.\n\n"
        "; note\n"
        'Send "{a down}"\n'
        'Send "{a up}"\n'
        "Sleep 50\n"
        'Send "{Enter down}"\n'
        'Send "{Enter up}"\n'
        "Sleep 10\n"
        'MouseMove 12, -8, 0, "R"\n'
        'Click "Left Down"\n'
        'Click "Left Up"\n'
        "Sleep 10\n"
        'SendText "Hi ""x"""\n'
        "Sleep 10\n"
        "; [not exported] GamepadButtonDown\n"
    )
    write_text("exporters/autohotkey-v2/expected.ahk", expected_ahk)

    # 2. DiagnosticsCsv (.csv)
    receipts = [
        {
            "EventId": "e1111111-1111-1111-1111-111111111111",
            "ScheduledMicroseconds": 0,
            "PlannedMicroseconds": 0,
            "DispatchStartedMicroseconds": 2000,
            "DispatchCompletedMicroseconds": 2000,
            "HookConfirmedMicroseconds": 2000,
            "DispatchJitterMilliseconds": 2.0,
            "ConfirmationMilliseconds": 0.0,
            "Success": True,
            "Error": None
        },
        {
            "EventId": "e2222222-2222-2222-2222-222222222222",
            "ScheduledMicroseconds": 50000,
            "PlannedMicroseconds": 54000,
            "DispatchStartedMicroseconds": 54000,
            "DispatchCompletedMicroseconds": 54500,
            "HookConfirmedMicroseconds": None,
            "DispatchJitterMilliseconds": 0.0,
            "ConfirmationMilliseconds": None,
            "Success": True,
            "Error": None
        }
    ]
    write_json("exporters/diagnostics-csv/source-receipts.json", receipts)

    expected_csv = (
        "event_id,scheduled_us,planned_us,dispatch_start_us,dispatch_end_us,hook_confirmed_us,jitter_ms,confirmation_ms,success,error\r\n"
        "e1111111-1111-1111-1111-111111111111,0,0,2000,2000,2000,2.000000,0.000000,true,\r\n"
        "e2222222-2222-2222-2222-222222222222,50000,54000,54000,54500,,0.000000,,true,\r\n"
    )
    write_text("exporters/diagnostics-csv/expected.csv", expected_csv)

    # 3. DiagnosticsJson (.json)
    write_json("exporters/diagnostics-json/source-receipts.json", receipts)
    write_json("exporters/diagnostics-json/expected.json", receipts)

    # 4. DiagnosticBundle (.zip)
    timing_summary = {
        "Count": 2,
        "Failed": 0,
        "Unconfirmed": 1,
        "MeanMs": 0.2,
        "MedianMs": 0.2,
        "P95Ms": 0.3,
        "P99Ms": 0.3,
        "MaxMs": 0.4
    }
    write_json("exporters/diagnostic-bundle/source-timing.json", timing_summary)

    bundle_summary_content = {
        "generatedAt": FIXED_ISO,
        "appVersion": "1.0.0.0",
        "os": "Microsoft Windows NT 10.0.22631.0",
        "runtime": ".NET 10.0.0",
        "architecture": "X64",
        "timing": timing_summary,
        "privacy": "Macro names, key codes and recorded events are intentionally excluded."
    }
    bundle_summary_bytes = (json.dumps(bundle_summary_content, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
    create_deterministic_zip("exporters/diagnostic-bundle/expected-bundle.zip", [
        ("summary.json", bundle_summary_bytes)
    ])

    # 5. NativeJson (.macro.json)
    native_export_source = {
        "SchemaVersion": 12,
        "Id": "55555555-5555-5555-5555-555555555555",
        "Name": "Native Export Gold",
        "Folder": "",
        "Description": "Macro exported as pure Native JSON",
        "IsEnabled": True,
        "Tags": ["export"],
        "ModifiedAt": FIXED_ISO,
        "Recording": {"Keyboard": True, "MouseButtons": True},
        "Playback": {"ActivationMode": "Once", "InfoCardOverride": "ForceShow"},
        "Hotkey": {"VirtualKey": 65},
        "Events": [{"TimeMicroseconds": 0, "Type": "KeyDown", "VirtualKey": 65}]
    }
    write_json("exporters/native-json/source.macro.json", native_export_source)
    write_json("exporters/native-json/expected.macro.json", native_export_source)

    # 6. MacroPackage (.mrmacro)
    write_json("exporters/macro-package/source.macro.json", native_export_source)
    # The expected .mrmacro
    m_bytes = (json.dumps(native_export_source, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
    m_manifest = {
        "format": "macro-recorder/macro-package",
        "formatVersion": 1,
        "macroSchemaVersion": 12,
        "createdAtUtc": FIXED_ISO,
        "macroEntry": "macro.json",
        "macroSha256": compute_sha256(m_bytes),
        "sourceDpi": 96
    }
    create_deterministic_zip("exporters/macro-package/expected.mrmacro", [
        ("manifest.json", (json.dumps(m_manifest, indent=2) + "\n").encode("utf-8")),
        ("macro.json", m_bytes)
    ])

    # 7. LibraryBackup (.mrbackup)
    # Re-use valid.mrbackup as expected
    with open(os.path.join(BASE_DIR, "packages/valid.mrbackup"), "rb") as f:
        lbk_bytes = f.read()
    write_bytes("exporters/library-backup/expected.mrbackup", lbk_bytes)


# ==============================================================================
# 5. DPI CASES
# ==============================================================================

def generate_dpi_cases():
    print("Generating DPI rescaling fixtures...")

    def make_dpi_macro(source_dpi):
        macro = {
            "schemaVersion": 12,
            "id": f"66666666-6666-6666-6666-{source_dpi:012d}",
            "name": f"DPI {source_dpi} Macro",
            "description": f"Macro recorded at {source_dpi} DPI",
            "isEnabled": True,
            "playback": {"activationMode": "Once"},
            "events": [
                {
                    "timeMicroseconds": 0,
                    "type": "PixelColorTrigger",
                    "pixelX": 100,
                    "pixelY": 200,
                    "pixelColor": 0x112233
                },
                {
                    "timeMicroseconds": 10000,
                    "type": "MouseMove",
                    "deltaX": 120,
                    "deltaY": 240,
                    "absoluteMove": True
                }
            ]
        }
        m_bytes = (json.dumps(macro, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
        manifest = {
            "format": "macro-recorder/macro-package",
            "formatVersion": 1,
            "macroSchemaVersion": 12,
            "createdAtUtc": FIXED_ISO,
            "macroEntry": "macro.json",
            "macroSha256": compute_sha256(m_bytes),
            "sourceDpi": source_dpi
        }
        return manifest, macro, m_bytes

    # Case 1: Source DPI 96 imported at target DPI 144 (scale factor 144 / 96 = 1.5)
    m96, macro96, bytes96 = make_dpi_macro(96)
    create_deterministic_zip("dpi/source-dpi-96.mrmacro", [
        ("manifest.json", (json.dumps(m96, indent=2) + "\n").encode("utf-8")),
        ("macro.json", bytes96)
    ])

    expected_96_to_144 = json.loads(json.dumps(macro96))
    expected_96_to_144["isEnabled"] = False
    expected_96_to_144["events"][0]["pixelX"] = 150  # 100 * 1.5
    expected_96_to_144["events"][0]["pixelY"] = 300  # 200 * 1.5
    expected_96_to_144["events"][1]["deltaX"] = 180  # 120 * 1.5
    expected_96_to_144["events"][1]["deltaY"] = 360  # 240 * 1.5
    write_json("dpi/source-dpi-96-target-144.expected.json", expected_96_to_144)
    write_json("dpi/source-dpi-96-target-144.expected.warnings.json", [
        "Screen coordinates were rescaled from DPI 96 to 144. Verify them for a different monitor layout."
    ])

    # Case 2: Source DPI 144 imported at target DPI 96 (scale factor 96 / 144 = 0.666666...)
    m144, macro144, bytes144 = make_dpi_macro(144)
    # Let initial coordinates be 150, 300, 180, 360
    macro144["events"][0]["pixelX"] = 150
    macro144["events"][0]["pixelY"] = 300
    macro144["events"][1]["deltaX"] = 180
    macro144["events"][1]["deltaY"] = 360
    bytes144 = (json.dumps(macro144, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
    m144["macroSha256"] = compute_sha256(bytes144)

    create_deterministic_zip("dpi/source-dpi-144.mrmacro", [
        ("manifest.json", (json.dumps(m144, indent=2) + "\n").encode("utf-8")),
        ("macro.json", bytes144)
    ])

    expected_144_to_96 = json.loads(json.dumps(macro144))
    expected_144_to_96["isEnabled"] = False
    expected_144_to_96["events"][0]["pixelX"] = 100  # 150 * 96/144
    expected_144_to_96["events"][0]["pixelY"] = 200  # 300 * 96/144
    expected_144_to_96["events"][1]["deltaX"] = 120  # 180 * 96/144
    expected_144_to_96["events"][1]["deltaY"] = 240  # 360 * 96/144
    write_json("dpi/source-dpi-144-target-96.expected.json", expected_144_to_96)
    write_json("dpi/source-dpi-144-target-96.expected.warnings.json", [
        "Screen coordinates were rescaled from DPI 144 to 96. Verify them for a different monitor layout."
    ])

    # Case 3: Source DPI omitted / 0
    m_omitted, macro_omitted, bytes_omitted = make_dpi_macro(0)
    del m_omitted["sourceDpi"]
    create_deterministic_zip("dpi/source-dpi-omitted.mrmacro", [
        ("manifest.json", (json.dumps(m_omitted, indent=2) + "\n").encode("utf-8")),
        ("macro.json", bytes_omitted)
    ])

    expected_omitted = json.loads(json.dumps(macro_omitted))
    expected_omitted["isEnabled"] = False
    write_json("dpi/source-dpi-omitted.expected.json", expected_omitted)
    write_json("dpi/source-dpi-omitted.expected.warnings.json", [
        "The macro contains screen coordinates. Verify them when using a different resolution, DPI, or monitor layout."
    ])


# ==============================================================================
# 6. SETTINGS (settings.json)
# ==============================================================================

def generate_settings():
    print("Generating settings fixtures...")

    # Default Settings
    default_settings = {
        "Theme": "Dark",
        "LanguageCode": "ru",
        "MacroLibraryPath": "",
        "StartWithWindows": True,
        "ShowMacroInformation": True,
        "GamepadDriverPromptDismissed": False,
        "GamepadOutput": "Xbox360",
        "HideRealGamepad": False,
        "OverlayScalePercent": 100,
        "OverlayInfoTransparencyPercent": 0,
        "ShowOverlayAnnotations": True,
        "ShowOverlayAnnotationTiming": True,
        "OverlayAnnotationScalePercent": 100,
        "OverlayAnnotationTransparencyPercent": 0,
        "OverlayInfoX": 1.0,
        "OverlayInfoY": 0.0,
        "OverlayAnnotationX": 1.0,
        "OverlayAnnotationY": 1.0,
        "ShowOverlayState": True,
        "ShowOverlayMacroName": True,
        "ShowOverlayCurrentAction": True,
        "ShowOverlaySchedule": True,
        "ShowOverlayLatency": True,
        "RecordingStartHotkey": {
            "VirtualKey": 118,
            "MouseButton": "None",
            "Wheel": "None",
            "Control": False,
            "Alt": False,
            "Shift": False,
            "Windows": False
        },
        "RecordingStopHotkey": {
            "VirtualKey": 119,
            "MouseButton": "None",
            "Wheel": "None",
            "Control": False,
            "Alt": False,
            "Shift": False,
            "Windows": False
        },
        "PlaybackPauseHotkey": {
            "VirtualKey": 120,
            "MouseButton": "None",
            "Wheel": "None",
            "Control": False,
            "Alt": False,
            "Shift": False,
            "Windows": False
        },
        "EmergencyStopHotkey": {
            "VirtualKey": 121,
            "MouseButton": "None",
            "Wheel": "None",
            "Control": False,
            "Alt": False,
            "Shift": False,
            "Windows": False
        },
        "PixelCaptureHotkey": {
            "VirtualKey": 116,
            "MouseButton": "None",
            "Wheel": "None",
            "Control": False,
            "Alt": False,
            "Shift": False,
            "Windows": False
        },
        "BindMapHotkey": {
            "VirtualKey": 122,
            "MouseButton": "None",
            "Wheel": "None",
            "Control": False,
            "Alt": False,
            "Shift": False,
            "Windows": False
        }
    }
    write_json("settings/default-settings.json", default_settings)

    # Migrated F12 to F11 Settings
    legacy_f12_settings = json.loads(json.dumps(default_settings))
    legacy_f12_settings["BindMapHotkey"]["VirtualKey"] = 123 # F12 (LegacyBindMapVk)
    write_json("settings/migrated-f12-to-f11-settings.json", legacy_f12_settings)

    migrated_f12_expected = json.loads(json.dumps(default_settings))
    migrated_f12_expected["BindMapHotkey"]["VirtualKey"] = 122 # Automatically migrated to F11
    write_json("settings/migrated-f12-to-f11-settings.expected.json", migrated_f12_expected)

    # Clearable Intent Hotkeys Settings: user explicitly cleared hotkeys
    cleared_settings = json.loads(json.dumps(default_settings))
    cleared_settings["RecordingStartHotkey"]["VirtualKey"] = 0
    cleared_settings["EmergencyStopHotkey"]["VirtualKey"] = 0
    cleared_settings["PixelCaptureHotkey"]["VirtualKey"] = 0
    write_json("settings/clearable-intent-hotkeys-settings.json", cleared_settings)
    write_json("settings/clearable-intent-hotkeys-settings.expected.json", cleared_settings)

    # Custom Options Settings
    custom_settings = json.loads(json.dumps(default_settings))
    custom_settings["Theme"] = "Light"
    custom_settings["LanguageCode"] = "en"
    custom_settings["MacroLibraryPath"] = "C:\\SharedMacros\\CustomLibrary"
    custom_settings["StartWithWindows"] = False
    custom_settings["GamepadOutput"] = "DualShock4"
    custom_settings["HideRealGamepad"] = True
    custom_settings["OverlayScalePercent"] = 150
    custom_settings["OverlayInfoTransparencyPercent"] = 20
    custom_settings["OverlayInfoX"] = 0.5
    custom_settings["OverlayInfoY"] = 0.8
    write_json("settings/custom-options-settings.json", custom_settings)


# ==============================================================================
# 7. RUN HISTORY (Stats/run-history.json)
# ==============================================================================

def generate_history():
    print("Generating run history fixtures...")

    valid_history = [
        {
            "MacroId": "77777777-7777-7777-7777-777777777771",
            "MacroName": "Production Build Runner",
            "RunCount": 24,
            "LastRunAt": FIXED_ISO,
            "LastActivation": "manual",
            "TotalDurationMs": 144000.0,
            "AverageJitterMs": 1.15,
            "MaxJitterMs": 3.8,
            "TotalDispatched": 1200,
            "TotalFailed": 0,
            "TotalUnconfirmed": 12
        },
        {
            "MacroId": "77777777-7777-7777-7777-777777777772",
            "MacroName": "Pixel Health Poller",
            "RunCount": 150,
            "LastRunAt": FIXED_ISO,
            "LastActivation": "auto-trigger",
            "TotalDurationMs": 7500.0,
            "AverageJitterMs": 0.45,
            "MaxJitterMs": 1.2,
            "TotalDispatched": 300,
            "TotalFailed": 2,
            "TotalUnconfirmed": 0
        }
    ]
    write_json("history/valid-run-history.json", valid_history)
    write_json("history/valid-run-history.expected.json", valid_history)

    # Corrupted run history (truncated / invalid syntax)
    corrupted_history = '[\n  {"MacroId": "77777777-7777-7777-7777-777777777771", "MacroName": "Incomplete"\n'
    write_text("history/corrupted-run-history.json", corrupted_history)


# ==============================================================================
# 8. RECOVERY & FOLDER TREES
# ==============================================================================

def generate_recovery():
    print("Generating recovery and folder tree fixtures...")

    # Leftover atomic tmp file
    tmp_content = '{"Name": "Incomplete atomic write", "Events": []}'
    write_text("recovery/leftover-atomic-tmp-file.macro.json.tmp", tmp_content)

    # Corrupted macro syntax error (should be caught by JsonException and left in place)
    syntax_error_content = '{\n  "SchemaVersion": 12,\n  "Name": "Damaged syntax,\n  "Events": [\n'
    write_text("recovery/corrupted-macro-syntax-error.macro.json", syntax_error_content)

    # Duplicate IDs: two files with identical ID
    dup_id = "88888888-8888-8888-8888-888888888888"
    dup1 = {
        "SchemaVersion": 12,
        "Id": dup_id,
        "Name": "Original Macro",
        "Folder": "",
        "ModifiedAt": FIXED_ISO,
        "Events": []
    }
    dup2 = {
        "SchemaVersion": 12,
        "Id": dup_id,
        "Name": "Original Macro",
        "Folder": "",
        "ModifiedAt": FIXED_ISO,
        "Events": []
    }
    write_json("recovery/duplicate-ids/macro-1.macro.json", dup1)
    write_json("recovery/duplicate-ids/macro-2-same-id.macro.json", dup2)
    write_json("recovery/duplicate-ids/duplicate-ids.expected.json", {
        "first": {"Id": dup_id, "Name": "Original Macro"},
        "second": {"Name": "Original Macro 2", "RequiresNewId": True}
    })

    # Folder Tree fixture
    tree_macros = [
        ("recovery/folder-tree/RootMacro.macro.json", {"SchemaVersion": 12, "Name": "RootMacro", "Folder": "", "Events": []}),
        ("recovery/folder-tree/Gaming/Combo.macro.json", {"SchemaVersion": 12, "Name": "Combo", "Folder": "Gaming", "Events": []}),
        ("recovery/folder-tree/Gaming/Shooter/Aim.macro.json", {"SchemaVersion": 12, "Name": "Aim", "Folder": "Gaming/Shooter", "Events": []}),
        ("recovery/folder-tree/Work/Email.macro.json", {"SchemaVersion": 12, "Name": "Email", "Folder": "Work", "Events": []}),
        ("recovery/folder-tree/Work/Daily/Report.macro.json", {"SchemaVersion": 12, "Name": "Report", "Folder": "Work/Daily", "Events": []})
    ]
    for rel, m in tree_macros:
        write_json(rel, m)

    write_json("recovery/folder-tree/folder-tree.expected.json", {
        "folders": ["Gaming", "Gaming/Shooter", "Work", "Work/Daily"],
        "macroCounts": {
            "": 5, # Root contains all 5
            "Gaming": 2,
            "Gaming/Shooter": 1,
            "Work": 2,
            "Work/Daily": 1
        }
    })


# ==============================================================================
# 9. CHECKSUMS, MANIFEST, AND VERIFICATION
# ==============================================================================

def generate_manifest_and_checksums():
    print("Computing SHA-256 hashes and creating manifest.json and checksums.json...")
    checksums = {}
    manifest_entries = []

    ignore_files = {"checksums.json", "manifest.json", "generate_fixtures.py", "verify_fixtures.py", "index.ts"}

    for root, dirs, files in os.walk(BASE_DIR):
        dirs.sort()
        for f in sorted(files):
            if f in ignore_files or f.endswith(".pyc"):
                continue
            full_path = os.path.join(root, f)
            rel_path = os.path.relpath(full_path, BASE_DIR).replace("\\", "/")
            with open(full_path, "rb") as fp:
                data = fp.read()
            sha256 = hashlib.sha256(data).hexdigest().lower()
            checksums[rel_path] = sha256

            category = rel_path.split("/")[0]
            manifest_entries.append({
                "path": rel_path,
                "category": category,
                "sha256": sha256,
                "sizeBytes": len(data)
            })

    write_json("checksums.json", checksums)

    manifest_data = {
        "version": 1,
        "createdAtUtc": FIXED_ISO,
        "fixtureCount": len(manifest_entries),
        "fixtures": manifest_entries
    }
    write_json("manifest.json", manifest_data)
    print(f"Recorded hashes for {len(checksums)} fixtures.")


def main():
    generate_schemas()
    generate_packages()
    generate_importers()
    generate_exporters()
    generate_dpi_cases()
    generate_settings()
    generate_history()
    generate_recovery()
    generate_manifest_and_checksums()
    print("All fixtures successfully generated!")

if __name__ == "__main__":
    main()
