/**
 * Window and Process Metadata Adapter.
 * Inspects open windows, resolves foreground HWNDs, verifies UIPI elevation boundaries,
 * and provides compatibility diagnostics for background input delivery.
 */

import type { IWindowTargetingAdapter } from '../types.js';
import type { OpenWindowInfo, WindowInspectionSnapshot } from '../../ipc/types.js';

export class NativeWindowAdapter implements IWindowTargetingAdapter {
  private nativeModule: any = null;
  private nativeModuleLoaded = false;

  constructor(nativeModule?: unknown) {
    if (nativeModule) {
      this.nativeModule = nativeModule;
      this.nativeModuleLoaded = true;
    } else {
      this.tryLoadNative();
    }
  }

  private tryLoadNative(): void {
    if (this.nativeModuleLoaded) return;
    try {
      const addon = (process as unknown as { addon?: unknown }).addon;
      if (addon) {
        this.nativeModule = addon;
        this.nativeModuleLoaded = true;
      }
    } catch {
      // Best-effort
    }
  }

  public getOpenWindows(excludedProcessId?: number): OpenWindowInfo[] {
    if (!this.nativeModule?.getOpenWindows) {
      throw new Error('Native window enumeration is unavailable.');
    }
    const windows = this.nativeModule.getOpenWindows(excludedProcessId);
    if (!Array.isArray(windows)) {
      throw new Error('Native window enumeration returned an invalid result.');
    }
    return windows;
  }

  public inspectWindow(
    followMouse: boolean,
    selfHandle?: number | undefined,
    ownerHandle?: number | undefined,
  ): WindowInspectionSnapshot {
    if (!this.nativeModule?.inspectWindow) {
      throw new Error('Native window inspection is unavailable.');
    }
    const snapshot = this.nativeModule.inspectWindow(followMouse, selfHandle, ownerHandle) as Record<string, unknown>;
    const handle = typeof snapshot['handle'] === 'number'
      ? snapshot['handle']
      : typeof snapshot['windowHandle'] === 'number'
        ? snapshot['windowHandle']
        : 0;
    return {
      handle,
      title: String(snapshot['title'] ?? ''),
      processName: String(snapshot['processName'] ?? ''),
      x: Number(snapshot['x'] ?? snapshot['windowX'] ?? 0),
      y: Number(snapshot['y'] ?? snapshot['windowY'] ?? 0),
      width: Number(snapshot['width'] ?? snapshot['windowWidth'] ?? 0),
      height: Number(snapshot['height'] ?? snapshot['windowHeight'] ?? 0),
    };
  }

  public getForegroundWindow(): {
    handle: number;
    title: string;
    processName: string;
    processId: number;
  } | null {
    if (this.nativeModule?.getForegroundWindow) {
      try {
        return this.nativeModule.getForegroundWindow();
      } catch {
        return null;
      }
    }
    return null;
  }

  public activateWindow(handle: number): boolean {
    if (this.nativeModule?.activateWindow) {
      try {
        return Boolean(this.nativeModule.activateWindow(handle));
      } catch {
        return false;
      }
    }
    return false;
  }

  public activateWindowByName(processName: string, windowTitle: string): boolean {
    if (this.nativeModule?.activateWindowByName) {
      try {
        return Boolean(this.nativeModule.activateWindowByName(processName, windowTitle));
      } catch {
        return false;
      }
    }
    return false;
  }

  public checkWindowIntegrity(hwnd: number): {
    canInject: boolean;
    targetIsHigher: boolean;
    currentIntegrity: number;
    targetIntegrity?: number | undefined;
    warningMessage?: string | undefined;
  } {
    if (!this.nativeModule?.checkWindowIntegrity) {
      throw new Error('Native window integrity inspection is unavailable.');
    }
    return this.nativeModule.checkWindowIntegrity(hwnd);
  }

  /**
   * Detects elevated UIPI target boundaries and Chromium processes.
   */
  public isChromiumOrElevated(hwnd: number): {
    isChromium: boolean;
    isElevated: boolean;
    warning?: string | undefined;
  } {
    const integrity = this.checkWindowIntegrity(hwnd);
    let isChromium = false;

    const windows = this.getOpenWindows();
    const target = windows.find((w) => w.handle === hwnd);
    if (target) {
      const lowerProc = target.processName.toLowerCase();
      isChromium =
        lowerProc.includes('chrome') ||
        lowerProc.includes('msedge') ||
        lowerProc.includes('brave') ||
        lowerProc.includes('electron');
    }

    let warning: string | undefined;
    if (integrity.targetIsHigher) {
      warning = 'Target window has elevated administrator privileges (UIPI restriction).';
    } else if (isChromium) {
      warning = 'Chromium-based applications may ignore background posted messages; SendInput is recommended.';
    }

    return {
      isChromium,
      isElevated: integrity.targetIsHigher,
      ...(warning ? { warning } : {}),
    };
  }
}

/**
 * Deterministic Fake Window Adapter for Testing.
 */
export class FakeWindowAdapter implements IWindowTargetingAdapter {
  public openWindows: OpenWindowInfo[] = [];
  public currentForeground: {
    handle: number;
    title: string;
    processName: string;
    processId: number;
  } | null = null;
  public activatedHandles: number[] = [];
  public higherIntegrityHandles = new Set<number>();
  public chromiumHandles = new Set<number>();

  public getOpenWindows(_excludedProcessId?: number): OpenWindowInfo[] {
    return this.openWindows;
  }

  public inspectWindow(
    _followMouse: boolean,
    _selfHandle?: number | undefined,
    _ownerHandle?: number | undefined,
  ): WindowInspectionSnapshot {
    const fg = this.currentForeground;
    return {
      handle: fg?.handle ?? 12345,
      title: fg?.title ?? 'Test Window',
      processName: fg?.processName ?? 'test.exe',
      x: 100,
      y: 100,
      width: 800,
      height: 600,
    };
  }

  public getForegroundWindow(): {
    handle: number;
    title: string;
    processName: string;
    processId: number;
  } | null {
    return this.currentForeground;
  }

  public activateWindow(handle: number): boolean {
    this.activatedHandles.push(handle);
    const win = this.openWindows.find((w) => w.handle === handle);
    if (win) {
      this.currentForeground = { ...win };
      return true;
    }
    return false;
  }

  public activateWindowByName(processName: string, windowTitle: string): boolean {
    const win = this.openWindows.find(
      (w) =>
        w.processName.toLowerCase() === processName.toLowerCase() &&
        w.title.toLowerCase().includes(windowTitle.toLowerCase()),
    );
    if (win) {
      this.activatedHandles.push(win.handle);
      this.currentForeground = { ...win };
      return true;
    }
    return false;
  }

  public checkWindowIntegrity(hwnd: number): {
    canInject: boolean;
    targetIsHigher: boolean;
    currentIntegrity: number;
    targetIntegrity?: number | undefined;
    warningMessage?: string | undefined;
  } {
    const isHigher = this.higherIntegrityHandles.has(hwnd);
    return {
      canInject: !isHigher,
      targetIsHigher: isHigher,
      currentIntegrity: 0x2000,
      targetIntegrity: isHigher ? 0x3000 : 0x2000,
      warningMessage: isHigher ? 'Target window has elevated administrator privileges.' : undefined,
    };
  }

  public isChromiumOrElevated(hwnd: number): {
    isChromium: boolean;
    isElevated: boolean;
    warning?: string | undefined;
  } {
    const isElevated = this.higherIntegrityHandles.has(hwnd);
    const isChromium = this.chromiumHandles.has(hwnd);
    let warning: string | undefined;
    if (isElevated) {
      warning = 'Target window has elevated administrator privileges (UIPI restriction).';
    } else if (isChromium) {
      warning = 'Chromium-based applications may ignore background posted messages; SendInput is recommended.';
    }
    return {
      isChromium,
      isElevated,
      ...(warning ? { warning } : {}),
    };
  }
}
