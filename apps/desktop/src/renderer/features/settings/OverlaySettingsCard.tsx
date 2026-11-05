/**
 * @macro-recorder/desktop - Overlay Settings Card
 * Desktop overlay position calibration, scale, transparency, and field toggles.
 */

import React from 'react';
import { Button } from '../../design-system/Button.js';
import { Checkbox } from '../../design-system/Checkbox.js';
import { Slider } from '../../design-system/Slider.js';

export interface OverlaySettingsCardProps {
  readonly overlayScalePercent: number;
  readonly onChangeOverlayScalePercent: (val: number) => void;
  readonly overlayInfoTransparencyPercent: number;
  readonly onChangeOverlayInfoTransparencyPercent: (val: number) => void;
  readonly showMacroInformation: boolean;
  readonly onChangeShowMacroInformation: (val: boolean) => void;
  readonly showOverlayState: boolean;
  readonly onChangeShowOverlayState: (val: boolean) => void;
  readonly showOverlayMacroName: boolean;
  readonly onChangeShowOverlayMacroName: (val: boolean) => void;
  readonly showOverlayCurrentAction: boolean;
  readonly onChangeShowOverlayCurrentAction: (val: boolean) => void;
  readonly showOverlaySchedule: boolean;
  readonly onChangeShowOverlaySchedule: (val: boolean) => void;
  readonly showOverlayLatency: boolean;
  readonly onChangeShowOverlayLatency: (val: boolean) => void;

  readonly showOverlayAnnotations: boolean;
  readonly onChangeShowOverlayAnnotations: (val: boolean) => void;
  readonly overlayAnnotationScalePercent: number;
  readonly onChangeOverlayAnnotationScalePercent: (val: number) => void;
  readonly overlayAnnotationTransparencyPercent: number;
  readonly onChangeOverlayAnnotationTransparencyPercent: (val: number) => void;
  readonly showOverlayAnnotationTiming: boolean;
  readonly onChangeShowOverlayAnnotationTiming: (val: boolean) => void;

  readonly onResetPlacements: () => void;
}

export function OverlaySettingsCard({
  overlayScalePercent,
  onChangeOverlayScalePercent,
  overlayInfoTransparencyPercent,
  onChangeOverlayInfoTransparencyPercent,
  showMacroInformation,
  onChangeShowMacroInformation,
  showOverlayState,
  onChangeShowOverlayState,
  showOverlayMacroName,
  onChangeShowOverlayMacroName,
  showOverlayCurrentAction,
  onChangeShowOverlayCurrentAction,
  showOverlaySchedule,
  onChangeShowOverlaySchedule,
  showOverlayLatency,
  onChangeShowOverlayLatency,

  showOverlayAnnotations,
  onChangeShowOverlayAnnotations,
  overlayAnnotationScalePercent,
  onChangeOverlayAnnotationScalePercent,
  overlayAnnotationTransparencyPercent,
  onChangeOverlayAnnotationTransparencyPercent,
  showOverlayAnnotationTiming,
  onChangeShowOverlayAnnotationTiming,

  onResetPlacements,
}: OverlaySettingsCardProps): React.ReactElement {
  return (
    <section id="section-overlay" aria-label="Overlay" className="flex flex-col gap-4 select-none">
      <h3 className="text-[17px] font-semibold text-[var(--color-text-primary)]">
        Overlay
      </h3>

      {/* Screen Placement Card */}
      <div className="p-4 rounded-[10px] bg-[var(--color-surface)] border border-[var(--color-border-subtle)] flex flex-col gap-2.5">
        <span className="text-[15px] font-semibold text-[var(--color-text-primary)]">
          Screen placement
        </span>
        <p className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
          While settings are open, two sample cards appear on the desktop. Drag each card directly to the desired screen position; coordinates are saved automatically.
        </p>
        <div className="pt-1">
          <Button variant="base" size="sm" onClick={onResetPlacements}>
            Reset to default placement
          </Button>
        </div>
      </div>

      {/* Two Column Overlays Cards */}
      <div className="grid grid-cols-2 gap-4">
        {/* Playback Information Card */}
        <div className="p-4 rounded-[10px] bg-[var(--color-surface)] border border-[var(--color-border-subtle)] flex flex-col gap-3">
          <Checkbox
            checked={showMacroInformation}
            onChange={onChangeShowMacroInformation}
            label={
              <span className="flex flex-col">
                <span>Macro information</span>
                <span className="text-[12px] text-[var(--color-text-secondary)]">Playback information card</span>
              </span>
            }
          />

          <div className="flex flex-col gap-1 pt-1">
            <div className="flex justify-between text-[12px] text-[var(--color-text-secondary)]">
              <span>Card size</span>
              <span className="font-semibold">{overlayScalePercent}%</span>
            </div>
            <Slider
              value={overlayScalePercent}
              min={25}
              max={200}
              step={5}
              onChange={onChangeOverlayScalePercent}
              aria-label="Card size"
            />
          </div>

          <div className="flex flex-col gap-1 pt-1">
            <div className="flex justify-between text-[12px] text-[var(--color-text-secondary)]">
              <span>Background transparency</span>
              <span className="font-semibold">{overlayInfoTransparencyPercent}%</span>
            </div>
            <Slider
              value={overlayInfoTransparencyPercent}
              min={0}
              max={100}
              step={5}
              onChange={onChangeOverlayInfoTransparencyPercent}
              aria-label="Background transparency"
            />
            <span className="text-[11px] text-[var(--color-text-muted)]">
              100% — text and border only
            </span>
          </div>

          {/* Visible Fields */}
          <div className={`flex flex-col gap-2 pt-2 border-t border-[var(--color-border-subtle)] ${!showMacroInformation ? 'opacity-50 pointer-events-none' : ''}`}>
            <span className="text-[12px] font-semibold text-[var(--color-text-secondary)]">
              Visible fields
            </span>
            <Checkbox checked={showOverlayState} onChange={onChangeShowOverlayState} label="State" />
            <Checkbox checked={showOverlayMacroName} onChange={onChangeShowOverlayMacroName} label="Macro name" />
            <Checkbox checked={showOverlayCurrentAction} onChange={onChangeShowOverlayCurrentAction} label="Current key/action" />
            <Checkbox checked={showOverlaySchedule} onChange={onChangeShowOverlaySchedule} label="Scheduled time" />
            <Checkbox checked={showOverlayLatency} onChange={onChangeShowOverlayLatency} label="Jitter and confirmation" />
          </div>
        </div>

        {/* Custom Text Card */}
        <div className="p-4 rounded-[10px] bg-[var(--color-surface)] border border-[var(--color-border-subtle)] flex flex-col gap-3">
          <Checkbox
            checked={showOverlayAnnotations}
            onChange={onChangeShowOverlayAnnotations}
            label={
              <span className="flex flex-col">
                <span>Custom text</span>
                <span className="text-[12px] text-[var(--color-text-secondary)]">Prompts added by Text actions in the timeline</span>
              </span>
            }
          />

          <div className="flex flex-col gap-1 pt-1">
            <div className="flex justify-between text-[12px] text-[var(--color-text-secondary)]">
              <span>Prompt size</span>
              <span className="font-semibold">{overlayAnnotationScalePercent}%</span>
            </div>
            <Slider
              value={overlayAnnotationScalePercent}
              min={25}
              max={200}
              step={5}
              onChange={onChangeOverlayAnnotationScalePercent}
              aria-label="Prompt size"
            />
          </div>

          <div className="flex flex-col gap-1 pt-1">
            <div className="flex justify-between text-[12px] text-[var(--color-text-secondary)]">
              <span>Background transparency</span>
              <span className="font-semibold">{overlayAnnotationTransparencyPercent}%</span>
            </div>
            <Slider
              value={overlayAnnotationTransparencyPercent}
              min={0}
              max={100}
              step={5}
              onChange={onChangeOverlayAnnotationTransparencyPercent}
              aria-label="Background transparency"
            />
            <span className="text-[11px] text-[var(--color-text-muted)]">
              100% — text and border only
            </span>
          </div>

          <div className="pt-2 border-t border-[var(--color-border-subtle)] flex flex-col gap-2">
            <Checkbox
              checked={showOverlayAnnotationTiming}
              onChange={onChangeShowOverlayAnnotationTiming}
              label="Show remaining time"
            />
            <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed mt-1">
              Edit the text and display duration in the events of the selected macro. Configure its position, size, and visibility here.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
