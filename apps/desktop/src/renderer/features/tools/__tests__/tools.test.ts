/**
 * @macro-recorder/desktop - Tools Feature Tests
 * Tests for all 5 inspector tools:
 * - WindowInspector
 * - PixelInspector
 * - PixelPicker
 * - KeyCodeInspector
 * - GamepadTester
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  WindowInspector,
  PixelInspector,
  PixelPicker,
  KeyCodeInspector,
  GamepadTester,
} from '../index.js';

// Mock useApi hook
vi.mock('../../../hooks/useApi.js', () => ({
  useApi: () => ({
    invoke: vi.fn().mockResolvedValue({ success: true, data: null }),
    on: vi.fn().mockReturnValue(() => {}),
  }),
}));

describe('Tools Feature', () => {
  describe('WindowInspector', () => {
    it('renders window inspector with mouse follow and freeze instructions', () => {
      const html = renderToString(
        React.createElement(WindowInspector, {
          isOpen: true,
          onClose: () => {},
        }),
      );

      expect(html).toContain('Window inspector');
      expect(html).toContain('Follow mouse');
      expect(html).toContain('Hold Ctrl or Shift to freeze.');
      expect(html).toContain('Window');
      expect(html).toContain('Mouse');
      expect(html).toContain('Control under cursor');
      expect(html).toContain('Window position');
    });

    it('returns null when closed', () => {
      const html = renderToString(
        React.createElement(WindowInspector, {
          isOpen: false,
        }),
      );
      expect(html).toBe('');
    });
  });

  describe('PixelInspector', () => {
    it('renders pixel under cursor with hex and RGB display', () => {
      const html = renderToString(
        React.createElement(PixelInspector, {
          isOpen: true,
          onClose: () => {},
        }),
      );

      expect(html).toContain('Pixel under cursor');
      expect(html).toContain('F6 — copy. Hold Ctrl to freeze.');
      expect(html).toContain('Coordinates (screen)');
      expect(html).toContain('Window under cursor');
      expect(html).toContain('Copy (F6)');
    });
  });

  describe('PixelPicker', () => {
    it('renders floating capture bar with hotkey prompt and action buttons', () => {
      const html = renderToString(
        React.createElement(PixelPicker, {
          isOpen: true,
          hotkeyLabel: 'F10',
          onCapture: () => {},
          onCancel: () => {},
        }),
      );

      expect(html).toContain('Pixel color picker');
      expect(html).toContain('Point at a pixel and press ');
      expect(html).toContain('F10');
      expect(html).toContain('Cancel');
      expect(html).toContain('Capture');
    });
  });

  describe('KeyCodeInspector', () => {
    it('renders key codes inspection modes and fields', () => {
      const html = renderToString(
        React.createElement(KeyCodeInspector, {
          isOpen: true,
          onClose: () => {},
        }),
      );

      expect(html).toContain('Key codes');
      expect(html).toContain('Get code');
      expect(html).toContain('Key by code');
      expect(html).toContain('Press a key');
      expect(html).toContain('vk');
      expect(html).toContain('sc');
      expect(html).toContain('ext.');
      expect(html).toContain('Copy vk');
      expect(html).toContain('Copy sc');
    });
  });

  describe('GamepadTester', () => {
    it('renders controller monitor header and waiting state', () => {
      const html = renderToString(
        React.createElement(GamepadTester, {
          isOpen: true,
          onClose: () => {},
        }),
      );

      expect(html).toContain('Gamepad test');
      expect(html).toContain('Live state of connected pads (Xbox and DualShock 4). Handy while recording.');
      expect(html).toContain('No pad connected');
    });
  });
});
