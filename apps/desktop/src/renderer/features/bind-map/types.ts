/**
 * @macro-recorder/desktop - Bind Map Feature Types
 */

import type {
  HotkeyBinding,
  MacroDefinition,
  MouseButton,
  WheelDirection,
} from '../../../../../../packages/contracts/src/index.js';
import type { AppPreferences } from '../../../../../../packages/contracts/src/preferences/preferences.js';
import type {
  BindMapPriority,
  BindMapTileRoleInfo,
  BindMapTileStyle,
  ResolvedTheme,
} from '../../design-system/types.js';

export type KeyRole = 'none' | 'primary' | 'secondary';

export type SystemCommandTag =
  | 'start'
  | 'stop'
  | 'pause'
  | 'emergency'
  | 'pixel'
  | 'bindmap';

export interface SystemCommand {
  readonly tag: SystemCommandTag;
  readonly name: string;
  readonly binding: HotkeyBinding;
  readonly display: string;
}

export interface LayoutCap {
  readonly label: string;
  readonly vk: number;
  readonly width: number;
  readonly height: number;
  readonly isSpacer: boolean;
}

export interface BindMapTile {
  readonly id: string;
  readonly label: string;
  readonly title: string;
  readonly virtualKey: number;
  readonly mouseButton: MouseButton;
  readonly wheel: WheelDirection;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly geometry?: string | undefined;
  readonly labelX?: number | undefined;
  readonly labelY?: number | undefined;
  readonly isMouseZone?: boolean | undefined;
  readonly primary: readonly MacroDefinition[];
  readonly secondary: readonly MacroDefinition[];
  readonly systemPrimary: readonly SystemCommand[];
  readonly systemSecondary: readonly SystemCommand[];
  readonly conflicts: readonly string[];
  readonly isInteractive: boolean;
  readonly hasBinds: boolean;
  readonly allMacros: readonly MacroDefinition[];
  readonly allSystem: readonly SystemCommand[];
  readonly roleInfo: BindMapTileRoleInfo;
  readonly style: BindMapTileStyle;
  readonly tooltipText: string;
}

export interface BindMapWindowProps {
  readonly isOpen?: boolean | undefined;
  readonly macros?: readonly MacroDefinition[] | undefined;
  readonly preferences?: AppPreferences | undefined;
  readonly closeHotkey?: string | undefined;
  readonly onClose?: (() => void) | undefined;
  readonly onToggleMacro?: ((macro: MacroDefinition) => Promise<void> | void) | undefined;
  readonly onDeleteMacro?: ((macro: MacroDefinition) => Promise<void> | void) | undefined;
  readonly onOpenSettings?: ((tag: string) => void) | undefined;
  readonly probeAvailability?: ((bindings: readonly HotkeyBinding[]) => boolean[]) | undefined;
  readonly theme?: ResolvedTheme | undefined;
  readonly className?: string | undefined;
}

/**
 * Window specifications matching, and Rule 33.
 */
export const BIND_MAP_WINDOW_SPEC = {
  id: 'BindMapWindow',
  title: 'Bind map — Macro Recorder',
  width: 1480,
  height: 900,
  minWidth: 1000,
  minHeight: 620,
  topmost: true,
  modal: false,
  showInTaskbar: false,
  owner: null,
} as const;

export type {
  BindMapPriority,
  BindMapTileRoleInfo,
  BindMapTileStyle,
  ResolvedTheme,
  HotkeyBinding,
  MacroDefinition,
  MouseButton,
  WheelDirection,
  AppPreferences,
};
