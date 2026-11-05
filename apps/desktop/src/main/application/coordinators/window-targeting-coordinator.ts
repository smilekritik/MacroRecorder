/**
 * Window Targeting Coordinator.
 * Manages window inspection, foreground detection, UIPI elevation boundaries,
 * Chromium compatibility diagnostics, and per-window held input tracking & release.
 */

import type { IInputInjectorAdapter, IWindowTargetingAdapter } from '../types.js';
import type { OpenWindowInfo, WindowInspectionSnapshot } from '../../ipc/types.js';

export interface WindowTargetingOptions {
  readonly windowAdapter: IWindowTargetingAdapter;
  readonly injectorAdapter: IInputInjectorAdapter;
}

export class WindowTargetingCoordinator {
  private readonly windowAdapter: IWindowTargetingAdapter;
  private readonly injectorAdapter: IInputInjectorAdapter;

  constructor(
    optionsOrWindow: WindowTargetingOptions | IWindowTargetingAdapter,
    injectorAdapter?: IInputInjectorAdapter,
  ) {
    if ('windowAdapter' in optionsOrWindow) {
      this.windowAdapter = optionsOrWindow.windowAdapter;
      this.injectorAdapter = optionsOrWindow.injectorAdapter;
    } else {
      this.windowAdapter = optionsOrWindow;
      this.injectorAdapter = injectorAdapter!;
    }
  }

  public getOpenWindows(excludedProcessId?: number): OpenWindowInfo[] {
    return this.windowAdapter.getOpenWindows(excludedProcessId);
  }

  public inspectWindow(
    followMouseOrReq:
      | boolean
      | {
          followMouse: boolean;
          selfHandle?: number | undefined;
          ownerHandle?: number | undefined;
        },
    selfHandle?: number | undefined,
    ownerHandle?: number | undefined,
  ): WindowInspectionSnapshot {
    if (typeof followMouseOrReq === 'object' && followMouseOrReq !== null) {
      return this.windowAdapter.inspectWindow(
        followMouseOrReq.followMouse,
        followMouseOrReq.selfHandle,
        followMouseOrReq.ownerHandle,
      );
    }
    return this.windowAdapter.inspectWindow(followMouseOrReq, selfHandle, ownerHandle);
  }

  public getForegroundWindow() {
    return this.windowAdapter.getForegroundWindow();
  }

  public activateWindow(handleOrName: number | string, windowTitle?: string): boolean {
    if (typeof handleOrName === 'string') {
      return this.windowAdapter.activateWindowByName(handleOrName, windowTitle ?? '');
    }
    return this.windowAdapter.activateWindow(handleOrName);
  }

  public activateWindowByName(processName: string, windowTitle: string): boolean {
    return this.windowAdapter.activateWindowByName(processName, windowTitle);
  }

  /**
   * Checks whether a targeted window has elevated administrator privileges.
   */
  public checkWindowIntegrity(hwnd: number): {
    canInject: boolean;
    targetIsHigher: boolean;
    currentIntegrity: number;
    targetIntegrity?: number | undefined;
    warningMessage?: string | undefined;
  } {
    return this.windowAdapter.checkWindowIntegrity(hwnd);
  }

  /**
   * Checks whether a targeted window is Chromium-based or elevated.
   */
  public isChromiumOrElevated(hwnd: number): {
    isChromium: boolean;
    isElevated: boolean;
    warning?: string | undefined;
  } {
    return this.windowAdapter.isChromiumOrElevated(hwnd);
  }

  /**
   * Checks whether a targeted window has elevated administrator privileges
   * or runs on Chromium, emitting user-facing compatibility warnings.
   */
  public checkTargetCompatibility(hwnd: number): {
    canTarget: boolean;
    isElevated: boolean;
    isChromium: boolean;
    warning?: string | undefined;
  } {
    const status = this.windowAdapter.isChromiumOrElevated(hwnd);
    return {
      canTarget: !status.isElevated,
      isElevated: status.isElevated,
      isChromium: status.isChromium,
      warning: status.warning,
    };
  }

  /**
   * Releases all held keyboard and mouse inputs targeting a specific window handle.
   */
  public releaseWindowHeldInputs(hwnd: number): void {
    this.injectorAdapter.releaseAll(hwnd);
  }
}
