/**
 * Window descriptors, inspection snapshots, and query types.
 */

import { boolean, integer, object, optional, string, type Schema } from '../common/validation.js';

export interface OpenWindowInfo {
  readonly handle: number;
  readonly title: string;
  readonly processName: string;
  readonly processId: number;
  readonly className?: string | undefined;
}

export const openWindowInfoSchema: Schema<OpenWindowInfo> = object({
  handle: integer(),
  title: string(),
  processName: string(),
  processId: integer(),
  className: optional(string()),
});

export interface WindowInspectionSnapshot {
  readonly isSelf: boolean;
  readonly title: string;
  readonly className: string;
  readonly processName: string;
  readonly processId: number;
  readonly mouseScreenX: number;
  readonly mouseScreenY: number;
  readonly mouseWindowX: number;
  readonly mouseWindowY: number;
  readonly mouseClientX: number;
  readonly mouseClientY: number;
  readonly rgb: number;
  readonly windowX: number;
  readonly windowY: number;
  readonly windowWidth: number;
  readonly windowHeight: number;
  readonly clientWidth: number;
  readonly clientHeight: number;
  readonly controlClass: string;
  readonly controlX: number;
  readonly controlY: number;
  readonly controlWidth: number;
  readonly controlHeight: number;
  readonly hex: string;
}

export const windowInspectionSnapshotSchema: Schema<WindowInspectionSnapshot> = object({
  isSelf: boolean(),
  title: string(),
  className: string(),
  processName: string(),
  processId: integer(),
  mouseScreenX: integer(),
  mouseScreenY: integer(),
  mouseWindowX: integer(),
  mouseWindowY: integer(),
  mouseClientX: integer(),
  mouseClientY: integer(),
  rgb: integer(),
  windowX: integer(),
  windowY: integer(),
  windowWidth: integer({ min: 0 }),
  windowHeight: integer({ min: 0 }),
  clientWidth: integer({ min: 0 }),
  clientHeight: integer({ min: 0 }),
  controlClass: string(),
  controlX: integer(),
  controlY: integer(),
  controlWidth: integer({ min: 0 }),
  controlHeight: integer({ min: 0 }),
  hex: string(),
});
