# Security Policy

Macro Recorder is a desktop input-automation tool that installs low-level keyboard/mouse hooks and injects
input. Because of that surface, security reports are taken seriously.

## Supported versions

Only the latest release (1.x) and `main` receive fixes.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

- Preferred: use GitHub's private **"Report a vulnerability"** button under the repository's *Security* tab.
- Or email the maintainer at **kostia.ponomarenko@gmail.com** with the subject `MacroRecorder security`.

Include, where possible:

- affected version / commit,
- a description and impact,
- reproduction steps or a proof of concept,
- your environment (Windows version, elevated or not).

You can expect an acknowledgement within a few days. There is no bug-bounty program; fixes are made on a
best-effort basis and credited in the release notes unless you prefer to stay anonymous.

## Scope notes

- The application keeps all data locally and makes no network calls of its own; a report about data exfiltration
  should identify the exact code path.
- "Antivirus flags the unsigned build" is a known false positive, not a vulnerability — see
  [Security and false positives](README.md#security-and-false-positives) in the README.
