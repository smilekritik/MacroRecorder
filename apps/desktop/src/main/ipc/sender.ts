/**
 * Sender frame and origin validation for Electron Main IPC.
 * Prevents forged senders, hijacked frames, and unauthorized cross-origin IPC invocations.
 */

import type { IpcMainInvokeEvent, WebContents, WebFrameMain } from 'electron';
import { IpcErrorCode } from './types.js';

export interface SenderValidationSuccess {
  readonly valid: true;
  readonly webContents: WebContents;
  readonly frame: WebFrameMain;
  readonly url: string;
  readonly processId?: number | undefined;
}

export interface SenderValidationFailure {
  readonly valid: false;
  readonly code: IpcErrorCode;
  readonly reason: string;
}

export type SenderValidationResult = SenderValidationSuccess | SenderValidationFailure;

export interface SenderValidationOptions {
  /**
   * Additional allowed origins or URL prefixes besides standard file:// and app:// schemes.
   */
  readonly allowedOrigins?: readonly string[] | undefined;
  /**
   * Whether local Vite dev server URLs (e.g. http://localhost:5173) are permitted.
   * Defaults to true in development, false in production.
   */
  readonly allowDevServer?: boolean | undefined;
}

const DEFAULT_DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'] as const;

/**
 * Validates that an incoming IPC invoke event originated from a trusted, non-destroyed application frame.
 */
export function validateSender(
  event: IpcMainInvokeEvent,
  options: SenderValidationOptions = {},
): SenderValidationResult {
  // 1. Check sender WebContents lifecycle
  if (!event.sender || event.sender.isDestroyed()) {
    return {
      valid: false,
      code: IpcErrorCode.PERMISSION_DENIED,
      reason: 'Rejected IPC invocation from destroyed or missing WebContents sender',
    };
  }

  // 2. Check sender frame lifecycle
  const frame = event.senderFrame;
  if (!frame) {
    return {
      valid: false,
      code: IpcErrorCode.PERMISSION_DENIED,
      reason: 'Rejected IPC invocation from detached or invalid senderFrame',
    };
  }

  // 3. Check frame URL against allowed origins
  const frameUrl = frame.url;
  if (!frameUrl || typeof frameUrl !== 'string') {
    return {
      valid: false,
      code: IpcErrorCode.PERMISSION_DENIED,
      reason: 'Rejected IPC invocation with empty or missing frame URL',
    };
  }

  // Reject dangerous pseudo-protocols unconditionally
  const lowerUrl = frameUrl.toLowerCase();
  if (
    lowerUrl.startsWith('javascript:') ||
    lowerUrl.startsWith('data:') ||
    lowerUrl.startsWith('vbscript:') ||
    lowerUrl === 'about:blank'
  ) {
    return {
      valid: false,
      code: IpcErrorCode.PERMISSION_DENIED,
      reason: `Rejected IPC invocation from forbidden URL scheme: ${frameUrl}`,
    };
  }

  // Determine allowed URL criteria
  const isDev = process.env.NODE_ENV !== 'production';
  const allowDev = options.allowDevServer ?? isDev;

  const isAppScheme = lowerUrl.startsWith('file:') || lowerUrl.startsWith('app:');
  const isDevOrigin =
    allowDev &&
    DEFAULT_DEV_ORIGINS.some((devOrigin) => lowerUrl.startsWith(devOrigin));
  const isCustomAllowed =
    options.allowedOrigins?.some((allowed) => lowerUrl.startsWith(allowed.toLowerCase())) ?? false;

  if (!isAppScheme && !isDevOrigin && !isCustomAllowed) {
    return {
      valid: false,
      code: IpcErrorCode.PERMISSION_DENIED,
      reason: `Untrusted sender URL origin "${frameUrl}". Only application frames may invoke IPC.`,
    };
  }

  // 4. Validate process ID if available
  let processId: number | undefined;
  try {
    // WebFrameMain.processId is a Chromium routing ID, not the operating-system PID.
    processId = event.sender.getProcessId();
    if (frame.processId !== undefined && processId !== undefined && frame.processId !== processId) {
      return {
        valid: false,
        code: IpcErrorCode.PERMISSION_DENIED,
        reason: `Mismatched frame processId (${frame.processId}) and WebContents processId (${processId})`,
      };
    }
  } catch {
    // getProcessId may throw if renderer crashed mid-flight
  }

  return {
    valid: true,
    webContents: event.sender,
    frame,
    url: frameUrl,
    ...(processId !== undefined ? { processId } : {}),
  };
}
