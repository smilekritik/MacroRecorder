/**
 * @macro-recorder/desktop - Desktop Overlays Coordinator & Manager
 * Central main-process orchestrator for:
 * - Transparent, non-activating click-through OverlayWindow
 * - Interactive positioning preview OverlayPlacementWindow
 * - Compact floating recording toolbar FloatingToolbarWindow
 * - Multi-macro concurrent status and annotation card state machine
 * - Independent per-macro visibility override resolution
 * - Monotonic playback clock countdown without renderer frame drift
 * - Safe clamping and persistence across restart and monitor changes
 * - Immediate removal of stale overlay content on playback stop or crash.
 */

import { clampNormalized, clampScalePercent, clampTransparencyPercent } from './display-bounds.js';
import { FloatingToolbarWindowManager } from './floating-toolbar-window.js';
import { OverlayWindowManager } from './overlay-window.js';
import { OverlayPlacementWindowManager } from './placement-window.js';
import { PlaybackClock } from './playback-clock.js';
import type {
  IOverlayWindowAdapter,
  OverlayAnnotationCardData,
  OverlayAppearancePreferences,
  OverlayFullState,
  OverlayMacroCardData,
  OverlayPlacementPreferences,
  OverlayWindowCallbacks,
} from './types.js';
import type { AppPreferences, DispatchReceipt, EngineState, MacroEvent, OverlayCardOverride } from '../application/types.js';

export interface OverlayManagerOptions {
  readonly overlayWindow?: IOverlayWindowAdapter | undefined;
  readonly placementWindow?: IOverlayWindowAdapter | undefined;
  readonly toolbarWindow?: IOverlayWindowAdapter | undefined;
  readonly preferences?: AppPreferences | undefined;
  readonly onSavePreferences?: ((prefs: Partial<AppPreferences>) => void) | undefined;
  readonly onRecordAction?: (() => void) | undefined;
  readonly onPauseAction?: (() => void) | undefined;
  readonly onStopAction?: (() => void) | undefined;
}

/**
 * Resolves whether a card should be visible based on per-macro override and application preference.
 */
export function resolveOverlayCardOverride(
  macroOverride: OverlayCardOverride | undefined,
  globalSettingEnabled: boolean,
): boolean {
  if (macroOverride === 'ForceShow') {
    return true;
  }
  if (macroOverride === 'ForceHide') {
    return false;
  }
  return globalSettingEnabled;
}

export class DesktopOverlayManager {
  private readonly overlayWindow: IOverlayWindowAdapter;
  private readonly placementWindow: IOverlayWindowAdapter;
  private readonly toolbarWindow: IOverlayWindowAdapter;
  private readonly onSavePreferences?: ((prefs: Partial<AppPreferences>) => void) | undefined;

  private readonly activeMacros = new Map<string, OverlayMacroCardData>();
  private readonly activeAnnotations = new Map<string, OverlayAnnotationCardData>();
  private readonly annotationClocks = new Map<string, PlaybackClock>();

  private countdownNumber: number | null = null;
  private isCountdownActive = false;
  private activeCountdownClock: PlaybackClock | null = null;

  private placementPrefs: OverlayPlacementPreferences = {
    infoX: 1.0,
    infoY: 0.0,
    annotationX: 1.0,
    annotationY: 0.0,
  };

  private appearancePrefs: OverlayAppearancePreferences = {
    overlayScalePercent: 100,
    overlayInfoTransparencyPercent: 0,
    overlayAnnotationScalePercent: 100,
    overlayAnnotationTransparencyPercent: 0,
    showMacroInformation: true,
    showOverlayState: true,
    showOverlayMacroName: true,
    showOverlayCurrentAction: true,
    showOverlaySchedule: true,
    showOverlayLatency: true,
    showOverlayAnnotations: true,
    showOverlayAnnotationTiming: true,
  };

  constructor(options: OverlayManagerOptions = {}) {
    this.onSavePreferences = options.onSavePreferences;

    // Windows can be provided or initialized with default managers
    this.overlayWindow = options.overlayWindow ?? new OverlayWindowManager();
    this.placementWindow =
      options.placementWindow ??
      new OverlayPlacementWindowManager({
        onPlacementChanged: (placement) => {
          this.setPlacement(placement);
          this.onSavePreferences?.({
            overlayInfoX: placement.infoX,
            overlayInfoY: placement.infoY,
            overlayAnnotationX: placement.annotationX,
            overlayAnnotationY: placement.annotationY,
          });
        },
      });

    const callbacks: OverlayWindowCallbacks = {
      ...(options.onRecordAction ? { onRecordClicked: options.onRecordAction } : {}),
      ...(options.onPauseAction ? { onPauseClicked: options.onPauseAction } : {}),
      ...(options.onStopAction ? { onStopClicked: options.onStopAction } : {}),
    };

    this.toolbarWindow =
      options.toolbarWindow ??
      new FloatingToolbarWindowManager({
        callbacks,
      });

    // Load preferences if provided
    if (options.preferences) {
      this.updatePreferences(options.preferences);
    }
  }

  public get overlayWindowAdapter(): IOverlayWindowAdapter {
    return this.overlayWindow;
  }

  public get placementWindowAdapter(): IOverlayWindowAdapter {
    return this.placementWindow;
  }

  public get toolbarWindowAdapter(): IOverlayWindowAdapter {
    return this.toolbarWindow;
  }

  /**
   * Updates application preferences and applies them to all cards and preview.
   */
  public updatePreferences(preferences: AppPreferences): void {
    const p = preferences as Record<string, unknown>;

    if (typeof p['overlayInfoX'] === 'number') {
      this.placementPrefs = {
        ...this.placementPrefs,
        infoX: clampNormalized(p['overlayInfoX']),
      };
    }
    if (typeof p['overlayInfoY'] === 'number') {
      this.placementPrefs = {
        ...this.placementPrefs,
        infoY: clampNormalized(p['overlayInfoY']),
      };
    }
    if (typeof p['overlayAnnotationX'] === 'number') {
      this.placementPrefs = {
        ...this.placementPrefs,
        annotationX: clampNormalized(p['overlayAnnotationX']),
      };
    }
    if (typeof p['overlayAnnotationY'] === 'number') {
      this.placementPrefs = {
        ...this.placementPrefs,
        annotationY: clampNormalized(p['overlayAnnotationY']),
      };
    }

    this.appearancePrefs = {
      overlayScalePercent: clampScalePercent(
        typeof p['overlayScalePercent'] === 'number'
          ? p['overlayScalePercent']
          : this.appearancePrefs.overlayScalePercent,
      ),
      overlayInfoTransparencyPercent: clampTransparencyPercent(
        typeof p['overlayInfoTransparencyPercent'] === 'number'
          ? p['overlayInfoTransparencyPercent']
          : this.appearancePrefs.overlayInfoTransparencyPercent,
      ),
      overlayAnnotationScalePercent: clampScalePercent(
        typeof p['overlayAnnotationScalePercent'] === 'number'
          ? p['overlayAnnotationScalePercent']
          : this.appearancePrefs.overlayAnnotationScalePercent,
      ),
      overlayAnnotationTransparencyPercent: clampTransparencyPercent(
        typeof p['overlayAnnotationTransparencyPercent'] === 'number'
          ? p['overlayAnnotationTransparencyPercent']
          : this.appearancePrefs.overlayAnnotationTransparencyPercent,
      ),
      showMacroInformation: Boolean(
        p['showMacroInformation'] ?? this.appearancePrefs.showMacroInformation,
      ),
      showOverlayState: Boolean(
        p['showOverlayState'] ?? this.appearancePrefs.showOverlayState,
      ),
      showOverlayMacroName: Boolean(
        p['showOverlayMacroName'] ?? this.appearancePrefs.showOverlayMacroName,
      ),
      showOverlayCurrentAction: Boolean(
        p['showOverlayCurrentAction'] ?? this.appearancePrefs.showOverlayCurrentAction,
      ),
      showOverlaySchedule: Boolean(
        p['showOverlaySchedule'] ?? this.appearancePrefs.showOverlaySchedule,
      ),
      showOverlayLatency: Boolean(
        p['showOverlayLatency'] ?? this.appearancePrefs.showOverlayLatency,
      ),
      showOverlayAnnotations: Boolean(
        p['showOverlayAnnotations'] ?? this.appearancePrefs.showOverlayAnnotations,
      ),
      showOverlayAnnotationTiming: Boolean(
        p['showOverlayAnnotationTiming'] ??
          this.appearancePrefs.showOverlayAnnotationTiming,
      ),
    };

    // Re-resolve visibility for all active macros
    this.refreshAllCardVisibilities();
    this.broadcastState();
  }

  /**
   * Resolves card visibility independently for each macro override.
   */
  public resolveCardVisibility(
    macroOverride: OverlayCardOverride | undefined,
    globalSettingEnabled: boolean,
  ): boolean {
    return resolveOverlayCardOverride(macroOverride, globalSettingEnabled);
  }

  /**
   * Checks if at least one field of the Macro Info card is enabled.
   */
  public get hasAnyInfoFieldEnabled(): boolean {
    return (
      this.appearancePrefs.showOverlayState ||
      this.appearancePrefs.showOverlayMacroName ||
      this.appearancePrefs.showOverlayCurrentAction ||
      this.appearancePrefs.showOverlaySchedule ||
      this.appearancePrefs.showOverlayLatency
    );
  }

  /**
   * Updates overlay status for a macro during recording or playback.
   * Multi-macro aware: each macro maintains its own independent card state.
   */
  public updateMacro(
    macroId: string,
    state: EngineState,
    macroName: string,
    options: {
      actionText?: string | undefined;
      receipt?: DispatchReceipt | null | undefined;
      playbackSpeed?: number | undefined;
      infoOverride?: OverlayCardOverride | undefined;
      customTextOverride?: OverlayCardOverride | undefined;
      event?: MacroEvent | null | undefined;
    } = {},
  ): OverlayMacroCardData {
    // If macro transitioned to Idle, clear it immediately
    if (state === 'Idle') {
      this.clearMacroOverlay(macroId);
      return {
        macroId,
        macroName,
        state: 'Idle',
        infoOverride: options.infoOverride ?? 'Inherit',
        customTextOverride: options.customTextOverride ?? 'Inherit',
        visible: false,
      };
    }

    const infoOverride = options.infoOverride ?? 'Inherit';
    const customTextOverride = options.customTextOverride ?? 'Inherit';
    const isVisible =
      this.resolveCardVisibility(infoOverride, this.appearancePrefs.showMacroInformation) &&
      this.hasAnyInfoFieldEnabled;

    const cardData: OverlayMacroCardData = {
      macroId,
      macroName,
      state,
      actionText: options.actionText,
      receipt: options.receipt,
      speed: options.playbackSpeed ?? 1.0,
      infoOverride,
      customTextOverride,
      visible: isVisible,
    };

    const previousMacro = this.activeMacros.get(macroId);
    this.activeMacros.set(macroId, cardData);

    // Synchronize pause/resume on annotations belonging to this macro
    if (state === 'Paused' && previousMacro?.state !== 'Paused') {
      this.pauseAnnotationsForMacro(macroId);
    } else if (state === 'Playing' && previousMacro?.state === 'Paused') {
      this.resumeAnnotationsForMacro(macroId);
    }

    // Handle OverlayText actions
    if (
      options.event &&
      (options.event.type === 'OverlayText' || (options.event as unknown as { eventType?: string }).eventType === 'OverlayText') &&
      options.event.durationMicroseconds &&
      options.event.durationMicroseconds > 0
    ) {
      this.startAnnotation(
        macroId,
        macroName,
        options.event,
        options.playbackSpeed ?? 1.0,
        customTextOverride,
      );
    }

    this.broadcastState();
    return cardData;
  }

  /**
   * Displays an overlay annotation prompt using the monotonic playback clock.
   */
  public startAnnotation(
    macroId: string,
    macroName: string,
    item: MacroEvent,
    playbackSpeed = 1.0,
    customTextOverride: OverlayCardOverride = 'Inherit',
  ): void {
    const rawId = item['id'];
    const eventId = typeof rawId === 'string' ? rawId : typeof rawId === 'number' ? String(rawId) : undefined;
    const annotationId: string = eventId || `${macroId}-ann-${Date.now()}`;

    // Clean up existing clock for this annotation if already active
    const existingClock = this.annotationClocks.get(annotationId);
    if (existingClock) {
      existingClock.stop();
      this.annotationClocks.delete(annotationId);
    }

    const durationUs = typeof item.durationMicroseconds === 'number' && item.durationMicroseconds > 0
      ? item.durationMicroseconds
      : 2_000_000;
    const isVisible = this.resolveCardVisibility(
      customTextOverride,
      this.appearancePrefs.showOverlayAnnotations,
    );

    const clock = new PlaybackClock({ tickIntervalMs: 50 });
    this.annotationClocks.set(annotationId, clock);

    const rawText = item['text'] ?? item['prompt'];
    const text: string = typeof rawText === 'string' ? rawText : '';
    const showTiming = typeof item['showOverlayTiming'] === 'boolean'
      ? (item['showOverlayTiming'] as boolean)
      : true;

    const annotationCard: OverlayAnnotationCardData = {
      annotationId,
      macroId,
      macroName,
      text,
      remainingSeconds: Math.ceil(durationUs / 1_000_000),
      totalSeconds: Math.ceil(durationUs / 1_000_000),
      remainingMicroseconds: durationUs,
      durationMicroseconds: durationUs,
      showTiming,
      isPaused: false,
      customTextOverride,
      visible: isVisible,
    };

    this.activeAnnotations.set(annotationId, annotationCard);

    clock.onTick((remainingUs, remainingSec) => {
      const current = this.activeAnnotations.get(annotationId);
      if (current) {
        this.activeAnnotations.set(annotationId, {
          ...current,
          remainingMicroseconds: remainingUs,
          remainingSeconds: remainingSec,
        });
        this.broadcastState();
      }
    });

    clock.onFinished(() => {
      this.activeAnnotations.delete(annotationId);
      this.annotationClocks.delete(annotationId);
      this.broadcastState();
    });

    clock.start(durationUs, playbackSpeed);
    this.broadcastState();
  }

  /**
   * Shows the centered recording countdown circle with monotonic timing.
   */
  public showCountdown(seconds: number): void {
    this.clearCountdown();

    this.countdownNumber = Math.max(1, Math.round(seconds));
    this.isCountdownActive = true;

    this.activeCountdownClock = new PlaybackClock({ tickIntervalMs: 100 });
    const durationUs = this.countdownNumber * 1_000_000;

    this.activeCountdownClock.onTick((_remainingUs, remainingSec) => {
      this.countdownNumber = remainingSec;
      this.broadcastState();
    });

    this.activeCountdownClock.onFinished(() => {
      this.clearCountdown();
      this.broadcastState();
    });

    this.activeCountdownClock.start(durationUs, 1.0);
    this.broadcastState();
  }

  public hideCountdown(): void {
    this.clearCountdown();
    this.broadcastState();
  }

  public clearCountdown(): void {
    if (this.activeCountdownClock) {
      this.activeCountdownClock.stop();
      this.activeCountdownClock = null;
    }
    this.countdownNumber = null;
    this.isCountdownActive = false;
  }

  /**
   * Success Criterion 5: Stopping or crashing playback removes stale overlay content.
   */
  public onPlaybackStopped(macroId: string): void {
    this.clearMacroOverlay(macroId);
  }

  public onPlaybackCrashed(macroId: string): void {
    this.clearMacroOverlay(macroId);
  }

  public clearMacroOverlay(macroId: string): void {
    this.activeMacros.delete(macroId);

    // Remove all annotations belonging to this macro
    for (const [id, ann] of this.activeAnnotations.entries()) {
      if (ann.macroId === macroId) {
        const clock = this.annotationClocks.get(id);
        if (clock) {
          clock.stop();
          this.annotationClocks.delete(id);
        }
        this.activeAnnotations.delete(id);
      }
    }

    this.broadcastState();
  }

  public clearAllOverlays(): void {
    this.clearCountdown();

    for (const clock of this.annotationClocks.values()) {
      clock.stop();
    }
    this.annotationClocks.clear();
    this.activeAnnotations.clear();
    this.activeMacros.clear();

    this.broadcastState();
  }

  public setPlacement(placement: OverlayPlacementPreferences): void {
    this.placementPrefs = {
      infoX: clampNormalized(placement.infoX),
      infoY: clampNormalized(placement.infoY),
      annotationX: clampNormalized(placement.annotationX),
      annotationY: clampNormalized(placement.annotationY),
    };
    this.broadcastState();
  }

  public getPlacement(): OverlayPlacementPreferences {
    return { ...this.placementPrefs };
  }

  public getAppearance(): OverlayAppearancePreferences {
    return { ...this.appearancePrefs };
  }

  public getFullState(): OverlayFullState {
    return {
      macros: Array.from(this.activeMacros.values()),
      annotations: Array.from(this.activeAnnotations.values()),
      countdownNumber: this.countdownNumber,
      isCountdownVisible: this.isCountdownActive,
      placement: this.placementPrefs,
      appearance: this.appearancePrefs,
    };
  }

  // Floating toolbar helpers
  public showFloatingToolbar(): void {
    this.toolbarWindow.showInactive();
  }

  public hideFloatingToolbar(): void {
    this.toolbarWindow.hide();
  }

  // Placement preview window helpers
  public showPlacementPreview(): void {
    this.placementWindow.showInactive();
    if (this.placementWindow instanceof OverlayPlacementWindowManager) {
      this.placementWindow.updateConfig(this.placementPrefs, this.appearancePrefs);
    }
  }

  public hidePlacementPreview(): void {
    this.placementWindow.hide();
  }

  public dispose(): void {
    this.clearAllOverlays();
    this.overlayWindow.close();
    this.placementWindow.close();
    this.toolbarWindow.close();
  }

  private pauseAnnotationsForMacro(macroId: string): void {
    for (const [id, ann] of this.activeAnnotations.entries()) {
      if (ann.macroId === macroId) {
        this.annotationClocks.get(id)?.pause();
        this.activeAnnotations.set(id, { ...ann, isPaused: true });
      }
    }
  }

  private resumeAnnotationsForMacro(macroId: string): void {
    for (const [id, ann] of this.activeAnnotations.entries()) {
      if (ann.macroId === macroId) {
        this.annotationClocks.get(id)?.resume();
        this.activeAnnotations.set(id, { ...ann, isPaused: false });
      }
    }
  }

  private refreshAllCardVisibilities(): void {
    for (const [id, macro] of this.activeMacros.entries()) {
      const visible =
        this.resolveCardVisibility(macro.infoOverride, this.appearancePrefs.showMacroInformation) &&
        this.hasAnyInfoFieldEnabled &&
        macro.state !== 'Idle';
      this.activeMacros.set(id, { ...macro, visible });
    }

    for (const [id, ann] of this.activeAnnotations.entries()) {
      const visible =
        this.resolveCardVisibility(
          ann.customTextOverride,
          this.appearancePrefs.showOverlayAnnotations,
        ) && !ann.isPaused;
      this.activeAnnotations.set(id, { ...ann, visible });
    }
  }

  private broadcastState(): void {
    const fullState = this.getFullState();

    // Update overlay window if it implements updateState
    if (this.overlayWindow instanceof OverlayWindowManager) {
      this.overlayWindow.updateState(fullState);
    } else {
      const hasVisibleContent =
        fullState.isCountdownVisible ||
        fullState.macros.some((m) => m.visible) ||
        fullState.annotations.some((a) => a.visible);

      if (hasVisibleContent) {
        this.overlayWindow.showInactive();
      } else {
        this.overlayWindow.hide();
      }
      this.overlayWindow.send('overlay:state', fullState);
      this.overlayWindow.send('overlay:changed', fullState);
    }
  }
}
