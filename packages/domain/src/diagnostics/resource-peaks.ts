/**
 * Runtime resource peaks (CPU, GPU, RAM, Process Memory) tracking and formatting.
 */

import { type ResourcePeak, type ResourcePeakWire, type SystemLoadProbe } from './types.js';

export const emptyResourcePeak: ResourcePeak = {
  cpuPercent: null,
  gpuPercent: null,
  memoryPercent: 0,
  processMemoryMegabytes: 0,
};

function maxNullable(
  left: number | null | undefined,
  right: number | null | undefined,
): number | null {
  if (left == null) return right ?? null;
  if (right == null) return left;
  return Math.max(left, right);
}

/**
 * Creates a ResourcePeak object with validated parameters.
 */
export function createResourcePeak(params?: {
  readonly cpuPercent?: number | null | undefined;
  readonly gpuPercent?: number | null | undefined;
  readonly memoryPercent?: number | undefined;
  readonly processMemoryMegabytes?: number | undefined;
}): ResourcePeak {
  return {
    cpuPercent: params?.cpuPercent ?? null,
    gpuPercent: params?.gpuPercent ?? null,
    memoryPercent: params?.memoryPercent ?? 0,
    processMemoryMegabytes: params?.processMemoryMegabytes ?? 0,
  };
}

/**
 * Combines two resource peak samples, preserving the highest observed load for each metric.
 */
export function combineResourcePeaks(left: ResourcePeak, right: ResourcePeak): ResourcePeak {
  return {
    cpuPercent: maxNullable(left.cpuPercent, right.cpuPercent),
    gpuPercent: maxNullable(left.gpuPercent, right.gpuPercent),
    memoryPercent: Math.max(left.memoryPercent ?? 0, right.memoryPercent ?? 0),
    processMemoryMegabytes: Math.max(
      left.processMemoryMegabytes ?? 0,
      right.processMemoryMegabytes ?? 0,
    ),
  };
}

/**
 * Formats a resource percentage value:
 * Returns "—" (em dash) if null or undefined, or "XX.X %" with 1 decimal place.
 */
export function formatResourcePercent(value: number | null | undefined): string {
  return value == null ? '—' : `${value.toFixed(1)} %`;
}

/**
 * Formats memory percentage: "XX.X %".
 */
export function formatMemoryPercent(value: number): string {
  return `${(value ?? 0).toFixed(1)} %`;
}

/**
 * Formats process memory in megabytes: "XX.X MB".
 */
export function formatProcessMemoryMegabytes(value: number): string {
  return `${(value ?? 0).toFixed(1)} MB`;
}

/**
 * User-facing display string for peak CPU load.
 */
export function formatCpuText(peak: ResourcePeak): string {
  return formatResourcePercent(peak.cpuPercent);
}

/**
 * User-facing display string for peak GPU load.
 */
export function formatGpuText(peak: ResourcePeak): string {
  return formatResourcePercent(peak.gpuPercent);
}

/**
 * User-facing display string for peak system memory load.
 */
export function formatSystemMemoryText(peak: ResourcePeak): string {
  return formatMemoryPercent(peak.memoryPercent);
}

/**
 * User-facing display string for peak process memory working set.
 */
export function formatProcessMemoryText(peak: ResourcePeak): string {
  return formatProcessMemoryMegabytes(peak.processMemoryMegabytes);
}

/**
 * Serializes ResourcePeak to wire representation.
 */
export function resourcePeakToWire(peak: ResourcePeak): ResourcePeakWire {
  return {
    CpuPercent: peak.cpuPercent,
    GpuPercent: peak.gpuPercent,
    MemoryPercent: peak.memoryPercent,
    ProcessMemoryMegabytes: peak.processMemoryMegabytes,
  };
}

/**
 * Deserializes ResourcePeak from wire representation.
 */
export function resourcePeakFromWire(wire: ResourcePeakWire): ResourcePeak {
  return createResourcePeak({
    cpuPercent: wire.cpuPercent ?? wire.CpuPercent ?? null,
    gpuPercent: wire.gpuPercent ?? wire.GpuPercent ?? null,
    memoryPercent: wire.memoryPercent ?? wire.MemoryPercent ?? 0,
    processMemoryMegabytes: wire.processMemoryMegabytes ?? wire.ProcessMemoryMegabytes ?? 0,
  });
}

/**
 * Object-oriented model wrapper around ResourcePeak.
 * with LoadPeak record properties and methods.
 */
export class ResourcePeakModel implements ResourcePeak {
  public readonly cpuPercent: number | null;
  public readonly gpuPercent: number | null;
  public readonly memoryPercent: number;
  public readonly processMemoryMegabytes: number;

  public constructor(
    cpuPercentOrObj?: number | null | Partial<ResourcePeak> | ResourcePeakWire,
    gpuPercent?: number | null,
    memoryPercent?: number,
    processMemoryMegabytes?: number,
  ) {
    if (typeof cpuPercentOrObj === 'object' && cpuPercentOrObj !== null) {
      const obj = cpuPercentOrObj as Record<string, unknown>;
      this.cpuPercent = (obj['cpuPercent'] ?? obj['CpuPercent'] ?? null) as number | null;
      this.gpuPercent = (obj['gpuPercent'] ?? obj['GpuPercent'] ?? null) as number | null;
      this.memoryPercent = (obj['memoryPercent'] ?? obj['MemoryPercent'] ?? 0) as number;
      this.processMemoryMegabytes = (obj['processMemoryMegabytes'] ??
        obj['ProcessMemoryMegabytes'] ??
        0) as number;
    } else {
      this.cpuPercent = cpuPercentOrObj ?? null;
      this.gpuPercent = gpuPercent ?? null;
      this.memoryPercent = memoryPercent ?? 0;
      this.processMemoryMegabytes = processMemoryMegabytes ?? 0;
    }
  }

  public combine(other: ResourcePeak): ResourcePeakModel {
    const combined = combineResourcePeaks(this, other);
    return new ResourcePeakModel(combined);
  }

  public Combine(other: ResourcePeak): ResourcePeakModel {
    return this.combine(other);
  }

  public get cpuText(): string {
    return formatCpuText(this);
  }
  public get CpuText(): string {
    return this.cpuText;
  }

  public get gpuText(): string {
    return formatGpuText(this);
  }
  public get GpuText(): string {
    return this.gpuText;
  }

  public get systemMemoryText(): string {
    return formatSystemMemoryText(this);
  }
  public get SystemMemoryText(): string {
    return this.systemMemoryText;
  }

  public get processMemoryText(): string {
    return formatProcessMemoryText(this);
  }

  public toWire(): ResourcePeakWire {
    return resourcePeakToWire(this);
  }

  public static fromWire(wire: ResourcePeakWire): ResourcePeakModel {
    return new ResourcePeakModel(resourcePeakFromWire(wire));
  }

  public static get Empty(): ResourcePeakModel {
    return new ResourcePeakModel(emptyResourcePeak);
  }
}

/**
 * Mock or configurable implementation of SystemLoadProbe for testing and custom providers.
 */
export class MockSystemLoadProbe implements SystemLoadProbe {
  private _cpuPercent: number | null;
  private _gpuPercent: number | null;

  public constructor(cpuPercent: number | null = null, gpuPercent: number | null = null) {
    this._cpuPercent = cpuPercent;
    this._gpuPercent = gpuPercent;
  }

  public get cpuPercent(): number | null {
    return this._cpuPercent;
  }
  public set cpuPercent(value: number | null) {
    this._cpuPercent = value;
  }

  public get gpuPercent(): number | null {
    return this._gpuPercent;
  }
  public set gpuPercent(value: number | null) {
    this._gpuPercent = value;
  }

  public refresh(): void {
    // No-op for mock probe
  }
}

/**
 * Pluggable runtime load monitor.
 */
export class RuntimeLoadMonitor {
  private readonly _probe: SystemLoadProbe | null;

  public constructor(probe: SystemLoadProbe | null = null) {
    this._probe = probe;
  }

  /**
   * Samples current system and process load.
   */
  public sample(customMemorySample?: {
    memoryPercent?: number;
    processMemoryMegabytes?: number;
  }): ResourcePeakModel {
    try {
      this._probe?.refresh();
      let processMemory = customMemorySample?.processMemoryMegabytes ?? 0;
      const systemPercent = customMemorySample?.memoryPercent ?? 0;

      // In Node.js / Electron environments, attempt process.memoryUsage if available
      if (
        customMemorySample === undefined &&
        typeof process !== 'undefined' &&
        typeof process.memoryUsage === 'function'
      ) {
        const mem = process.memoryUsage();
        processMemory = mem.rss / 1024 / 1024;
      }

      return new ResourcePeakModel({
        cpuPercent: this._probe?.cpuPercent ?? null,
        gpuPercent: this._probe?.gpuPercent ?? null,
        memoryPercent: systemPercent,
        processMemoryMegabytes: processMemory,
      });
    } catch {
      return ResourcePeakModel.Empty;
    }
  }
}
