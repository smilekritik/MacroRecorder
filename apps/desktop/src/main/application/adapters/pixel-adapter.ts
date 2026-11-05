/**
 * Screen Pixel Color Sampling Adapter.
 * Samples RGB colors from screen coordinates for PixelColorTrigger, WaitForPixelGone,
 * and PixelPicker live inspector.
 */

import type { IPixelColorAdapter } from '../types.js';

export class NativePixelAdapter implements IPixelColorAdapter {
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

  public getPixelColorRgb(x: number, y: number): number {
    if (!this.nativeModule?.capturePixelAt) {
      throw new Error('Native pixel sampling is unavailable.');
    }
    const sample = this.nativeModule.capturePixelAt(x, y);
    if (!sample || typeof sample.rgb !== 'number') {
      throw new Error('Native pixel sampling returned an invalid result.');
    }
    return sample.rgb & 0xffffff;
  }

  public samplePixelColor(x: number, y: number): {
    rgb: number;
    hex: string;
    r: number;
    g: number;
    b: number;
  } {
    if (!this.nativeModule?.capturePixelAt) {
      throw new Error('Native pixel sampling is unavailable.');
    }
    const sample = this.nativeModule.capturePixelAt(x, y);
    if (!sample || typeof sample.rgb !== 'number') {
      throw new Error('Native pixel sampling returned an invalid result.');
    }
    const rgb = sample.rgb & 0xffffff;
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = rgb & 0xff;
    const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
    return { rgb, hex, r, g, b };
  }
}

/**
 * Deterministic In-Memory Fake Pixel Color Adapter.
 */
export class FakePixelAdapter implements IPixelColorAdapter {
  private defaultColor = 0;
  private readonly coordinateColors = new Map<string, number>();
  public readonly sampledCoordinates: Array<{ x: number; y: number }> = [];

  public setDefaultColor(rgb: number): void {
    this.defaultColor = rgb & 0xffffff;
  }

  public setColorAt(x: number, y: number, rgb: number): void {
    this.coordinateColors.set(`${x},${y}`, rgb & 0xffffff);
  }

  public getPixelColorRgb(x: number, y: number): number {
    this.sampledCoordinates.push({ x, y });
    const key = `${x},${y}`;
    if (this.coordinateColors.has(key)) {
      return this.coordinateColors.get(key)!;
    }
    return this.defaultColor;
  }

  public samplePixelColor(x: number, y: number): {
    rgb: number;
    hex: string;
    r: number;
    g: number;
    b: number;
  } {
    const rgb = this.getPixelColorRgb(x, y);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = rgb & 0xff;
    const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
    return { rgb, hex, r, g, b };
  }
}
