/**
 * @macro-recorder/desktop - Renderer App Subsystem
 * Complete multi-window composition, navigation, cross-window synchronization,
 * title bars, shortcuts, unsaved change policies, and error surfaces.
 */

export * from './types.js';
export * from './App.js';
export * from './AppRouter.js';
export * from './AppProviders.js';
export * from './AppErrorBoundary.js';
export * from './MainWindowView.js';
export * from './BindMapWindowView.js';
export * from './SettingsWindowView.js';
export * from './InspectorWindowViews.js';
export * from './OverlayWindowViews.js';
export * from './DialogWindowViews.js';
export * from './useCrossWindowStateSync.js';
export * from './useAppKeyboardShortcuts.js';
export * from './useUnsavedChangesPolicy.js';
export * from './useFocusRestoration.js';
export * from './useDpiBehavior.js';
