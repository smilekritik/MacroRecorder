/**
 * @macro-recorder/desktop - Overlay State Subscription Hook
 * Connects the renderer to IPC overlay push updates from the main process
 * and synchronizes live cards, countdown numbers, and placement coordinates.
 */

import { useEffect, useState } from 'react';
import { useApi } from '../../hooks/useApi.js';
import type {
  AnnotationCardData,
  OverlayPlacementState,
  StatusCardData,
  StatusCardFieldConfig,
} from './types.js';

export interface OverlayStateHookResult {
  readonly macros: readonly StatusCardData[];
  readonly annotations: readonly AnnotationCardData[];
  readonly countdownNumber: number | null;
  readonly isCountdownVisible: boolean;
  readonly placement: OverlayPlacementState;
  readonly scalePercent: number;
  readonly transparencyPercent: number;
  readonly annotationScalePercent: number;
  readonly annotationTransparencyPercent: number;
  readonly fieldConfig: StatusCardFieldConfig;
  readonly showMacroInformation: boolean;
  readonly showOverlayAnnotations: boolean;
  readonly showOverlayAnnotationTiming: boolean;
}

export function useOverlayState(initialState?: Partial<OverlayStateHookResult>): OverlayStateHookResult {
  const api = useApi();

  const [macros, setMacros] = useState<readonly StatusCardData[]>(initialState?.macros ?? []);
  const [annotations, setAnnotations] = useState<readonly AnnotationCardData[]>(
    initialState?.annotations ?? [],
  );
  const [countdownNumber, setCountdownNumber] = useState<number | null>(
    initialState?.countdownNumber ?? null,
  );
  const [isCountdownVisible, setIsCountdownVisible] = useState<boolean>(
    initialState?.isCountdownVisible ?? false,
  );

  const [placement, setPlacement] = useState<OverlayPlacementState>(
    initialState?.placement ?? {
      infoX: 1.0,
      infoY: 0.0,
      annotationX: 1.0,
      annotationY: 0.0,
    },
  );

  const [scalePercent, setScalePercent] = useState<number>(initialState?.scalePercent ?? 100);
  const [transparencyPercent, setTransparencyPercent] = useState<number>(
    initialState?.transparencyPercent ?? 0,
  );
  const [annotationScalePercent, setAnnotationScalePercent] = useState<number>(
    initialState?.annotationScalePercent ?? 100,
  );
  const [annotationTransparencyPercent, setAnnotationTransparencyPercent] = useState<number>(
    initialState?.annotationTransparencyPercent ?? 0,
  );

  const [fieldConfig, setFieldConfig] = useState<StatusCardFieldConfig>(
    initialState?.fieldConfig ?? {
      showState: true,
      showMacroName: true,
      showCurrentAction: true,
      showSchedule: true,
      showLatency: true,
    },
  );

  const [showMacroInformation, setShowMacroInformation] = useState<boolean>(
    initialState?.showMacroInformation ?? true,
  );
  const [showOverlayAnnotations, setShowOverlayAnnotations] = useState<boolean>(
    initialState?.showOverlayAnnotations ?? true,
  );
  const [showOverlayAnnotationTiming, setShowOverlayAnnotationTiming] = useState<boolean>(
    initialState?.showOverlayAnnotationTiming ?? true,
  );

  useEffect(() => {
    if (!api || typeof api.on !== 'function') {
      return;
    }

    const unsubState = api.on('overlay:state', (data: unknown) => {
      if (!data || typeof data !== 'object') return;
      const s = data as Record<string, unknown>;

      if (Array.isArray(s['macros'])) {
        setMacros(s['macros'] as readonly StatusCardData[]);
      }
      if (Array.isArray(s['annotations'])) {
        setAnnotations(s['annotations'] as readonly AnnotationCardData[]);
      }
      if ('countdownNumber' in s) {
        setCountdownNumber(
          typeof s['countdownNumber'] === 'number' ? (s['countdownNumber'] as number) : null,
        );
      }
      if (typeof s['isCountdownVisible'] === 'boolean') {
        setIsCountdownVisible(s['isCountdownVisible'] as boolean);
      }
      if (s['placement'] && typeof s['placement'] === 'object') {
        const p = s['placement'] as Record<string, number>;
        setPlacement({
          infoX: typeof p['infoX'] === 'number' ? p['infoX'] : 1.0,
          infoY: typeof p['infoY'] === 'number' ? p['infoY'] : 0.0,
          annotationX: typeof p['annotationX'] === 'number' ? p['annotationX'] : 1.0,
          annotationY: typeof p['annotationY'] === 'number' ? p['annotationY'] : 0.0,
        });
      }
      if (s['appearance'] && typeof s['appearance'] === 'object') {
        const a = s['appearance'] as Record<string, unknown>;
        if (typeof a['overlayScalePercent'] === 'number') {
          setScalePercent(a['overlayScalePercent'] as number);
        }
        if (typeof a['overlayInfoTransparencyPercent'] === 'number') {
          setTransparencyPercent(a['overlayInfoTransparencyPercent'] as number);
        }
        if (typeof a['overlayAnnotationScalePercent'] === 'number') {
          setAnnotationScalePercent(a['overlayAnnotationScalePercent'] as number);
        }
        if (typeof a['overlayAnnotationTransparencyPercent'] === 'number') {
          setAnnotationTransparencyPercent(a['overlayAnnotationTransparencyPercent'] as number);
        }
        if (typeof a['showMacroInformation'] === 'boolean') {
          setShowMacroInformation(a['showMacroInformation'] as boolean);
        }
        if (typeof a['showOverlayAnnotations'] === 'boolean') {
          setShowOverlayAnnotations(a['showOverlayAnnotations'] as boolean);
        }
        if (typeof a['showOverlayAnnotationTiming'] === 'boolean') {
          setShowOverlayAnnotationTiming(a['showOverlayAnnotationTiming'] as boolean);
        }
        setFieldConfig({
          showState: Boolean(a['showOverlayState'] ?? true),
          showMacroName: Boolean(a['showOverlayMacroName'] ?? true),
          showCurrentAction: Boolean(a['showOverlayCurrentAction'] ?? true),
          showSchedule: Boolean(a['showOverlaySchedule'] ?? true),
          showLatency: Boolean(a['showOverlayLatency'] ?? true),
        });
      }
    });

    void (api.invoke as unknown as (channel: string, request: Record<string, unknown>) => Promise<unknown>)(
      'system:command',
      { requestId: `overlay-ready-${Date.now()}`, command: 'overlayReady' },
    );

    return () => {
      unsubState();
    };
  }, [api]);

  return {
    macros,
    annotations,
    countdownNumber,
    isCountdownVisible,
    placement,
    scalePercent,
    transparencyPercent,
    annotationScalePercent,
    annotationTransparencyPercent,
    fieldConfig,
    showMacroInformation,
    showOverlayAnnotations,
    showOverlayAnnotationTiming,
  };
}
