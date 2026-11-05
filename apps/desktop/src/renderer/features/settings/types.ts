/**
 * @macro-recorder/desktop - Settings Feature Types
 */

import type { AppPreferences } from '../../../../../../packages/contracts/src/preferences/preferences.js';
import type { HotkeyBinding } from '../../../../../../packages/contracts/src/domain/hotkey.js';
import type { MacroRecorderApi } from '../../hooks/useApi.js';

export type SettingsSectionId =
  | 'interface'
  | 'startup'
  | 'storage'
  | 'controls'
  | 'overlay'
  | 'debugger';

export interface SettingsSectionItem {
  readonly id: SettingsSectionId;
  readonly title: string;
}

export type GlobalHotkeyTag =
  | 'start'
  | 'stop'
  | 'pause'
  | 'emergency'
  | 'pixel'
  | 'bindmap';

export interface SettingsWindowProps {
  readonly isOpen?: boolean | undefined;
  readonly onClose?: (() => void) | undefined;
  readonly focusHotkeyTag?: string | undefined;
  readonly macroHotkeys?: readonly HotkeyBinding[] | undefined;
  readonly probeAvailability?: ((bindings: readonly HotkeyBinding[]) => boolean[]) | undefined;
  readonly initialSection?: SettingsSectionId | undefined;
  readonly apiOverride?: MacroRecorderApi | undefined;
  readonly onLibraryRestored?: (() => void) | undefined;
  readonly onLibraryPathChanged?: ((newPath: string) => void) | undefined;
  readonly onResetRequested?: (() => void) | undefined;
}

export interface HotkeyFormState {
  readonly start: HotkeyBinding;
  readonly stop: HotkeyBinding;
  readonly pause: HotkeyBinding;
  readonly emergency: HotkeyBinding;
  readonly pixel: HotkeyBinding;
  readonly bindmap: HotkeyBinding;
}

export type { AppPreferences, HotkeyBinding };
