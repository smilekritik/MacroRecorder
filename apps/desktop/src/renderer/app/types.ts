/**
 * @macro-recorder/desktop - Renderer Application Types & State Contracts
 * Multi-window routing, cross-window sync messages, tabs, and layout interfaces.
 */

import type { MacroDefinition } from '../../../../../packages/contracts/src/index.js';
import type { WindowId } from '../../main/windows/types.js';

export type { WindowId };

export type MainWindowTab = 'editor' | 'playback' | 'record' | 'diagnostics';

export interface RouteParams {
  readonly windowId: WindowId | string;
  readonly tab?: MainWindowTab | undefined;
  readonly macroId?: string | undefined;
  readonly section?: string | undefined;
  readonly [key: string]: unknown;
}

export type ThemeMode = 'dark' | 'light' | 'system';
export type LanguageCode = 'en' | 'ru';

export interface ThemeSyncPayload {
  readonly theme: ThemeMode;
  readonly timestamp: number;
}

export interface LanguageSyncPayload {
  readonly language: LanguageCode;
  readonly timestamp: number;
}

export interface LibrarySyncPayload {
  readonly action: 'loaded' | 'saved' | 'deleted' | 'restored' | 'moved';
  readonly macroId?: string | undefined;
  readonly timestamp: number;
}

export interface MacroStateSyncPayload {
  readonly engineState: string;
  readonly activeMacroId?: string | undefined;
  readonly activeMacroName?: string | undefined;
  readonly timestamp: number;
}

export interface HotkeysSyncPayload {
  readonly hotkeys: ReadonlyArray<{ readonly id: number; readonly key: string }>;
  readonly timestamp: number;
}

export interface UnsavedChangesState {
  readonly isDirty: boolean;
  readonly macroId: string | null;
  readonly macroName: string | null;
  readonly originalMacro: MacroDefinition | null;
  readonly pendingNavigation?: (() => void) | undefined;
}
