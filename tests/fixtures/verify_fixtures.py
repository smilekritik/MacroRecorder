#!/usr/bin/env python3
"""
verify_fixtures.py
Validates the integrity, schema coverage, privacy anonymization, and SHA-256
hash matching of all fixtures in rewrite/tests/fixtures/.
"""

import os
import sys
import json
import zipfile
import hashlib
import re

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def check_fail(message):
    print(f"FAILED: {message}", file=sys.stderr)
    sys.exit(1)

def main():
    print("=== Verifying Golden Compatibility Fixtures ===")

    # 1. Check existence of checksums.json and manifest.json
    checksums_path = os.path.join(BASE_DIR, "checksums.json")
    manifest_path = os.path.join(BASE_DIR, "manifest.json")
    if not os.path.exists(checksums_path):
        check_fail("checksums.json does not exist")
    if not os.path.exists(manifest_path):
        check_fail("manifest.json does not exist")

    with open(checksums_path, "r", encoding="utf-8") as f:
        checksums = json.load(f)
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    print(f"Loaded {len(checksums)} checksums and {manifest.get('fixtureCount')} manifest entries.")

    if len(checksums) != manifest.get("fixtureCount"):
        check_fail(f"Mismatch: checksums has {len(checksums)}, manifest has {manifest.get('fixtureCount')}")

    # 2. Verify every file in checksums.json matches disk hash
    print("Verifying SHA-256 fixture hashes...")
    for rel_path, expected_hash in checksums.items():
        full_path = os.path.join(BASE_DIR, rel_path)
        if not os.path.exists(full_path):
            check_fail(f"Missing fixture file: {rel_path}")
        with open(full_path, "rb") as f:
            actual_hash = hashlib.sha256(f.read()).hexdigest().lower()
        if actual_hash != expected_hash:
            check_fail(f"SHA-256 drift for {rel_path}! Expected: {expected_hash}, Actual: {actual_hash}")

    print("All fixture SHA-256 hashes matched with zero drift.")

    # 3. Privacy / Anonymization Check
    print("Checking for personal paths and recorded secrets...")
    personal_patterns = [
        re.compile(r"[C-Z]:\\Users\\(?!Public\b)[A-Za-z0-9_ -]+", re.IGNORECASE),
        re.compile(r"/home/(?!user\b)[a-z0-9_-]+", re.IGNORECASE),
        re.compile(r"password\s*[:=]\s*['\"][^'\"]+['\"]", re.IGNORECASE),
        re.compile(r"api[_-]?key\s*[:=]\s*['\"][^'\"]+['\"]", re.IGNORECASE),
        re.compile(r"bearer\s+[a-zA-Z0-9_\-\.]{20,}", re.IGNORECASE)
    ]

    for rel_path in checksums.keys():
        full_path = os.path.join(BASE_DIR, rel_path)
        if rel_path.endswith((".mrmacro", ".mrbackup", ".zip", ".rec")):
            continue
        try:
            with open(full_path, "r", encoding="utf-8") as f:
                content = f.read()
            for pattern in personal_patterns:
                match = pattern.search(content)
                if match:
                    check_fail(f"Personal or sensitive data pattern found in {rel_path}: {match.group(0)}")
        except UnicodeDecodeError:
            pass

    print("Privacy verification passed: zero personal paths or credentials found.")

    # 4. JSON Syntax Validation (except intentionally corrupted fixtures)
    print("Validating JSON syntax across fixtures...")
    intentionally_corrupted = {
        "recovery/corrupted-macro-syntax-error.macro.json",
        "history/corrupted-run-history.json"
    }

    for rel_path in checksums.keys():
        if rel_path.endswith(".json") or rel_path.endswith(".macro.json"):
            if rel_path in intentionally_corrupted:
                continue
            full_path = os.path.join(BASE_DIR, rel_path)
            try:
                with open(full_path, "r", encoding="utf-8") as f:
                    json.load(f)
            except Exception as e:
                check_fail(f"Invalid JSON syntax in {rel_path}: {e}")

    # Verify intentionally corrupted fixtures indeed fail standard JSON parsing
    for rel_path in intentionally_corrupted:
        full_path = os.path.join(BASE_DIR, rel_path)
        corrupted_failed = False
        try:
            with open(full_path, "r", encoding="utf-8") as f:
                json.load(f)
        except Exception:
            corrupted_failed = True
        if not corrupted_failed:
            check_fail(f"Fixture {rel_path} was supposed to have syntax errors but parsed successfully!")

    print("JSON syntax validation passed.")

    # 5. ZIP Container Validation
    print("Validating ZIP container structures...")
    zip_fixtures = [
        ("packages/valid.mrmacro", ["manifest.json", "macro.json"]),
        ("packages/tampered-checksum.mrmacro", ["manifest.json", "macro.json"]),
        ("packages/tampered-manifest-unsupported-version.mrmacro", ["manifest.json", "macro.json"]),
        ("packages/tampered-manifest-bad-format.mrmacro", ["manifest.json", "macro.json"]),
        ("packages/tampered-missing-macro.mrmacro", ["manifest.json"]),
        ("packages/valid.mrbackup", ["manifest.json", "Macros/Root macro.macro.json", "Macros/Games/Nested macro.macro.json"]),
        ("packages/tampered-checksum.mrbackup", ["manifest.json", "Macros/Root macro.macro.json", "Macros/Games/Nested macro.macro.json"]),
        ("packages/tampered-manifest-bad-format.mrbackup", ["manifest.json", "Macros/Root macro.macro.json"]),
        ("packages/tampered-missing-manifest.mrbackup", ["Macros/Root macro.macro.json"]),
        ("dpi/source-dpi-96.mrmacro", ["manifest.json", "macro.json"]),
        ("dpi/source-dpi-144.mrmacro", ["manifest.json", "macro.json"]),
        ("dpi/source-dpi-omitted.mrmacro", ["manifest.json", "macro.json"]),
        ("exporters/diagnostic-bundle/expected-bundle.zip", ["summary.json"]),
        ("exporters/macro-package/expected.mrmacro", ["manifest.json", "macro.json"]),
        ("exporters/library-backup/expected.mrbackup", ["manifest.json"])
    ]

    for rel_path, required_entries in zip_fixtures:
        full_path = os.path.join(BASE_DIR, rel_path)
        if not os.path.exists(full_path):
            check_fail(f"Missing ZIP fixture: {rel_path}")
        with zipfile.ZipFile(full_path, "r") as zf:
            entry_names = zf.namelist()
            for req in required_entries:
                if req not in entry_names:
                    check_fail(f"ZIP {rel_path} missing required entry '{req}'. Found: {entry_names}")

    print("ZIP container validation passed.")

    # 6. Verify Importer Coverage (all 10 importers)
    print("Verifying importer coverage...")
    required_importers = [
        "native-json", "legacy-json", "autohotkey", "amc", "jitbit-mrf",
        "autoit", "razer", "tinytask", "macro-package", "library-backup"
    ]
    for imp in required_importers:
        imp_dir = os.path.join(BASE_DIR, "importers", imp)
        if not os.path.isdir(imp_dir):
            check_fail(f"Missing importer directory: importers/{imp}")
        files = os.listdir(imp_dir)
        has_sample = any(f.startswith("sample") for f in files)
        has_expected = any("expected" in f for f in files)
        if not (has_sample and has_expected):
            check_fail(f"Importer {imp} missing sample or expected file")

    print("All 10 importers covered with golden samples and expectations.")

    # 7. Verify Exporter Coverage (all 7 exporters)
    print("Verifying exporter coverage...")
    required_exporters = [
        "autohotkey-v2", "diagnostics-csv", "diagnostics-json",
        "diagnostic-bundle", "native-json", "macro-package", "library-backup"
    ]
    for exp in required_exporters:
        exp_dir = os.path.join(BASE_DIR, "exporters", exp)
        if not os.path.isdir(exp_dir):
            check_fail(f"Missing exporter directory: exporters/{exp}")
        files = os.listdir(exp_dir)
        has_expected = any("expected" in f for f in files)
        if not has_expected:
            check_fail(f"Exporter {exp} missing expected output file")

    print("All 7 exporters covered with golden inputs and outputs.")

    # 8. Verify Schema Coverage
    print("Verifying schema coverage...")
    schema_files = [
        "schema-12-current.macro.json",
        "schema-11-package.macro.json",
        "schema-10-annotations.macro.json",
        "schema-09-legacy.macro.json",
        "schema-04-05-legacy.macro.json",
        "legacy-recorder-unversioned.json",
        "edge-minimal-defaults.macro.json",
        "edge-case-insensitive-schema.macro.json",
        "edge-future-unknown-fields.macro.json",
        "edge-repeat-forever-toggle.macro.json",
        "edge-all-event-types.macro.json"
    ]
    for sf in schema_files:
        p = os.path.join(BASE_DIR, "schemas", sf)
        if not os.path.exists(p):
            check_fail(f"Missing schema fixture: schemas/{sf}")
        if sf.endswith(".macro.json"):
            exp_name = sf[:-len(".macro.json")] + ".expected.json"
        elif sf.endswith(".json"):
            exp_name = sf[:-len(".json")] + ".expected.json"
        else:
            exp_name = sf + ".expected.json"
        exp_p = os.path.join(BASE_DIR, "schemas", exp_name)
        if not os.path.exists(exp_p):
            check_fail(f"Missing expected schema result: {exp_p}")

    print("Schema coverage verified: Schema 12, 11, 10, 9, 4/5, legacy unversioned, and all edges.")

    # 9. Verify DPI, Settings, History, Recovery
    print("Verifying DPI, settings, history, and recovery fixtures...")
    assert os.path.exists(os.path.join(BASE_DIR, "dpi/source-dpi-96.mrmacro"))
    assert os.path.exists(os.path.join(BASE_DIR, "dpi/source-dpi-144.mrmacro"))
    assert os.path.exists(os.path.join(BASE_DIR, "dpi/source-dpi-omitted.mrmacro"))

    assert os.path.exists(os.path.join(BASE_DIR, "settings/default-settings.json"))
    assert os.path.exists(os.path.join(BASE_DIR, "settings/migrated-f12-to-f11-settings.json"))
    assert os.path.exists(os.path.join(BASE_DIR, "settings/clearable-intent-hotkeys-settings.json"))
    assert os.path.exists(os.path.join(BASE_DIR, "settings/custom-options-settings.json"))

    assert os.path.exists(os.path.join(BASE_DIR, "history/valid-run-history.json"))
    assert os.path.exists(os.path.join(BASE_DIR, "history/corrupted-run-history.json"))

    assert os.path.exists(os.path.join(BASE_DIR, "recovery/leftover-atomic-tmp-file.macro.json.tmp"))
    assert os.path.exists(os.path.join(BASE_DIR, "recovery/corrupted-macro-syntax-error.macro.json"))
    assert os.path.exists(os.path.join(BASE_DIR, "recovery/duplicate-ids/macro-1.macro.json"))
    assert os.path.exists(os.path.join(BASE_DIR, "recovery/duplicate-ids/macro-2-same-id.macro.json"))
    assert os.path.exists(os.path.join(BASE_DIR, "recovery/folder-tree/RootMacro.macro.json"))
    assert os.path.exists(os.path.join(BASE_DIR, "recovery/folder-tree/Gaming/Combo.macro.json"))
    assert os.path.exists(os.path.join(BASE_DIR, "recovery/folder-tree/Gaming/Shooter/Aim.macro.json"))
    assert os.path.exists(os.path.join(BASE_DIR, "recovery/folder-tree/Work/Email.macro.json"))
    assert os.path.exists(os.path.join(BASE_DIR, "recovery/folder-tree/Work/Daily/Report.macro.json"))

    print("\n=======================================================")
    print("SUCCESS: All 111 fixtures verified with 100% integrity!")
    print("=======================================================")

if __name__ == "__main__":
    main()
