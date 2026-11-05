/**
 * WebContents security policies for Electron.
 * Strictly enforces:
 * - Default-deny navigation policy (will-navigate / will-redirect)
 * - Default-deny new-window policy (setWindowOpenHandler)
 * - Default-deny permission requests (setPermissionRequestHandler / setPermissionCheckHandler)
 * - Default-deny webview attachment (will-attach-webview)
 * - Default-deny external protocol handlers
 */

import type { Session, WebContents } from 'electron';

export interface SecurityPolicyOptions {
  /** Opens an allowed link in the default browser. Without it, every new window is refused. */
  openExternal?: (url: string) => void;
  /**
   * Explicitly permitted navigation prefixes.
   * Defaults to local app schemes (file://, app://) and dev server in development.
   */
  readonly allowedOrigins?: readonly string[] | undefined;
  /**
   * Whether local Vite dev server is allowed. Defaults to true in non-production.
   */
  readonly allowDevServer?: boolean | undefined;
}

const DEFAULT_DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'] as const;

/** Whether a link may leave the app for the default browser: only the author's GitHub pages. */
export function isAllowedExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname === 'github.com' &&
      /^\/smilekritik(\/|$)/.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}

/**
 * Validates whether a navigation target URL is within the authorized application boundaries.
 */
export function isAllowedNavigationUrl(url: string, options: SecurityPolicyOptions = {}): boolean {
  if (!url || typeof url !== 'string') return false;

  const lower = url.toLowerCase();

  // Deny dangerous pseudo-protocols unconditionally
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('about:blank')
  ) {
    return false;
  }

  // Allow application local packaged files
  if (lower.startsWith('file:') || lower.startsWith('app:')) {
    return true;
  }

  // Allow Vite dev server in development
  const isDev = process.env.NODE_ENV !== 'production';
  const allowDev = options.allowDevServer ?? isDev;
  if (allowDev && DEFAULT_DEV_ORIGINS.some((devOrigin) => lower.startsWith(devOrigin))) {
    return true;
  }

  // Check explicit whitelist if provided
  if (options.allowedOrigins?.some((allowed) => lower.startsWith(allowed.toLowerCase()))) {
    return true;
  }

  return false;
}

/**
 * Applies strict security policies to a WebContents instance.
 * Must be invoked whenever a BrowserWindow or renderer WebContents is created.
 */
export function configureWebContentsSecurity(
  webContents: WebContents,
  options: SecurityPolicyOptions = {},
): void {
  // 1. Deny window.open / new window creation by default
  webContents.setWindowOpenHandler((details) => {
    if (options.openExternal && isAllowedExternalUrl(details.url)) {
      options.openExternal(details.url);
      return { action: 'deny' };
    }
    console.warn(`[Security Policy] Blocked window.open request to: ${details.url}`);
    return { action: 'deny' };
  });

  // 2. Deny unauthorized navigation by default
  webContents.on('will-navigate', (event, navigationUrl) => {
    if (!isAllowedNavigationUrl(navigationUrl, options)) {
      event.preventDefault();
      console.warn(`[Security Policy] Blocked unauthorized navigation to: ${navigationUrl}`);
    }
  });

  // 3. Deny server redirects to unauthorized URLs by default
  webContents.on('will-redirect', (event, redirectUrl) => {
    if (!isAllowedNavigationUrl(redirectUrl, options)) {
      event.preventDefault();
      console.warn(`[Security Policy] Blocked unauthorized redirect to: ${redirectUrl}`);
    }
  });

  // 4. Deny webview attachment by default (preventing embedded untrusted content)
  webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
    console.warn('[Security Policy] Blocked <webview> attachment attempt');
  });

  // 5. Deny all web permissions by default on this WebContents' session
  if (webContents.session) {
    configureSessionSecurity(webContents.session);
  }
}

/**
 * Applies strict permission policies to an Electron Session.
 * Denies camera, microphone, geolocation, notifications, midi, and all other web permissions by default.
 */
export function configureSessionSecurity(session: Session): void {
  session.setPermissionRequestHandler((_webContents, permission, callback) => {
    // The copy buttons write to the clipboard; nothing else is ever needed.
    if (permission === 'clipboard-sanitized-write') {
      callback(true);
      return;
    }
    console.warn(`[Security Policy] Denied permission request for: ${permission}`);
    if (typeof callback === 'function') {
      callback(false);
    }
  });

  session.setPermissionCheckHandler((_webContents, permission) => {
    if (permission === 'clipboard-sanitized-write') return true;
    console.warn(`[Security Policy] Denied permission check for: ${permission}`);
    return false;
  });
}
