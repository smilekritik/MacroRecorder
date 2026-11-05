/**
 * @macro-recorder/desktop - Main Process Overlays Unit Tests
 * Tests for:
 * - DesktopOverlayManager multi-macro coordination
 * - Independent per-macro visibility overrides
 * - Monotonic playback clock countdown without frame drift
 * - Display and DPI-aware bounds clamping and monitor topology resilience
 * - Stale overlay content removal on playback stop or crash
 * - No-focus-steal and click-through window configurations
 */

import { describe, expect, it, beforeEach } from 'vitest';
import {
  calculateNormalizedCoordinates,
  calculatePixelCoordinates,
  clampBoundsToWorkArea,
  clampNormalized,
  clampScalePercent,
  clampTransparencyPercent,
} from '../display-bounds.js';
import { DesktopOverlayManager, resolveOverlayCardOverride } from '../overlay-manager.js';
import { PlaybackClock } from '../playback-clock.js';
import type {
  DisplayWorkArea,
  IOverlayWindowAdapter,
  OverlayFullState,
} from '../types.js';

class FakeOverlayWindowAdapter implements IOverlayWindowAdapter {
  public visible = false;
  public destroyed = false;
  public bounds = { x: 0, y: 0, width: 1920, height: 1080 };
  public ignoreMouseEvents = false;
  public mouseEventsForward = false;
  public alwaysOnTop = false;
  public alwaysOnTopLevel = '';
  public lastSentState: OverlayFullState | null = null;
  public showInactiveCallCount = 0;
  public hideCallCount = 0;

  public isDestroyed(): boolean {
    return this.destroyed;
  }

  public isVisible(): boolean {
    return this.visible;
  }

  public showInactive(): void {
    this.visible = true;
    this.showInactiveCallCount++;
  }

  public hide(): void {
    this.visible = false;
    this.hideCallCount++;
  }

  public close(): void {
    this.destroyed = true;
    this.visible = false;
  }

  public setBounds(bounds: { x: number; y: number; width: number; height: number }): void {
    this.bounds = { ...bounds };
  }

  public getBounds(): { x: number; y: number; width: number; height: number } {
    return { ...this.bounds };
  }

  public send(channel: string, payload: unknown): void {
    if (channel === 'overlay:state' || channel === 'overlay:changed') {
      this.lastSentState = payload as OverlayFullState;
    }
  }

  public setIgnoreMouseEvents(ignore: boolean, options?: { forward: boolean }): void {
    this.ignoreMouseEvents = ignore;
    this.mouseEventsForward = Boolean(options?.forward);
  }

  public setAlwaysOnTop(flag: boolean, level = 'screen-saver'): void {
    this.alwaysOnTop = flag;
    this.alwaysOnTopLevel = level;
  }
}

describe('Main Overlays Feature', () => {
  let fakeOverlayWindow: FakeOverlayWindowAdapter;
  let fakePlacementWindow: FakeOverlayWindowAdapter;
  let fakeToolbarWindow: FakeOverlayWindowAdapter;
  let manager: DesktopOverlayManager;
  let savedPreferences: Record<string, unknown>;

  beforeEach(() => {
    fakeOverlayWindow = new FakeOverlayWindowAdapter();
    fakePlacementWindow = new FakeOverlayWindowAdapter();
    fakeToolbarWindow = new FakeOverlayWindowAdapter();
    savedPreferences = {};

    manager = new DesktopOverlayManager({
      overlayWindow: fakeOverlayWindow,
      placementWindow: fakePlacementWindow,
      toolbarWindow: fakeToolbarWindow,
      onSavePreferences: (prefs) => {
        savedPreferences = { ...savedPreferences, ...prefs };
      },
      preferences: {
        overlayInfoX: 1.0,
        overlayInfoY: 0.0,
        overlayAnnotationX: 1.0,
        overlayAnnotationY: 0.0,
        showMacroInformation: true,
        showOverlayAnnotations: true,
      },
    });
  });

  describe('Success Criterion 1: No Focus Theft & Click-Through Behavior', () => {
    it('sets always-on-top and shows without focus theft (showInactive)', () => {
      expect(fakeOverlayWindow.showInactiveCallCount).toBe(0);

      // Updating a macro to Playing should display the overlay via showInactive
      manager.updateMacro('macro-1', 'Playing', 'Test Macro');

      expect(fakeOverlayWindow.showInactiveCallCount).toBe(1);
      expect(fakeOverlayWindow.visible).toBe(true);
    });

    it('hides overlay window when all content becomes inactive without focusing', () => {
      manager.updateMacro('macro-1', 'Playing', 'Test Macro');
      expect(fakeOverlayWindow.visible).toBe(true);

      manager.updateMacro('macro-1', 'Idle', 'Test Macro');
      expect(fakeOverlayWindow.visible).toBe(false);
      expect(fakeOverlayWindow.hideCallCount).toBeGreaterThan(0);
    });
  });

  describe('Success Criterion 2: Multi-Macro Card Independence & Visibility Overrides', () => {
    it('resolves overrides: ForceShow forces true even if global setting is off', () => {
      expect(resolveOverlayCardOverride('ForceShow', false)).toBe(true);
      expect(manager.resolveCardVisibility('ForceShow', false)).toBe(true);
    });

    it('resolves overrides: ForceHide forces false even if global setting is on', () => {
      expect(resolveOverlayCardOverride('ForceHide', true)).toBe(false);
      expect(manager.resolveCardVisibility('ForceHide', true)).toBe(false);
    });

    it('resolves overrides: Inherit follows application default setting', () => {
      expect(resolveOverlayCardOverride('Inherit', true)).toBe(true);
      expect(resolveOverlayCardOverride('Inherit', false)).toBe(false);
      expect(resolveOverlayCardOverride(undefined, true)).toBe(true);
    });

    it('maintains independent visibility across concurrent macros', () => {
      // Macro A has ForceShow
      manager.updateMacro('macro-a', 'Playing', 'Macro Alpha', {
        infoOverride: 'ForceShow',
      });

      // Macro B has ForceHide
      manager.updateMacro('macro-b', 'Playing', 'Macro Beta', {
        infoOverride: 'ForceHide',
      });

      // Macro C has Inherit
      manager.updateMacro('macro-c', 'Playing', 'Macro Gamma', {
        infoOverride: 'Inherit',
      });

      const state1 = manager.getFullState();
      const macroA1 = state1.macros.find((m) => m.macroId === 'macro-a');
      const macroB1 = state1.macros.find((m) => m.macroId === 'macro-b');
      const macroC1 = state1.macros.find((m) => m.macroId === 'macro-c');

      expect(macroA1?.visible).toBe(true);
      expect(macroB1?.visible).toBe(false);
      expect(macroC1?.visible).toBe(true);

      // Now toggle global showMacroInformation off
      manager.updatePreferences({ showMacroInformation: false });

      const state2 = manager.getFullState();
      const macroA2 = state2.macros.find((m) => m.macroId === 'macro-a');
      const macroB2 = state2.macros.find((m) => m.macroId === 'macro-b');
      const macroC2 = state2.macros.find((m) => m.macroId === 'macro-c');

      // Macro A remains visible because ForceShow overrides global off!
      expect(macroA2?.visible).toBe(true);
      // Macro B remains hidden
      expect(macroB2?.visible).toBe(false);
      // Macro C is now hidden because global is off
      expect(macroC2?.visible).toBe(false);
    });

    it('hides info cards if all info fields are disabled in preferences', () => {
      manager.updatePreferences({
        showOverlayState: false,
        showOverlayMacroName: false,
        showOverlayCurrentAction: false,
        showOverlaySchedule: false,
        showOverlayLatency: false,
      });

      expect(manager.hasAnyInfoFieldEnabled).toBe(false);

      const card = manager.updateMacro('macro-1', 'Playing', 'Macro 1');
      expect(card.visible).toBe(false);
    });
  });

  describe('Success Criterion 3: Monotonic Playback Clock Without Frame Drift', () => {
    it('accurately advances remaining microseconds based on elapsed monotonic timestamps', () => {
      let mockTimeUs = 1_000_000;
      const clock = new PlaybackClock({
        nowFn: () => mockTimeUs,
        tickIntervalMs: 1000, // Manual ticking
      });

      clock.start(5_000_000, 1.0); // 5 seconds
      expect(clock.getRemainingMicroseconds()).toBe(5_000_000);
      expect(clock.getRemainingSeconds()).toBe(5);

      // Advance by 1.5 seconds
      mockTimeUs += 1_500_000;
      clock.tick();
      expect(clock.getRemainingMicroseconds()).toBe(3_500_000);
      expect(clock.getRemainingSeconds()).toBe(4);

      // Advance by another 3.5 seconds to complete
      mockTimeUs += 3_500_000;
      clock.tick();
      expect(clock.getRemainingMicroseconds()).toBe(0);
      expect(clock.isExpired()).toBe(true);
    });

    it('scales clock rate according to playback speed', () => {
      let mockTimeUs = 0;
      const clock = new PlaybackClock({
        nowFn: () => mockTimeUs,
      });

      // At 2.0x playback speed, 1 second real time should consume 2 seconds of duration
      clock.start(4_000_000, 2.0);

      mockTimeUs += 1_000_000; // 1 second real time
      clock.tick();

      expect(clock.getRemainingMicroseconds()).toBe(2_000_000);
      expect(clock.getRemainingSeconds()).toBe(2);
    });

    it('pauses and resumes without timestamp drift or jump', () => {
      let mockTimeUs = 10_000_000;
      const clock = new PlaybackClock({
        nowFn: () => mockTimeUs,
      });

      clock.start(6_000_000, 1.0);

      // Advance 2s
      mockTimeUs += 2_000_000;
      clock.tick();
      expect(clock.getRemainingMicroseconds()).toBe(4_000_000);

      // Pause the clock
      clock.pause();
      expect(clock.isPaused).toBe(true);

      // Simulate a long 10-second delay while paused (user paused playback)
      mockTimeUs += 10_000_000;
      clock.tick(); // Ticking while paused must not reduce remaining time!
      expect(clock.getRemainingMicroseconds()).toBe(4_000_000);

      // Resume clock
      clock.resume();
      expect(clock.isPaused).toBe(false);

      // Advance 1s after resuming
      mockTimeUs += 1_000_000;
      clock.tick();
      expect(clock.getRemainingMicroseconds()).toBe(3_000_000);
    });

    it('pauses and resumes macro annotations when macro pauses', () => {
      manager.updateMacro('macro-p', 'Playing', 'Pause Test Macro', {
        event: {
          id: 'ev-ann-1',
          type: 'OverlayText',
          eventType: 'OverlayText',
          timeMicroseconds: 0,
          durationMicroseconds: 5_000_000,
          text: 'Prompt text',
        },
      });

      const full1 = manager.getFullState();
      expect(full1.annotations).toHaveLength(1);
      expect(full1.annotations[0]?.isPaused).toBe(false);

      // Pause macro
      manager.updateMacro('macro-p', 'Paused', 'Pause Test Macro');
      const full2 = manager.getFullState();
      expect(full2.annotations[0]?.isPaused).toBe(true);

      // Resume macro
      manager.updateMacro('macro-p', 'Playing', 'Pause Test Macro');
      const full3 = manager.getFullState();
      expect(full3.annotations[0]?.isPaused).toBe(false);
    });
  });

  describe('Success Criterion 4: Display Bounds Clamping & Monitor Topology Resilience', () => {
    const workArea1080p: DisplayWorkArea = {
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    };

    const workArea720p: DisplayWorkArea = {
      x: 0,
      y: 0,
      width: 1280,
      height: 720,
    };

    it('converts normalized coordinates [1.0, 0.0] to top-right corner pixel coordinates', () => {
      const coords = calculatePixelCoordinates(
        1.0,
        0.0,
        430,
        150,
        workArea1080p,
        1.0,
      );

      expect(coords.x).toBe(1920 - 430); // 1490
      expect(coords.y).toBe(0);
      expect(coords.width).toBe(430);
      expect(coords.height).toBe(150);
    });

    it('converts normalized coordinates [0.0, 1.0] to bottom-left corner pixel coordinates', () => {
      const coords = calculatePixelCoordinates(
        0.0,
        1.0,
        430,
        150,
        workArea1080p,
        1.0,
      );

      expect(coords.x).toBe(0);
      expect(coords.y).toBe(1080 - 150); // 930
    });

    it('safely clamps out-of-range normalized inputs strictly to [0, 1]', () => {
      expect(clampNormalized(-0.5)).toBe(0);
      expect(clampNormalized(1.5)).toBe(1);
      expect(clampNormalized(NaN)).toBe(0);

      expect(clampScalePercent(10)).toBe(25);
      expect(clampScalePercent(300)).toBe(200);

      expect(clampTransparencyPercent(-10)).toBe(0);
      expect(clampTransparencyPercent(120)).toBe(100);
    });

    it('clamps window bounds inside work area during resolution shrink', () => {
      // Window positioned at (1500, 900) on 1080p
      const oldBounds = { x: 1500, y: 900, width: 430, height: 150 };

      // Screen shrinks to 720p (1280x720)
      const clamped = clampBoundsToWorkArea(oldBounds, workArea720p);

      expect(clamped.x).toBe(1280 - 430); // 850
      expect(clamped.y).toBe(720 - 150); // 570
      expect(clamped.width).toBe(430);
      expect(clamped.height).toBe(150);
    });

    it('inverts pixel bounds back to normalized coordinates accurately', () => {
      const norm = calculateNormalizedCoordinates(
        1490,
        0,
        430,
        150,
        workArea1080p,
        1.0,
      );

      expect(norm.x).toBe(1.0);
      expect(norm.y).toBe(0.0);
    });

    it('saves placement coordinates upon calibration update', () => {
      manager.setPlacement({
        infoX: 0.25,
        infoY: 0.75,
        annotationX: 0.1,
        annotationY: 0.9,
      });

      const placement = manager.getPlacement();
      expect(placement.infoX).toBe(0.25);
      expect(placement.infoY).toBe(0.75);
      expect(placement.annotationX).toBe(0.1);
      expect(placement.annotationY).toBe(0.9);
    });
  });

  describe('Success Criterion 5: Stopping or Crashing Playback Removes Stale Content', () => {
    it('immediately removes stopped macro cards and annotations on onPlaybackStopped', () => {
      manager.updateMacro('macro-stop', 'Playing', 'Stop Test Macro', {
        event: {
          id: 'ann-stop-1',
          type: 'OverlayText',
          eventType: 'OverlayText',
          timeMicroseconds: 0,
          durationMicroseconds: 10_000_000,
          text: 'Stale text',
        },
      });

      expect(manager.getFullState().macros).toHaveLength(1);
      expect(manager.getFullState().annotations).toHaveLength(1);

      // Playback stops
      manager.onPlaybackStopped('macro-stop');

      expect(manager.getFullState().macros).toHaveLength(0);
      expect(manager.getFullState().annotations).toHaveLength(0);
      expect(fakeOverlayWindow.visible).toBe(false);
    });

    it('immediately removes crashed macro cards on onPlaybackCrashed', () => {
      manager.updateMacro('macro-crash', 'Playing', 'Crash Test Macro');
      expect(manager.getFullState().macros).toHaveLength(1);

      manager.onPlaybackCrashed('macro-crash');
      expect(manager.getFullState().macros).toHaveLength(0);
      expect(fakeOverlayWindow.visible).toBe(false);
    });

    it('clearAllOverlays clears all active content and stops active timers', () => {
      manager.updateMacro('m1', 'Playing', 'Macro 1');
      manager.updateMacro('m2', 'Playing', 'Macro 2');
      manager.showCountdown(3);

      expect(manager.getFullState().macros).toHaveLength(2);
      expect(manager.getFullState().isCountdownVisible).toBe(true);

      manager.clearAllOverlays();

      const cleared = manager.getFullState();
      expect(cleared.macros).toHaveLength(0);
      expect(cleared.annotations).toHaveLength(0);
      expect(cleared.isCountdownVisible).toBe(false);
      expect(cleared.countdownNumber).toBeNull();
      expect(fakeOverlayWindow.visible).toBe(false);
    });
  });
});
