/**
 * @macro-recorder/desktop - Settings View & Window
 * Complete application settings window.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  DEFAULT_APP_PREFERENCES,
} from '../../../../../../packages/contracts/src/preferences/preferences.js';
import { AppTheme, GamepadOutputType } from '../../../../../../packages/contracts/src/domain/enums.js';
import { Button } from '../../design-system/Button.js';
import { usePreferences } from '../../hooks/usePreferences.js';
import { useApi } from '../../hooks/useApi.js';
import { useLocalization } from '../../hooks/useLocalization.js';
import { useThemeContext } from '../../state/ThemeContext.js';
import type { LanguageCode } from '../../app/types.js';
import { useSystemCommands } from '../../hooks/systemCommands.js';
import { IpcChannels } from '../../../../../../packages/contracts/src/index.js';
import { SectionNavigation, resolveActiveSection } from './SectionNavigation.js';
import { InterfaceSettingsCard } from './InterfaceSettingsCard.js';
import { StartupSettingsCard } from './StartupSettingsCard.js';
import { StorageSettingsCard } from './StorageSettingsCard.js';
import { ControlsSettingsCard } from './ControlsSettingsCard.js';
import { OverlaySettingsCard } from './OverlaySettingsCard.js';
import { DebuggerSettingsCard } from './DebuggerSettingsCard.js';
import { ResetSettingsCard } from './ResetSettingsCard.js';
import type { SettingsSectionId, SettingsWindowProps, HotkeyFormState } from './types.js';

/** Quiet time after the last scroll event before a section jump counts as finished. */
const JUMP_SETTLE_MS = 150;

export function SettingsView({
  isOpen = true,
  onClose,
  focusHotkeyTag,
  macroHotkeys = [],
  probeAvailability,
  initialSection = 'interface',
  apiOverride,
  onLibraryRestored,
  onLibraryPathChanged,
}: SettingsWindowProps): React.ReactElement | null {
  const { preferences, patchPreferences, flushPreferences } = usePreferences({
    apiOverride,
  });

  const [activeSection, setActiveSection] = useState<SettingsSectionId>(initialSection);
  const api = useApi();
  const system = useSystemCommands();
  const { setMode } = useThemeContext();
  const { setLanguage } = useLocalization();
  const openToolWindow = useCallback((windowId: string) => {
    void api.invoke(IpcChannels.WINDOWS_OPEN, { requestId: `tool-${Date.now()}`, windowId });
  }, [api]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Local copy of preferences state
  const effectivePrefs = preferences ?? DEFAULT_APP_PREFERENCES;

  const hotkeysState: HotkeyFormState = {
    start: effectivePrefs.recordingStartHotkey,
    stop: effectivePrefs.recordingStopHotkey,
    pause: effectivePrefs.playbackPauseHotkey,
    emergency: effectivePrefs.emergencyStopHotkey,
    pixel: effectivePrefs.pixelCaptureHotkey,
    bindmap: effectivePrefs.bindMapHotkey,
  };

  // While a jump animates, the chosen section stays selected instead of every section passed on the way.
  const jumpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const endJump = useCallback(() => {
    if (jumpTimerRef.current) clearTimeout(jumpTimerRef.current);
    jumpTimerRef.current = null;
  }, []);

  const holdJump = useCallback(() => {
    if (jumpTimerRef.current) clearTimeout(jumpTimerRef.current);
    jumpTimerRef.current = setTimeout(endJump, JUMP_SETTLE_MS);
  }, [endJump]);

  useEffect(() => endJump, [endJump]);

  const handleSelectSection = useCallback((sectionId: SettingsSectionId) => {
    setActiveSection(sectionId);
    holdJump();
    document.getElementById(`section-${sectionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [holdJump]);

  // Click-through direct jump from BindMap or other windows
  useEffect(() => {
    if (focusHotkeyTag) handleSelectSection('controls');
  }, [focusHotkeyTag, handleSelectSection]);

  const handleScroll = useCallback(() => {
    if (jumpTimerRef.current) {
      holdJump();
      return;
    }
    const container = scrollRef.current;
    if (!container) return;
    // offsetTop would be measured from a distant ancestor, not from this scroll container.
    const viewportTop = container.getBoundingClientRect().top;
    const next = resolveActiveSection((id) => {
      const el = document.getElementById(`section-${id}`);
      return el ? el.getBoundingClientRect().top - viewportTop : null;
    });
    if (next) setActiveSection(next);
  }, [holdJump]);

  // Update handlers
  const handleLanguageChange = (code: string) => {
    setLanguage(code as LanguageCode);
    patchPreferences({ languageCode: code });
  };

  const handleThemeChange = (theme: AppTheme) => {
    setMode(theme === AppTheme.Light ? 'light' : 'dark');
    patchPreferences({ theme });
  };

  const handleStartWithWindowsChange = (enabled: boolean) => {
    patchPreferences({ startWithWindows: enabled });
  };

  const handleLibraryPathChange = (newPath: string) => {
    patchPreferences({ macroLibraryPath: newPath });
    onLibraryPathChanged?.(newPath);
  };

  const handleHotkeysChange = (nextHotkeys: HotkeyFormState) => {
    patchPreferences({
      recordingStartHotkey: nextHotkeys.start,
      recordingStopHotkey: nextHotkeys.stop,
      playbackPauseHotkey: nextHotkeys.pause,
      emergencyStopHotkey: nextHotkeys.emergency,
      pixelCaptureHotkey: nextHotkeys.pixel,
      bindMapHotkey: nextHotkeys.bindmap,
    });
  };

  const handleGamepadOutputChange = (type: GamepadOutputType) => {
    patchPreferences({ gamepadOutput: type });
  };

  const handleHideRealGamepadChange = (hide: boolean) => {
    patchPreferences({ hideRealGamepad: hide });
  };

  const handleResetPlacements = () => {
    patchPreferences({
      overlayInfoX: 1,
      overlayInfoY: 0,
      overlayAnnotationX: 1,
      overlayAnnotationY: 1,
    });
  };

  const handleResetConfirmed = async () => {
    const result = await system.resetApplication();
    if (!result.ok) throw new Error(result.error ?? 'Reset failed.');
  };

  if (!isOpen) return null;

  return (
    <div
      role="region"
      aria-label="Application settings"
      className="w-full h-full flex flex-col p-7 bg-[var(--color-window-bg)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] shadow-2xl select-none"
    >
      {/* Top Page Title */}
      <div className="pb-4">
        <h2 className="text-[22px] font-semibold text-[var(--color-text-primary)]">
          Application settings
        </h2>
      </div>

      {/* Main Grid: Sidebar + Scrollable Content */}
      <div className="flex-1 flex gap-5 overflow-hidden min-h-0">
        {/* Left Section Navigation (Reset is deliberately excluded!) */}
        <SectionNavigation
          activeSection={activeSection}
          onSelectSection={handleSelectSection}
        />

        {/* Right Scrollable Content */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          onWheel={endJump}
          onPointerDown={endJump}
          className="flex-1 overflow-y-auto pr-3 flex flex-col gap-8"
        >
          {/* 1. Interface */}
          <InterfaceSettingsCard
            currentLanguage={effectivePrefs.languageCode}
            currentTheme={effectivePrefs.theme}
            onLanguageChange={handleLanguageChange}
            onThemeChange={handleThemeChange}
          />

          {/* 2. Startup */}
          <StartupSettingsCard
            startWithWindows={effectivePrefs.startWithWindows}
            onChangeStartWithWindows={handleStartWithWindowsChange}
          />

          {/* 3. Storage */}
          <StorageSettingsCard
            currentLibraryPath={effectivePrefs.macroLibraryPath || 'default'}
            onLibraryPathChange={handleLibraryPathChange}
            onLibraryRestored={onLibraryRestored}
            apiOverride={apiOverride}
          />

          {/* 4. Controls */}
          <ControlsSettingsCard
            hotkeys={hotkeysState}
            onChangeHotkeys={handleHotkeysChange}
            macroHotkeys={macroHotkeys}
            probeAvailability={probeAvailability}
            focusHotkeyTag={focusHotkeyTag}
            gamepadOutput={effectivePrefs.gamepadOutput}
            onChangeGamepadOutput={handleGamepadOutputChange}
            hideRealGamepad={effectivePrefs.hideRealGamepad}
            onChangeHideRealGamepad={handleHideRealGamepadChange}
            onOpenGamepadTester={() => openToolWindow('GamepadTesterWindow')}
          />

          {/* 5. Overlay */}
          <OverlaySettingsCard
            overlayScalePercent={effectivePrefs.overlayScalePercent}
            onChangeOverlayScalePercent={(val) =>
              patchPreferences({ overlayScalePercent: val }, { coalesce: true })
            }
            overlayInfoTransparencyPercent={effectivePrefs.overlayInfoTransparencyPercent}
            onChangeOverlayInfoTransparencyPercent={(val) =>
              patchPreferences({ overlayInfoTransparencyPercent: val }, { coalesce: true })
            }
            showMacroInformation={effectivePrefs.showMacroInformation}
            onChangeShowMacroInformation={(val) =>
              patchPreferences({ showMacroInformation: val })
            }
            showOverlayState={effectivePrefs.showOverlayState}
            onChangeShowOverlayState={(val) =>
              patchPreferences({ showOverlayState: val })
            }
            showOverlayMacroName={effectivePrefs.showOverlayMacroName}
            onChangeShowOverlayMacroName={(val) =>
              patchPreferences({ showOverlayMacroName: val })
            }
            showOverlayCurrentAction={effectivePrefs.showOverlayCurrentAction}
            onChangeShowOverlayCurrentAction={(val) =>
              patchPreferences({ showOverlayCurrentAction: val })
            }
            showOverlaySchedule={effectivePrefs.showOverlaySchedule}
            onChangeShowOverlaySchedule={(val) =>
              patchPreferences({ showOverlaySchedule: val })
            }
            showOverlayLatency={effectivePrefs.showOverlayLatency}
            onChangeShowOverlayLatency={(val) =>
              patchPreferences({ showOverlayLatency: val })
            }
            showOverlayAnnotations={effectivePrefs.showOverlayAnnotations}
            onChangeShowOverlayAnnotations={(val) =>
              patchPreferences({ showOverlayAnnotations: val })
            }
            overlayAnnotationScalePercent={effectivePrefs.overlayAnnotationScalePercent}
            onChangeOverlayAnnotationScalePercent={(val) =>
              patchPreferences({ overlayAnnotationScalePercent: val }, { coalesce: true })
            }
            overlayAnnotationTransparencyPercent={effectivePrefs.overlayAnnotationTransparencyPercent}
            onChangeOverlayAnnotationTransparencyPercent={(val) =>
              patchPreferences({ overlayAnnotationTransparencyPercent: val }, { coalesce: true })
            }
            showOverlayAnnotationTiming={effectivePrefs.showOverlayAnnotationTiming}
            onChangeShowOverlayAnnotationTiming={(val) =>
              patchPreferences({ showOverlayAnnotationTiming: val })
            }
            onResetPlacements={handleResetPlacements}
          />

          {/* 6. Debugger (Tools & Log) */}
          <DebuggerSettingsCard
            onOpenPixelInspector={() => openToolWindow('PixelInspectorWindow')}
            onOpenLogFile={() => { void system.openLogFile(); }}
            onOpenLogFolder={() => { void system.openLogFolder(); }}
            onOpenKeyCodes={() => openToolWindow('KeyCodeInspectorWindow')}
            onOpenWindowInspector={() => openToolWindow('WindowInspectorWindow')}
          />

          {/* 7. Reset Section (Deliberately at bottom, absent from sidebar) */}
          <ResetSettingsCard
            libraryPath={effectivePrefs.macroLibraryPath || 'default'}
            onResetConfirmed={handleResetConfirmed}
          />
        </div>
      </div>

      {/* Bottom Action Footer */}
      <div className="pt-4 mt-2 flex items-center justify-between border-t border-[var(--color-border-subtle)]">
        <span className="text-[13px] text-[var(--color-text-secondary)]">
          Changes apply immediately and are saved for the next launch.
        </span>
        <Button
          variant="accent"
          size="md"
          onClick={() => {
            flushPreferences();
            onClose?.();
          }}
          className="min-w-[112px]"
          autoFocus
        >
          Done
        </Button>
      </div>

      {/* Auxiliary Inspector Tools Floating Windows */}
    </div>
  );
}

export const SettingsWindow = SettingsView;
