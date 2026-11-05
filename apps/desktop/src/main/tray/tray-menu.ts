/**
 * Tray context menu generation and localization.
 * Matches legacy Menu structure:
 * 1. Open Macro Recorder (default/bold action)
 * 2. Separator
 * 3. Floating toolbar
 * 4. Disable all macros
 * 5. Emergency stop ({hotkey})
 * 6. Separator
 * 7. Exit
 */

import { type MenuItemConstructorOptions } from 'electron';
import type { TrayCallbacks } from './types.js';

const TRAY_TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    open: 'Open Macro Recorder',
    toolbar: 'Floating toolbar',
    disableAll: 'Disable all macros',
    emergencyStop: 'Emergency stop ({0})',
    exit: 'Exit',
    tooltip: 'Macro Recorder — double-click to open the window',
  },
  ru: {
    open: 'Открыть Macro Recorder',
    toolbar: 'Плавающая панель',
    disableAll: 'Выключить все макросы',
    emergencyStop: 'Аварийный стоп ({0})',
    exit: 'Выход',
    tooltip: 'Macro Recorder — двойной щелчок открывает окно',
  },
};

export function getTrayString(
  key: keyof (typeof TRAY_TRANSLATIONS)['en'],
  language = 'en',
  arg?: string,
): string {
  const langKey = language?.toLowerCase().startsWith('ru') ? 'ru' : 'en';
  const catalog = TRAY_TRANSLATIONS[langKey] ?? TRAY_TRANSLATIONS['en'];
  const text = (catalog ? catalog[key] : undefined) ?? TRAY_TRANSLATIONS['en']?.[key] ?? '';
  if (arg !== undefined) {
    return text.replace('{0}', arg);
  }
  return text;
}

export function buildTrayMenuItems(
  callbacks: TrayCallbacks,
  emergencyStopHotkey = 'F10',
  language = 'en',
): MenuItemConstructorOptions[] {
  return [
    {
      label: getTrayString('open', language),
      click: () => callbacks.onOpenMainWindow(),
      // Bold or primary item
    },
    {
      type: 'separator',
    },
    {
      label: getTrayString('toolbar', language),
      click: () => callbacks.onToggleFloatingToolbar?.(),
    },
    {
      label: getTrayString('disableAll', language),
      click: async () => {
        if (callbacks.onDisableAllMacros) {
          await callbacks.onDisableAllMacros();
        }
      },
    },
    {
      label: getTrayString('emergencyStop', language, emergencyStopHotkey),
      click: () => callbacks.onEmergencyStop(),
    },
    {
      type: 'separator',
    },
    {
      label: getTrayString('exit', language),
      click: () => callbacks.onExit(),
    },
  ];
}
