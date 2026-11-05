/**
 * Overlay card override resolution and visibility rules.
 */

import { resolveOverlayCardOverride as contractResolve } from '../../../contracts/src/index.js';
import { type MacroDefinition, OverlayCardOverride, type PlaybackOptions } from './types.js';

/**
 * Resolves effective card visibility for a specific macro setting against the global application default.
 * ForceShow forces true, ForceHide forces false, Inherit adopts appDefault.
 */
export function resolveOverlayCardOverride(
  value: OverlayCardOverride,
  appDefault: boolean,
): boolean {
  return contractResolve(value, appDefault);
}

/**
 * Extension helper object matching extension method style syntax: value.Resolve(appDefault).
 */
export const OverlayCardOverrideHelper = {
  ...OverlayCardOverride,
  resolve: resolveOverlayCardOverride,
  Resolve: resolveOverlayCardOverride,
} as const;

/**
 * Resolves both Info card and Custom Text card visibility for a macro given application defaults.
 */
export function resolveMacroOverlayVisibility(
  target: MacroDefinition | { readonly playback: PlaybackOptions },
  appSettings: { readonly showInfoCard: boolean; readonly showCustomText: boolean },
): { readonly showInfoCard: boolean; readonly showCustomText: boolean } {
  return {
    showInfoCard: resolveOverlayCardOverride(
      target.playback.infoCardOverride,
      appSettings.showInfoCard,
    ),
    showCustomText: resolveOverlayCardOverride(
      target.playback.customTextOverride,
      appSettings.showCustomText,
    ),
  };
}
