/**
 * @macro-recorder/desktop - Overlays Renderer Feature Tests
 * Tests for:
 * - StatusCard
 * - AnnotationCard
 * - CountdownBadge
 * - FloatingToolbar
 * - OverlayPlacementPreview
 * - OverlayWindowView
 * - Theme and localization fidelity across dark/light and en/ru
 */

import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  AnnotationCard,
  CountdownBadge,
  FloatingToolbar,
  OverlayPlacementPreview,
  OverlayWindowView,
  StatusCard,
  getOverlayCardBackground,
  getStateBadgeText,
  formatAnnotationTiming,
  clamp,
} from '../index.js';

// Mock useApi
vi.mock('../../../hooks/useApi.js', () => ({
  useApi: () => ({
    invoke: vi.fn().mockResolvedValue({ success: true, data: null }),
    on: vi.fn().mockReturnValue(() => {}),
  }),
}));

describe('Overlays Renderer Feature', () => {
  describe('Utils and Color Math', () => {
    it('clamps values strictly within min and max', () => {
      expect(clamp(50, 0, 100)).toBe(50);
      expect(clamp(-10, 0, 100)).toBe(0);
      expect(clamp(150, 0, 100)).toBe(100);
      expect(clamp(NaN, 0, 100)).toBe(0);
    });

    it('computes overlay card background with transparency in dark theme', () => {
      const bg0 = getOverlayCardBackground('dark', 0);
      expect(bg0).toBe('rgba(18, 23, 32, 0.900)');

      const bg50 = getOverlayCardBackground('dark', 50);
      expect(bg50).toBe('rgba(18, 23, 32, 0.450)');

      const bg100 = getOverlayCardBackground('dark', 100);
      expect(bg100).toBe('rgba(18, 23, 32, 0.000)');
    });

    it('computes overlay card background with transparency in light theme', () => {
      const bg0 = getOverlayCardBackground('light', 0);
      expect(bg0).toBe('rgba(255, 255, 255, 0.920)');

      const bg50 = getOverlayCardBackground('light', 50);
      expect(bg50).toBe('rgba(255, 255, 255, 0.460)');

      const bg100 = getOverlayCardBackground('light', 100);
      expect(bg100).toBe('rgba(255, 255, 255, 0.000)');
    });

    it('formats state badge text correctly', () => {
      expect(getStateBadgeText('Playing')).toBe('▶ PLAYBACK');
      expect(getStateBadgeText('Paused')).toBe('Ⅱ PAUSED');
      expect(getStateBadgeText('Stopping')).toBe('■ STOPPING');
      expect(getStateBadgeText('Recording')).toBe('● RECORDING');
      expect(getStateBadgeText('Countdown')).toBe('GET READY');
      expect(getStateBadgeText('Idle')).toBe('DONE');
    });

    it('formats annotation timing text correctly', () => {
      const secondsFormatted = formatAnnotationTiming(2.5, 3000);
      expect(secondsFormatted).toBe('2.5 s remaining · until 3000 ms');

      const integerSeconds = formatAnnotationTiming(3.0, 3000);
      expect(integerSeconds).toBe('3 s remaining · until 3000 ms');

      const msFormatted = formatAnnotationTiming(0.45, 1200);
      expect(msFormatted).toBe('450 ms remaining · until 1200 ms');
    });
  });

  describe('StatusCard', () => {
    const baseCard = {
      macroId: 'm-alpha',
      macroName: 'Work Macro 1',
      state: 'Playing' as const,
      actionText: 'Event: key Enter ↓',
      scheduleText: 'Scheduled: 500 ms',
      latencyText: 'Jitter: +0.050 ms · confirmation: 0.120 ms',
      visible: true,
    };

    it('renders all information fields in dark theme', () => {
      const html = renderToString(
        React.createElement(StatusCard, {
          card: baseCard,
          theme: 'dark',
          scalePercent: 100,
          transparencyPercent: 0,
        }),
      );

      expect(html).toContain('▶ PLAYBACK');
      expect(html).toContain('Work Macro 1');
      expect(html).toContain('Event: key Enter ↓');
      expect(html).toContain('Scheduled: 500 ms');
      expect(html).toContain('Jitter: +0.050 ms · confirmation: 0.120 ms');
      expect(html).toContain('data-testid="status-accent-pillar"');
      expect(html).toContain('rgba(18, 23, 32, 0.900)');
    });

    it('renders in light theme with light background', () => {
      const html = renderToString(
        React.createElement(StatusCard, {
          card: baseCard,
          theme: 'light',
          scalePercent: 100,
          transparencyPercent: 0,
        }),
      );

      expect(html).toContain('rgba(255, 255, 255, 0.920)');
      expect(html).toContain('Work Macro 1');
    });

    it('respects individual field visibility toggles', () => {
      const html = renderToString(
        React.createElement(StatusCard, {
          card: baseCard,
          fieldConfig: {
            showState: false,
            showMacroName: true,
            showCurrentAction: false,
            showSchedule: false,
            showLatency: false,
          },
        }),
      );

      expect(html).not.toContain('▶ PLAYBACK');
      expect(html).toContain('Work Macro 1');
      expect(html).not.toContain('Event: key Enter ↓');
      expect(html).not.toContain('Scheduled: 500 ms');
      expect(html).not.toContain('Jitter: +0.050 ms');
    });

    it('applies scaling transform when scalePercent is not 100', () => {
      const html = renderToString(
        React.createElement(StatusCard, {
          card: baseCard,
          scalePercent: 150,
        }),
      );

      expect(html).toContain('transform:scale(1.5)');
    });

    it('returns empty string when card.visible is false', () => {
      const html = renderToString(
        React.createElement(StatusCard, {
          card: { ...baseCard, visible: false },
        }),
      );

      expect(html).toBe('');
    });
  });

  describe('AnnotationCard', () => {
    const baseAnnotation = {
      annotationId: 'ann-1',
      macroId: 'm-beta',
      macroName: 'Beta Sequence',
      text: 'Please press Space to continue',
      remainingSeconds: 2.4,
      endMilliseconds: 5000,
      showTiming: true,
      visible: true,
    };

    it('renders header, prompt text, and remaining time', () => {
      const html = renderToString(
        React.createElement(AnnotationCard, {
          card: baseAnnotation,
          theme: 'dark',
          scalePercent: 100,
        }),
      );

      expect(html).toContain('PROMPT · Beta Sequence');
      expect(html).toContain('Please press Space to continue');
      expect(html).toContain('2.4 s remaining · until 5000 ms');
      expect(html).toContain('border-[var(--color-focus)]');
    });

    it('hides timing text when showTiming is false', () => {
      const html = renderToString(
        React.createElement(AnnotationCard, {
          card: baseAnnotation,
          showTiming: false,
        }),
      );

      expect(html).toContain('PROMPT · Beta Sequence');
      expect(html).toContain('Please press Space to continue');
      expect(html).not.toContain('remaining · until');
    });

    it('returns empty string when card.visible is false', () => {
      const html = renderToString(
        React.createElement(AnnotationCard, {
          card: { ...baseAnnotation, visible: false },
        }),
      );

      expect(html).toBe('');
    });
  });

  describe('CountdownBadge', () => {
    it('renders centered badge with large countdown number', () => {
      const html = renderToString(
        React.createElement(CountdownBadge, {
          number: 3,
          visible: true,
          theme: 'dark',
        }),
      );

      expect(html).toContain('data-testid="countdown-host"');
      expect(html).toContain('data-testid="countdown-badge"');
      expect(html).toContain('3');
      expect(html).toContain('rounded-full');
      expect(html).toContain('border-[var(--color-accent)]');
    });

    it('returns empty string when visible is false or number <= 0', () => {
      expect(
        renderToString(React.createElement(CountdownBadge, { number: 3, visible: false })),
      ).toBe('');
      expect(
        renderToString(React.createElement(CountdownBadge, { number: 0, visible: true })),
      ).toBe('');
      expect(
        renderToString(React.createElement(CountdownBadge, { number: -1, visible: true })),
      ).toBe('');
    });
  });

  describe('FloatingToolbar', () => {
    it('renders drag handle, record, pause, stop, and close buttons', () => {
      const html = renderToString(
        React.createElement(FloatingToolbar, {
          engineState: 'Idle',
        }),
      );

      expect(html).toContain('data-testid="floating-toolbar"');
      expect(html).toContain('data-testid="toolbar-drag-handle"');
      expect(html).toContain('data-testid="toolbar-record-button"');
      expect(html).toContain('data-testid="toolbar-pause-button"');
      expect(html).toContain('data-testid="toolbar-stop-button"');
      expect(html).toContain('data-testid="toolbar-close-button"');

      // Drag handle icon
      expect(html).toContain('⠿');
      // Record icon
      expect(html).toContain('●');
      // Pause icon
      expect(html).toContain('❚❚');
      // Stop icon
      expect(html).toContain('■');
    });

    it('displays recording active style when recording', () => {
      const html = renderToString(
        React.createElement(FloatingToolbar, {
          engineState: 'Recording',
          isRecording: true,
        }),
      );

      expect(html).toContain('animate-pulse');
    });

    it('displays resume icon when paused', () => {
      const html = renderToString(
        React.createElement(FloatingToolbar, {
          engineState: 'Paused',
          isPaused: true,
        }),
      );

      expect(html).toContain('▶');
    });
  });

  describe('OverlayPlacementPreview', () => {
    it('renders sample status card and sample annotation card', () => {
      const html = renderToString(
        React.createElement(OverlayPlacementPreview, {
          placement: { infoX: 1.0, infoY: 0.0, annotationX: 0.5, annotationY: 0.5 },
          onPlacementChanged: () => {},
        }),
      );

      expect(html).toContain('data-testid="overlay-placement-preview"');
      expect(html).toContain('data-testid="preview-info-container"');
      expect(html).toContain('data-testid="preview-annotation-container"');

      // Sample data
      expect(html).toContain('Sample macro');
      expect(html).toContain('Event: key E ↓');
      expect(html).toContain('PROMPT · SAMPLE');
      expect(html).toContain('Press E after the signal appears');
    });

    it('respects showMacroInformation and showOverlayAnnotations toggles', () => {
      const html = renderToString(
        React.createElement(OverlayPlacementPreview, {
          placement: { infoX: 1.0, infoY: 0.0, annotationX: 0.5, annotationY: 0.5 },
          onPlacementChanged: () => {},
          showMacroInformation: false,
          showOverlayAnnotations: true,
        }),
      );

      expect(html).not.toContain('data-testid="preview-info-container"');
      expect(html).toContain('data-testid="preview-annotation-container"');
    });
  });

  describe('OverlayWindowView', () => {
    it('renders concurrent macro cards and annotations in click-through surface', () => {
      const macros = [
        {
          macroId: 'm-1',
          macroName: 'Macro 1',
          state: 'Playing' as const,
          actionText: 'Action 1',
          visible: true,
        },
        {
          macroId: 'm-2',
          macroName: 'Macro 2',
          state: 'Playing' as const,
          actionText: 'Action 2',
          visible: true,
        },
      ];

      const annotations = [
        {
          annotationId: 'ann-1',
          macroId: 'm-1',
          macroName: 'Macro 1',
          text: 'Prompt 1',
          remainingSeconds: 2,
          visible: true,
        },
      ];

      const html = renderToString(
        React.createElement(OverlayWindowView, {
          macros,
          annotations,
          isCountdownVisible: true,
          countdownNumber: 3,
        }),
      );

      expect(html).toContain('data-testid="overlay-window-view"');
      expect(html).toContain('data-testid="overlay-macro-info-list"');
      expect(html).toContain('data-testid="overlay-annotation-list"');
      expect(html).toContain('data-testid="countdown-host"');

      expect(html).toContain('Macro 1');
      expect(html).toContain('Macro 2');
      expect(html).toContain('Prompt 1');
      expect(html).toContain('3');
      expect(html).toContain('pointer-events-none');
    });
  });
});
