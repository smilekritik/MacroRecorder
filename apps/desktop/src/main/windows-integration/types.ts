/**
 * Types and contracts for Windows system integrations:
 * Autostart (Registry Run), File Associations (.mrmacro, .mrbackup),
 * and Gamepad Driver extraction/elevation flow.
 */

export interface AutostartOptions {
  readonly keyPath?: string | undefined;
  readonly valueName?: string | undefined;
  readonly executablePath?: string | undefined;
}

export type GamepadDriverType = 'ViGEmBus' | 'HidHide';

export interface DriverInfo {
  readonly type: GamepadDriverType;
  readonly fileName: string;
  readonly tempFileName: string;
  readonly requiredFor: 'output' | 'hiding';
}

export interface DriverElevationResult {
  readonly success: boolean;
  readonly processStarted: boolean;
  readonly elevated: boolean;
  readonly error?: string | undefined;
}

export interface FileAssociationEntry {
  readonly extension: string;
  readonly progId: string;
  readonly description: string;
  readonly contentType: string;
}
