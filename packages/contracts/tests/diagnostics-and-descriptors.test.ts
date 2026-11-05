import { describe, expect, it } from 'vitest';
import {
  createDispatchReceipt,
  dispatchReceiptSchema,
  EngineState,
  gamepadPadReadingSchema,
  gamepadSnapshotSchema,
  openWindowInfoSchema,
  OverlayCardOverride,
  overlayMacroViewSchema,
  runHistoryEntrySchema,
  timingSummarySchema,
  windowInspectionSnapshotSchema,
} from '../src/index.js';

describe('Diagnostics, Descriptors, and Overlays', () => {
  it('calculates dispatch jitter and hook confirmation latency correctly', () => {
    const receipt = createDispatchReceipt({
      eventId: crypto.randomUUID(),
      scheduledMicroseconds: 100000,
      plannedMicroseconds: 104000, // +4 ms planned jitter
      dispatchStartedMicroseconds: 105500, // actual start
      dispatchCompletedMicroseconds: 106000,
      hookConfirmedMicroseconds: 107200,
      success: true,
    });

    // Jitter is (dispatchStarted - planned) / 1000: (105500 - 104000) / 1000 = 1.5 ms
    expect(receipt.dispatchJitterMilliseconds).toBeCloseTo(1.5);
    // Confirmation latency is (hookConfirmed - dispatchStarted) / 1000: (107200 - 105500) / 1000 = 1.7 ms
    expect(receipt.confirmationMilliseconds).toBeCloseTo(1.7);
    expect(receipt.success).toBe(true);

    const validated = dispatchReceiptSchema.parse(receipt);
    expect(validated.success).toBe(true);
  });

  it('validates timing summaries', () => {
    const summary = {
      count: 100,
      failed: 1,
      unconfirmed: 2,
      meanMs: 0.85,
      medianMs: 0.72,
      p95Ms: 1.45,
      p99Ms: 2.1,
      maxMs: 3.4,
    };
    const validated = timingSummarySchema.parse(summary);
    expect(validated.success).toBe(true);
  });

  it('validates run history entries', () => {
    const entry = {
      macroId: crypto.randomUUID(),
      macroName: 'Game Combo',
      runCount: 25,
      lastRunAt: new Date().toISOString(),
      lastActivation: 'manual',
      totalDurationMs: 15420.5,
      averageJitterMs: 1.2,
      maxJitterMs: 3.8,
      totalDispatched: 500,
      totalFailed: 0,
      totalUnconfirmed: 4,
    };
    const validated = runHistoryEntrySchema.parse(entry);
    expect(validated.success).toBe(true);
  });

  it('validates window inspection snapshot and open window descriptors', () => {
    const openWindow = {
      handle: 0x123456,
      title: 'Notepad',
      processName: 'notepad.exe',
      processId: 1044,
      className: 'Notepad',
    };
    expect(openWindowInfoSchema.parse(openWindow).success).toBe(true);

    const snapshot = {
      isSelf: false,
      title: 'Target Window',
      className: 'MainWindowClass',
      processName: 'app.exe',
      processId: 5432,
      mouseScreenX: 500,
      mouseScreenY: 600,
      mouseWindowX: 100,
      mouseWindowY: 150,
      mouseClientX: 92,
      mouseClientY: 120,
      rgb: 0x00ff00,
      windowX: 400,
      windowY: 450,
      windowWidth: 800,
      windowHeight: 600,
      clientWidth: 780,
      clientHeight: 560,
      controlClass: 'Edit',
      controlX: 410,
      controlY: 470,
      controlWidth: 200,
      controlHeight: 30,
      hex: '#00FF00',
    };
    expect(windowInspectionSnapshotSchema.parse(snapshot).success).toBe(true);
  });

  it('validates gamepad descriptors and normalized readings', () => {
    const snapshot = {
      connected: true,
      buttons: 0x1001, // A + DPadUp
      leftX: 12000,
      leftY: -8000,
      rightX: 0,
      rightY: 0,
      leftTrigger: 255,
      rightTrigger: 0,
    };
    expect(gamepadSnapshotSchema.parse(snapshot).success).toBe(true);

    const reading = {
      source: 'XInput · slot 0',
      pressed: ['A', 'DPadUp'] as const,
      leftX: 12000,
      leftY: -8000,
      rightX: 0,
      rightY: 0,
      leftTrigger: 255,
      rightTrigger: 0,
      rawAxes: null,
    };
    expect(gamepadPadReadingSchema.parse(reading).success).toBe(true);
  });

  it('validates overlay macro views', () => {
    const view = {
      macroId: crypto.randomUUID(),
      macroName: 'Active Automation',
      state: EngineState.Playing,
      infoOverride: OverlayCardOverride.Inherit,
      customTextOverride: OverlayCardOverride.ForceShow,
    };
    expect(overlayMacroViewSchema.parse(view).success).toBe(true);
  });
});
