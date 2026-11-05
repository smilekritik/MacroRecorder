/**
 * @macro-recorder/desktop - Dedicated Overlay Window Views
 * Covers:
 * - UI-WIN-004 FloatingToolbarWindow
 * - UI-WIN-010 OverlayWindow
 * - UI-WIN-011 OverlayPlacementWindow
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FloatingToolbar } from '../features/overlays/FloatingToolbar.js';
import { OverlayWindowView } from '../features/overlays/OverlayWindowView.js';
import { OverlayPlacementPreview } from '../features/overlays/OverlayPlacementPreview.js';
import { useOverlayState } from '../features/overlays/useOverlayState.js';
import { useApi } from '../hooks/useApi.js';
import { usePreferences } from '../hooks/usePreferences.js';
import { useSystemCommands } from '../hooks/systemCommands.js';
import { usePlaybackController } from '../features/playback/usePlaybackController.js';
import { IpcChannels } from '../../../../../packages/contracts/src/index.js';
import type { OverlayPlacementState } from '../features/overlays/types.js';

export function FloatingToolbarWindowView(): React.ReactElement {
  const api = useApi();
  const playback = usePlaybackController();

  const handleClose = useCallback(() => {
    void api.invoke(IpcChannels.WINDOWS_CLOSE, {
      requestId: `close-${Date.now()}`,
      windowId: 'FloatingToolbarWindow',
    });
  }, [api]);

  return (
    <div className="h-screen w-screen bg-transparent select-none overflow-hidden flex items-center justify-center">
      <FloatingToolbar
        engineState="Recording"
        isRecording={true}
        isPaused={playback.engineState === 'Paused'}
        onRecord={() => undefined}
        onPause={() => {
          void api.invoke(IpcChannels.RECORDING_PAUSE, { requestId: `toolbar-pause-${Date.now()}` });
        }}
        onStop={() => {
          void api.invoke(IpcChannels.RECORDING_STOP, { requestId: `toolbar-stop-${Date.now()}` });
        }}
        onClose={handleClose}
      />
    </div>
  );
}

export function OverlayWindowViewWrapper(): React.ReactElement {
  const overlayState = useOverlayState();

  return (
    <div className="h-screen w-screen bg-transparent select-none overflow-hidden pointer-events-none">
      <OverlayWindowView
        macros={overlayState.macros}
        annotations={overlayState.annotations}
        countdownNumber={overlayState.countdownNumber}
        isCountdownVisible={overlayState.isCountdownVisible}
        placement={overlayState.placement}
        scalePercent={overlayState.scalePercent}
        transparencyPercent={overlayState.transparencyPercent}
        annotationScalePercent={overlayState.annotationScalePercent}
        annotationTransparencyPercent={overlayState.annotationTransparencyPercent}
        showMacroInformation={overlayState.showMacroInformation}
        showOverlayAnnotations={overlayState.showOverlayAnnotations}
        showOverlayAnnotationTiming={overlayState.showOverlayAnnotationTiming}
      />
    </div>
  );
}

export function OverlayPlacementWindowViewWrapper(): React.ReactElement {
  const overlayState = useOverlayState();
  const api = useApi();
  const system = useSystemCommands();
  const { preferences } = usePreferences();
  const [placement, setPlacement] = useState<OverlayPlacementState>(overlayState.placement);
  const defaultPlacement = useRef(overlayState.placement);

  useEffect(() => {
    if (!preferences) return;
    setPlacement({
      infoX: preferences.overlayInfoX,
      infoY: preferences.overlayInfoY,
      annotationX: preferences.overlayAnnotationX,
      annotationY: preferences.overlayAnnotationY,
    });
  }, [preferences]);

  // Later changes, such as "Reset to default placement", arrive with the overlay state.
  useEffect(() => {
    if (overlayState.placement !== defaultPlacement.current) setPlacement(overlayState.placement);
  }, [overlayState.placement]);

  // The window covers the desktop: only the sample cards may take the mouse, so that
  // Settings and everything else underneath stay usable while it is open.
  useEffect(() => {
    let overCard = false;
    const onMove = (event: MouseEvent) => {
      // The pointer can outrun a card during a drag, which must keep the mouse.
      if (event.buttons !== 0) return;
      const onCard = (event.target as Element | null)?.closest?.('[data-testid^="preview-"][data-testid$="-container"]') != null;
      if (onCard !== overCard) {
        overCard = onCard;
        void system.setMouseThrough('OverlayPlacementWindow', !onCard);
      }
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [system]);

  const handlePlacementChanged = useCallback(
    (newPlacement: OverlayPlacementState) => {
      setPlacement(newPlacement);
      void api.invoke(IpcChannels.OVERLAY_SET_PLACEMENT, {
        requestId: `placement-${Date.now()}`,
        infoX: newPlacement.infoX,
        infoY: newPlacement.infoY,
        annotationX: newPlacement.annotationX,
        annotationY: newPlacement.annotationY,
      });
    },
    [api],
  );

  return (
    <div className="h-screen w-screen bg-transparent select-none overflow-hidden">
      <OverlayPlacementPreview
        placement={placement}
        onPlacementChanged={handlePlacementChanged}
        fieldConfig={overlayState.fieldConfig}
        scalePercent={overlayState.scalePercent}
        transparencyPercent={overlayState.transparencyPercent}
        annotationScalePercent={overlayState.annotationScalePercent}
        annotationTransparencyPercent={overlayState.annotationTransparencyPercent}
        showMacroInformation={overlayState.showMacroInformation}
        showOverlayAnnotations={overlayState.showOverlayAnnotations}
        showOverlayAnnotationTiming={overlayState.showOverlayAnnotationTiming}
      />
    </div>
  );
}
