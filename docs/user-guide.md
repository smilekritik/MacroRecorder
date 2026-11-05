# Macro Recorder User Guide

Welcome to **Macro Recorder**, a precision automation and macro execution application for Windows 10 and 11 (x64). Macro Recorder allows you to record anything you do across keyboard, mouse, and gamepad, and replay it with millisecond-accurate timing.

---

## Table of Contents

1. [Installation & Setup](#1-installation--setup)
2. [Interface Overview](#2-interface-overview)
3. [Recording Input](#3-recording-input)
4. [Timeline Editor](#4-timeline-editor)
5. [Playback & Global Hotkeys](#5-playback--global-hotkeys)
6. [Input Delivery Modes](#6-input-delivery-modes)
7. [Pixel Triggers & Mid-Macro Waits](#7-pixel-triggers--mid-macro-waits)
8. [Gamepad Support (Xbox & DualShock 4)](#8-gamepad-support-xbox--dualshock-4)
9. [Full-Screen Bind Map](#9-full-screen-bind-map)
10. [On-Screen Overlays](#10-on-screen-overlays)
11. [Diagnostics & Performance Metrics](#11-diagnostics--performance-metrics)
12. [Library Management & Backups](#12-library-management--backups)
13. [Safety & Security](#13-safety--security)

---

## 1. Installation & Setup

Macro Recorder is distributed in two formats:
- **Setup archive (`MacroRecorder-Setup-1.0.0-x64.exe`)**: Extract it, then run `setup.cmd` from the extracted folder. Setup installs to `%LocalAppData%\Programs\MacroRecorder`, configures Start Menu and Desktop shortcuts, registers `.mrmacro` and `.macro.json` file associations, and registers with Windows Add/Remove Programs.
- **Portable Distribution (`MacroRecorder-1.0.0-win-x64-portable.zip`)**: Extract to any folder or USB drive. Placing a file named `portable.dat` in the folder forces all library macros and configuration to be stored in the local `Data/` subdirectory.

### System Requirements
- **OS**: Windows 10 (version 1809+) or Windows 11 64-bit (x64).
- **Dependencies**: None. The application is self-contained.

### First Launch
On your initial launch, Macro Recorder prompts for:
1. **Interface Language**: English or Russian (switchable in Settings at any time).
2. **Interface Theme**: Dark or Light theme.
3. Two disabled example macros are created in your library to demonstrate keyboard actions, comments, and pixel condition checks.

---

## 2. Interface Overview

The main window has these areas:
- **Library (left)**: Manage folders, and create, duplicate, search, and enable or disable macros.
- **Editor tab**: View and edit a macro's actions, timings, and comments. A new macro offers three ways to start: record it, build it step by step, or import a file.
- **Recording and playback tab**: Choose recording sources, delivery mode, target window, repeat count, and speed.
- **Diagnostics tab**: Review the timing of the last run.
- **Top Bar Controls**: Quick access to Record (`F7`), Stop (`F8`), Play/Pause (`F9`), Emergency Stop (`F10`), Bind Map (`F11`), and Diagnostics.

---

## 3. Recording Input

Click the **Record** button or press `F7` to begin capturing.

### Recording Sources
You can toggle which input streams to capture:
- **Keyboard**: Captures key down, key up, virtual-key codes (`vkCode`), and hardware scan codes.
- **Mouse Buttons**: Left, right, middle, and extra mouse buttons (X1 / X2).
- **Mouse Movement**: Captured using Windows **Raw Input**. This reads relative deltas directly from the mouse sensor, ensuring accurate capture in 3D and FPS games where the cursor is locked or recentered.
- **Mouse Wheel**: Vertical and horizontal scroll clicks.
- **Gamepad**: Captures buttons, triggers, and analog thumbstick movements from connected Xbox or DualShock 4 controllers.

### Recording Options
- **Countdown**: Configurable countdown (1–5 seconds) allowing you to switch focus to your target game or software.
- **Auto-Minimize**: Minimizes Macro Recorder when recording starts, and restores the window when you press Stop (`F8`).
- **Append vs. Overwrite**: If you record into an existing macro, you are prompted to:
  1. *Replace existing events* (start from scratch).
  2. *Insert after current selection* (shifts following events forward in time).
  3. *Append to end* of macro.
- **Self-Filtering**: Macro Recorder's own hotkeys (`F7`, `F8`, `F9`, `F10`, `F5`, `F11`) are filtered out and will never appear in your recording.

---

## 4. Timeline Editor

Every action on the timeline is represented as an editable row.

### Action Catalogue
| Group | Action | Details |
|---|---|---|
| **Keyboard** | Key Press | Combined press and release with hold duration. |
| | Key Down / Key Up | Discrete down and up actions for complex chords. |
| | Type Text | Types Unicode text via `WM_CHAR`. Independent of active keyboard layout. |
| **Mouse** | Click | Click left, right, middle, X1, or X2 button. |
| | Button Down / Up | Discrete mouse button press and release. |
| | Move | Move cursor to absolute coordinates or by relative deltas. |
| | Wheel | Scroll up, down, left, or right. |
| **Gamepad** | Button Down / Up | Gamepad button actions (A, B, X, Y, Bumpers, etc.). |
| | Analog Axis | Set position of analog thumbsticks or triggers. |
| **Conditions** | Pixel Trigger | Check pixel color at coordinates before continuing. |
| | Wait for Pixel Gone | Pause playback until color at coordinate disappears. |
| | Wait for Window | Block until a specific window title or class is detected. |
| | Wait for Key | Block until user taps a specific key. |
| **Flow & Timing**| Delay | Insert a static timeline pause in milliseconds. |
| | Run Macro | Call another macro by name (depth capped at 16, cycles prevented). |
| **Overlay & Notes**| Overlay Text | Display on-screen HUD text with duration and countdown. |
| | Comment Row | Non-executing visual separator note (consumes 0 time). |

### Editing Timings & Reordering
- **Absolute Time & Interval**: Changing an event's absolute time recalculates the interval from the preceding action, and vice versa.
- **Drag & Drop**: Reorder rows visually; timings update automatically.
- **Clipboard Operations**: Cut (`Ctrl+X`), Copy (`Ctrl+C`), and Paste (`Ctrl+V`) blocks of actions across macros. Pasted actions automatically shift subsequent actions forward.
- **Undo / Redo**: Multi-level undo stack (`Ctrl+Z` / `Ctrl+Y`) preserved per macro.

---

## 5. Playback & Global Hotkeys

Bind any macro to a global hotkey combination (e.g. `Ctrl+Shift+E`, mouse X1 button, or wheel click).

### Repeat Modes (What a Second Press Does)
1. **Run once to completion**: The macro plays through and stops. Subsequent presses while running are ignored.
2. **Run while held**: The macro plays continuously while you hold down the hotkey, and stops immediately when released.
3. **Press again to stop**: The first press starts playback; pressing the key again stops it immediately (includes a 50 ms anti-bounce guard).
4. **Press again to restart**: Pressing the shortcut while running aborts the current run and restarts from the beginning.

### Timing Adjustments
- **Playback Speed**: Adjust speed multiplier from `0.1x` (slow motion) up to `10.0x`.
- **Randomize Timings (Humanization)**: Add random timing offsets ($\pm N\,\text{ms}$) to intervals to emulate human variability.
- **Pass Shortcut Through**: Allows the triggering key press to also reach the active application window.
- **Target Window Scoping**: The shortcut only triggers the macro if the chosen target window is active; elsewhere, the key behaves normally.

---

## 6. Input Delivery Modes

Macro Recorder provides two delivery pipelines:

### 1. Standard Input (`SendInput`)
- Dispatches hardware-level synthetic keyboard and mouse events to whatever window currently has focus.
- **Best For**: 3D games, full-screen applications, anti-cheat titles, and web browsers.

### 2. Targeted Window Delivery (`ControlSend`)
- Injects `WM_KEYDOWN`, `WM_KEYUP`, `WM_CHAR`, and mouse messages directly into a target window handle (`HWND`).
- **Pure Background Delivery**: The window receives input without stealing focus, without activating, and while minimized or behind other windows.
- **Focused Child Routing**: Automatically resolves edit controls and input boxes inside classic Win32 applications (e.g. Notepad, legacy ERP tools).

> [!NOTE]
> Targeted background delivery works with classic Win32 applications. Games using DirectInput/Raw Input and Chromium/Electron apps (Discord, VS Code) read input only when focused; use Standard Input for these applications.

---

## 7. Pixel Triggers & Mid-Macro Waits

Turn any macro into an automated screen monitor using pixel detection.

- **First-Action Pixel Trigger**: Placing a Pixel Trigger as the very first action transforms the macro into a background monitor. When enabled, it requires no hotkey; it fires automatically whenever the screen coordinate matches the specified HEX color.
- **Screen Color Capture (`F5`)**: Hover the mouse over any pixel on any monitor and press `F5` to capture exact coordinates and HEX color without clicking.
- **Mid-Macro Waits**:
  - `Wait for Pixel Gone`: Pauses playback until a loading spinner, icon, or health bar color disappears.
  - Set an optional timeout in milliseconds; if the timeout expires, the macro continues and flags the step as unconfirmed in Diagnostics.

---

## 8. Gamepad Support (Xbox & DualShock 4)

- **Physical Capture**: Connect an Xbox controller (via XInput) or DualShock 4 (via Windows Gaming Input).
- **Virtual Playback**: Macro Recorder instantiates a virtual controller through the ViGEmBus kernel driver. Replay inputs as an Xbox 360 pad or DualShock 4 pad regardless of which device was used for recording.
- **Embedded Drivers**: The ViGEmBus and HidHide installers are bundled inside the app. If missing, Settings provides a one-click elevated installer.
- **HidHide Cloaking**: When enabled, the physical controller is hidden from games during macro execution so the game only detects the virtual controller, preventing double-input glitches.
- **Gamepad Tester**: Built-in visual diagnostic tool showing analog stick coordinates and button states live.

---

## 9. Full-Screen Bind Map

Press `F11` to toggle the full-screen visual keyboard and mouse map.

- Displays your keyboard layout, navigation keys, numpad, and mouse zones.
- **Color Legend**:
  - **Green**: Macro bound and enabled.
  - **Red**: Macro bound but currently disabled.
  - **Blue**: Application system shortcut.
  - **Yellow**: Secondary key completing a modifier combination.
  - **Pink**: Key shortcut already registered by another external program.
  - **Violet Outline**: Shortcut routed through low-level hooks (window-scoped or pass-through).
- Click any key to inspect bound macros, toggle activation, or jump directly to the macro in the timeline editor.

---

## 10. On-Screen Overlays

Click-through, focus-free overlays that provide heads-up telemetry during gaming or automation:
- **Status Card HUD**: Displays active macro name, current action index, elapsed time, dispatch jitter, and hook confirmation.
- **Custom Text HUD**: Shows messages configured via the *Overlay Text* action, complete with an optional visual countdown.
- **Customization**: Freely drag cards across monitors, scale from 25% to 200%, and adjust background opacity.

---

## 11. Diagnostics & Performance Metrics

Macro Recorder measures its own execution fidelity:
- **Dispatch Jitter**: The exact delta between the scheduled execution timestamp and the hardware `SendInput` call.
- **Hook Confirmation**: The time required for the low-level hook (`WH_KEYBOARD_LL`/`WH_MOUSE_LL`) to observe the injected event, verifying the Windows subsystem processed the input.
- **System Footprint**: Records peak CPU, GPU, and RAM utilization during each macro run to distinguish system lag from macro timing issues.
- **Export**: Export complete execution logs and timing distributions to CSV or JSON.

---

## 12. Library Management & Backups

- **Hierarchical Folders**: Organize macros in folders up to 8 levels deep. Folders in the UI mirror real physical directories on disk.
- **Atomic File Operations**: Macro updates are written to temporary files and atomically renamed, eliminating corruption risk during power loss.
- **Library Backup (`.mrbackup`)**: Export your entire macro collection, folder layout, and configuration into an encrypted, SHA-256 verified archive. Restore using *Merge* or *Clean Replace*.

---

## 13. Safety & Security

- **Emergency Stop (`F10`)**: Instantly aborts playback and triggers the Universal Input Release Guarantee, releasing any keys or mouse buttons currently held down.
- **Zero Anticheat Bypass**: Macro Recorder operates strictly in user-space and does not attempt to bypass kernel anti-cheat systems.
- **Antivirus False Positives**: Because Macro Recorder installs low-level hooks (`WH_KEYBOARD_LL`, `WH_MOUSE_LL`) and injects input via `SendInput`, heuristic scanners may flag unsigned binaries. Release archives include SHA-256 manifests so you can verify binary integrity.
