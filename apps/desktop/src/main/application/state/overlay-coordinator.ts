/**
 * Overlay State Machine and Placement Coordinator.
 * Resolves per-macro overlay card overrides against global preferences,
 * manages text card countdowns, and broadcasts overlay card states.
 */

import type { IWindowOrchestratorAdapter, OverlayCardOverride, OverlayCardState } from '../types.js';
import type { AppPreferences, EngineState, MacroDefinition, OverlayPlacement } from '../../ipc/types.js';

export class OverlayCoordinator {
  private readonly windowOrchestrator: IWindowOrchestratorAdapter;
  private readonly macroOverlayStates = new Map<string, OverlayCardState>();
  private activeCountdownTimer: NodeJS.Timeout | null = null;
  private currentPreferences: AppPreferences = {};

  constructor(windowOrchestrator: IWindowOrchestratorAdapter) {
    this.windowOrchestrator = windowOrchestrator;
  }

  public updatePreferences(preferences: AppPreferences): void {
    this.currentPreferences = preferences;
  }

  /**
   * Resolves whether an overlay card should be shown by checking the per-macro override
   * before falling back to application preferences.
   */
  public resolveCardVisibility(
    macroOverride: OverlayCardOverride | undefined,
    globalSettingEnabled: boolean,
  ): boolean {
    if (macroOverride === 'ForceShow') {
      return true;
    }
    if (macroOverride === 'ForceHide') {
      return false;
    }
    // 'Inherit' or undefined falls back to global setting
    return globalSettingEnabled;
  }

  /**
   * Updates overlay status for an active macro.
   */
  public updateMacroOverlay(
    macro: MacroDefinition,
    state: EngineState,
    activeActionText?: string,
    _speed = 1.0,
  ): OverlayCardState {
    const showInfoGlobal = Boolean(this.currentPreferences['showMacroInformation'] ?? true);
    const macroOverride = macro['infoCardOverride'] as OverlayCardOverride | undefined;
    const isVisible = this.resolveCardVisibility(macroOverride, showInfoGlobal);

    const infoX = typeof this.currentPreferences['overlayInfoX'] === 'number'
      ? Number(this.currentPreferences['overlayInfoX'])
      : 1.0;
    const infoY = typeof this.currentPreferences['overlayInfoY'] === 'number'
      ? Number(this.currentPreferences['overlayInfoY'])
      : 0.0;
    const scalePercent = typeof this.currentPreferences['overlayScalePercent'] === 'number'
      ? Number(this.currentPreferences['overlayScalePercent'])
      : 100;
    const transparencyPercent = typeof this.currentPreferences['overlayInfoTransparencyPercent'] === 'number'
      ? Number(this.currentPreferences['overlayInfoTransparencyPercent'])
      : 0;

    const overlayState: OverlayCardState = {
      macroId: macro.id,
      macroName: macro.name,
      state,
      activeActionText,
      visible: isVisible && state !== 'Idle',
      infoX,
      infoY,
      scalePercent,
      transparencyPercent,
    };

    this.macroOverlayStates.set(macro.id, overlayState);
    this.windowOrchestrator.updateOverlay(overlayState);
    return overlayState;
  }

  /**
   * Displays an overlay text card with explicit duration and countdown.
   */
  public showTextCountdown(
    macroId: string,
    macroName: string,
    text: string,
    durationSeconds: number,
    onFinished?: () => void,
  ): void {
    this.clearCountdown();

    let remaining = Math.max(1, durationSeconds);

    const update = () => {
      const state: OverlayCardState = {
        macroId,
        macroName,
        state: 'Playing',
        activeActionText: text,
        countdownSeconds: remaining,
        visible: true,
        infoX: 1.0,
        infoY: 0.0,
        scalePercent: 100,
        transparencyPercent: 0,
      };

      this.macroOverlayStates.set(macroId, state);
      this.windowOrchestrator.updateOverlay(state);
    };

    update();

    this.activeCountdownTimer = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        this.clearCountdown();
        this.clearMacroOverlay(macroId);
        onFinished?.();
      } else {
        update();
      }
    }, 1000);
  }

  public clearCountdown(): void {
    if (this.activeCountdownTimer !== null) {
      clearInterval(this.activeCountdownTimer);
      this.activeCountdownTimer = null;
    }
  }

  private readonly stateListeners = new Set<(card: OverlayCardState) => void>();

  public onStateChange(listener: (card: OverlayCardState) => void): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  private notifyStateChange(card: OverlayCardState): void {
    for (const listener of this.stateListeners) {
      try {
        listener(card);
      } catch {
        // Ignore listener error
      }
    }
  }

  public update(
    macroId: string,
    state: EngineState,
    macroName: string,
    playbackSpeed = 1.0,
    actionText?: string,
  ): OverlayCardState {
    const card = this.updateMacroOverlay(
      { id: macroId, name: macroName } as MacroDefinition,
      state,
      actionText,
      playbackSpeed,
    );
    this.notifyStateChange(card);
    return card;
  }

  public showCountdown(seconds: number): void {
    this.showTextCountdown('countdown', 'Recording Countdown', 'Starting in...', seconds);
  }

  public clear(): void {
    this.clearAllOverlays();
  }

  public clearMacroOverlay(macroId: string): void {
    this.macroOverlayStates.delete(macroId);
    if (this.macroOverlayStates.size === 0) {
      this.windowOrchestrator.clearOverlay();
    }
  }

  public clearAllOverlays(): void {
    this.clearCountdown();
    this.macroOverlayStates.clear();
    this.windowOrchestrator.clearOverlay();
  }

  public setPlacement(placement: OverlayPlacement): void {
    this.currentPreferences = {
      ...this.currentPreferences,
      overlayInfoX: placement.infoX,
      overlayInfoY: placement.infoY,
      overlayAnnotationX: placement.annotationX,
      overlayAnnotationY: placement.annotationY,
    };
  }

  public getMacroOverlayState(macroId: string): OverlayCardState | undefined {
    return this.macroOverlayStates.get(macroId);
  }

  public dispose(): void {
    this.clearAllOverlays();
    this.stateListeners.clear();
  }
}
