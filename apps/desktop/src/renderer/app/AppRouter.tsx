/**
 * @macro-recorder/desktop - Application Route Dispatcher
 * Parses window routing from window.location.search, hash, or overrides.
 * Renders the designated legacy window surface with 1-to-1 fidelity (all 20 surfaces).
 */

import React, { useLayoutEffect, useMemo } from 'react';
import { MainWindowView } from './MainWindowView.js';
import { BindMapWindowView } from './BindMapWindowView.js';
import { SettingsWindowView } from './SettingsWindowView.js';
import {
  GamepadTesterWindowView,
  KeyCodeInspectorWindowView,
  PixelInspectorWindowView,
  PixelPickerWindowView,
  WindowInspectorWindowView,
} from './InspectorWindowViews.js';
import {
  FloatingToolbarWindowView,
  OverlayWindowViewWrapper,
  OverlayPlacementWindowViewWrapper,
} from './OverlayWindowViews.js';
import {
  AddActionWindowView,
  AlreadyRunningWindowView,
  ChoiceWindowView,
  ConfirmDeleteWindowView,
  ConfirmImportWindowView,
  FirstRunWindowView,
  ImportReportWindowView,
  TextPromptWindowView,
  WelcomeWindowView,
} from './DialogWindowViews.js';
import type { MainWindowTab } from './types.js';
import type { SettingsSectionId } from '../features/settings/types.js';

const TRANSPARENT_WINDOWS = new Set(['OverlayWindow', 'OverlayPlacementWindow', 'FloatingToolbarWindow']);

export interface AppRouterProps {
  readonly routeOverride?: string | undefined;
  readonly paramsOverride?: Readonly<Record<string, string>> | undefined;
}

/**
 * Normalizes case-insensitive and hyphenated window IDs to standard canonical IDs.
 */
function normalizeWindowId(rawId: string | null | undefined): string {
  if (!rawId) return 'MainWindow';
  const clean = rawId.trim().toLowerCase().replace(/[-_]/g, '');

  switch (clean) {
    case 'main':
    case 'mainwindow':
      return 'MainWindow';
    case 'bindmap':
    case 'bindmapwindow':
      return 'BindMapWindow';
    case 'settings':
    case 'settingswindow':
      return 'SettingsWindow';
    case 'floatingtoolbar':
    case 'floatingtoolbarwindow':
      return 'FloatingToolbarWindow';
    case 'gamepadtester':
    case 'gamepadtesterwindow':
      return 'GamepadTesterWindow';
    case 'keycodeinspector':
    case 'keycodeinspectorwindow':
      return 'KeyCodeInspectorWindow';
    case 'pixelinspector':
    case 'pixelinspectorwindow':
      return 'PixelInspectorWindow';
    case 'pixelpicker':
    case 'pixelpickerwindow':
      return 'PixelPickerWindow';
    case 'windowinspector':
    case 'windowinspectorwindow':
      return 'WindowInspectorWindow';
    case 'overlay':
    case 'overlaywindow':
      return 'OverlayWindow';
    case 'overlayplacement':
    case 'overlayplacementwindow':
      return 'OverlayPlacementWindow';
    case 'addaction':
    case 'addactionwindow':
      return 'AddActionWindow';
    case 'alreadyrunning':
    case 'alreadyrunningwindow':
      return 'AlreadyRunningWindow';
    case 'choice':
    case 'choicewindow':
      return 'ChoiceWindow';
    case 'confirmdelete':
    case 'confirmdeletewindow':
      return 'ConfirmDeleteWindow';
    case 'confirmimport':
    case 'confirmimportwindow':
      return 'ConfirmImportWindow';
    case 'firstrun':
    case 'firstrunwindow':
      return 'FirstRunWindow';
    case 'importreport':
    case 'importreportwindow':
      return 'ImportReportWindow';
    case 'textprompt':
    case 'textpromptwindow':
      return 'TextPromptWindow';
    case 'welcome':
    case 'welcomewindow':
      return 'WelcomeWindow';
    default:
      return rawId;
  }
}

export function AppRouter({
  routeOverride,
  paramsOverride,
}: AppRouterProps): React.ReactElement {
  const { windowId, params } = useMemo(() => {
    if (routeOverride !== undefined) {
      return {
        windowId: normalizeWindowId(routeOverride),
        params: paramsOverride ?? {},
      };
    }

    if (typeof window === 'undefined') {
      return {
        windowId: 'MainWindow',
        params: {},
      };
    }

    const searchParams = new URLSearchParams(window.location.search);
    const rawId =
      searchParams.get('windowId') ??
      searchParams.get('window') ??
      (window.location.hash ? window.location.hash.replace(/^#\/?/, '') : 'MainWindow');

    const parsedParams: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      parsedParams[key] = value;
    });

    return {
      windowId: normalizeWindowId(rawId),
      params: parsedParams,
    };
  }, [routeOverride, paramsOverride]);

  // The page is transparent until this runs: overlays float over the desktop and must never
  // paint a background, even while they load. The other windows get theirs here.
  useLayoutEffect(() => {
    if (!TRANSPARENT_WINDOWS.has(windowId)) {
      document.body.style.backgroundColor = 'var(--color-window-bg)';
    }
  }, [windowId]);

  switch (windowId) {
    case 'BindMapWindow':
      return <BindMapWindowView />;

    case 'SettingsWindow': {
      const initialSection = (params['section'] as SettingsSectionId | undefined) ?? 'interface';
      return <SettingsWindowView initialSection={initialSection} />;
    }

    case 'FloatingToolbarWindow':
      return <FloatingToolbarWindowView />;

    case 'GamepadTesterWindow':
      return <GamepadTesterWindowView />;

    case 'KeyCodeInspectorWindow':
      return <KeyCodeInspectorWindowView />;

    case 'PixelInspectorWindow':
      return <PixelInspectorWindowView />;

    case 'PixelPickerWindow':
      return <PixelPickerWindowView />;

    case 'WindowInspectorWindow':
      return <WindowInspectorWindowView />;

    case 'OverlayWindow':
      return <OverlayWindowViewWrapper />;

    case 'OverlayPlacementWindow':
      return <OverlayPlacementWindowViewWrapper />;

    case 'AddActionWindow':
      return <AddActionWindowView />;

    case 'AlreadyRunningWindow':
      return <AlreadyRunningWindowView />;

    case 'ChoiceWindow':
      return <ChoiceWindowView />;

    case 'ConfirmDeleteWindow':
      return <ConfirmDeleteWindowView />;

    case 'ConfirmImportWindow':
      return <ConfirmImportWindowView />;

    case 'FirstRunWindow':
      return <FirstRunWindowView />;

    case 'ImportReportWindow':
      return <ImportReportWindowView />;

    case 'TextPromptWindow':
      return <TextPromptWindowView />;

    case 'WelcomeWindow':
      return <WelcomeWindowView />;

    case 'MainWindow':
    default: {
      const initialTab = (params['tab'] as MainWindowTab | undefined) ?? 'editor';
      const initialMacroId = params['macroId'] ?? undefined;
      return <MainWindowView initialTab={initialTab} initialMacroId={initialMacroId} />;
    }
  }
}
