/**
 * Shared timeline builder for script and third-party importers.
 */

import {
  InputDevice,
  MacroEventType,
  MouseButton,
  type MacroImportWarning,
} from '../../../../packages/contracts/src/index.js';
import { MacroEventModel } from '../../../../packages/domain/src/model/index.js';

export class ScriptTimelineBuilder {
  public readonly events: MacroEventModel[] = [];
  public readonly variables: Map<string, number> = new Map<string, number>();
  public readonly warnings: MacroImportWarning[];
  public timeUs = 0;
  public keyDelayUs = 0;
  public keyDurationUs = 0;
  public mouseDelayUs = 0;

  public constructor(warnings?: MacroImportWarning[]) {
    this.warnings = warnings ?? [];
  }

  public warn(line: number | null | undefined, message: string): void {
    this.warnings.push({ line, message });
  }

  /** Standalone comment line becomes a Comment row in the timeline. */
  public commentRow(text: string): void {
    if (!text || text.trim().length === 0) {
      return;
    }
    this.events.push(
      new MacroEventModel({
        timeMicroseconds: this.timeUs,
        type: MacroEventType.Comment,
        text: text.trim(),
        comment: '',
      }),
    );
  }

  /** Line's trailing comment is attached to its first non-comment action. */
  public attachComment(text: string, producedFrom: number, allowCommentRows: boolean): void {
    if (!text || text.trim().length === 0) {
      return;
    }
    const clean = text.trim();
    for (let i = producedFrom; i < this.events.length; i++) {
      if (this.events[i]!.type === MacroEventType.Comment) {
        continue;
      }
      this.events[i]!.comment = clean;
      return;
    }
    if (allowCommentRows) {
      this.commentRow(clean);
    }
  }

  public key(vk: number, down: boolean): void {
    this.events.push(
      new MacroEventModel({
        timeMicroseconds: this.timeUs,
        device: InputDevice.Keyboard,
        type: down ? MacroEventType.KeyDown : MacroEventType.KeyUp,
        virtualKey: vk,
        scanCode: 0,
        extended: false,
        comment: '',
      }),
    );
  }

  public keyPress(vk: number): void {
    this.key(vk, true);
    this.timeUs += this.keyDurationUs;
    this.key(vk, false);
    this.timeUs += this.keyDelayUs;
  }

  public mouse(button: MouseButton, down: boolean): void {
    this.events.push(
      new MacroEventModel({
        timeMicroseconds: this.timeUs,
        device: InputDevice.Mouse,
        type: down ? MacroEventType.MouseButtonDown : MacroEventType.MouseButtonUp,
        button,
        comment: '',
      }),
    );
  }

  public mouseClick(button: MouseButton): void {
    this.mouse(button, true);
    this.timeUs += this.mouseDelayUs;
    this.mouse(button, false);
  }

  /** Screen coordinates: absoluteMove takes part in DPI rescaling on import. */
  public moveTo(x: number, y: number): void {
    this.events.push(
      new MacroEventModel({
        timeMicroseconds: this.timeUs,
        device: InputDevice.Mouse,
        type: MacroEventType.MouseMove,
        absoluteMove: true,
        deltaX: x,
        deltaY: y,
        comment: '',
      }),
    );
  }

  public wheel(horizontal: boolean, delta: number): void {
    this.events.push(
      new MacroEventModel({
        timeMicroseconds: this.timeUs,
        device: InputDevice.Mouse,
        type: horizontal ? MacroEventType.HorizontalWheel : MacroEventType.Wheel,
        wheelDelta: delta,
        comment: '',
      }),
    );
  }

  public typeText(text: string): void {
    this.events.push(
      new MacroEventModel({
        timeMicroseconds: this.timeUs,
        device: InputDevice.Keyboard,
        type: MacroEventType.TypeText,
        text,
        comment: '',
      }),
    );
  }
}
