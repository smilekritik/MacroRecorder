/**
 * Single-instance locking and second-instance file activation.
 * Enforces single process instance, manages \\.\pipe\MacroRecorder.ExternalCommands.v1 named pipe,
 * activates existing main window, and safely forwards supported files (.mrmacro, .mrbackup, etc.).
 */

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import type { App, BrowserWindow } from 'electron';
import { AppLog } from './logging.js';

export const INSTANCE_PIPE_NAME = 'MacroRecorder.ExternalCommands.v1';
export const WINDOWS_PIPE_PATH = `\\\\.\\pipe\\${INSTANCE_PIPE_NAME}`;

export const SUPPORTED_IMPORT_EXTENSIONS = new Set<string>([
  '.mrmacro',
  '.mrbackup',
  '.json',
  '.macro.json',
  '.ahk',
  '.amc',
  '.mrf',
  '.au3',
  '.xml',
  '.rec',
]);

/**
 * Checks if a given file path is supported for macro/backup import.
 */
export function isSupportedImportFile(filePath: string): boolean {
  if (!filePath || typeof filePath !== 'string') return false;
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.macro.json')) return true;
  const ext = path.extname(lower);
  return SUPPORTED_IMPORT_EXTENSIONS.has(ext);
}

/**
 * Extracts and normalizes supported file paths from command-line arguments.
 * Ignores flags starting with '--', validates existence, resolves full path, and deduplicates.
 */
export function extractExternalFiles(argv: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const arg of argv) {
    if (!arg || arg.startsWith('--')) continue;

    try {
      const fullPath = path.resolve(arg);
      const lower = fullPath.toLowerCase();
      if (!seen.has(lower) && fs.existsSync(fullPath) && isSupportedImportFile(fullPath)) {
        seen.add(lower);
        result.push(fullPath);
      }
    } catch {
      // Ignore invalid path formats
    }
  }

  return result;
}

export interface SingleInstanceCoordinatorOptions {
  readonly appInstance: App;
  readonly getMainWindow: () => BrowserWindow | null | undefined;
  readonly onFilesReceived?: (files: string[]) => void;
  readonly pipePath?: string | undefined;
}

export class SingleInstanceCoordinator {
  private readonly app: App;
  private readonly getMainWindow: () => BrowserWindow | null | undefined;
  private readonly onFilesReceived: ((files: string[]) => void) | undefined;
  private readonly pipePath: string;
  private pipeServer: net.Server | null = null;
  private hasLock = false;
  private pendingFiles: string[] = [];

  constructor(options: SingleInstanceCoordinatorOptions) {
    this.app = options.appInstance;
    this.getMainWindow = options.getMainWindow;
    this.onFilesReceived = options.onFilesReceived;
    this.pipePath =
      options.pipePath ??
      (process.platform === 'win32'
        ? WINDOWS_PIPE_PATH
        : path.join(this.app.getPath('temp'), `${INSTANCE_PIPE_NAME}.sock`));
  }

  /**
   * Attempts to acquire the primary single-instance lock.
   * Returns true if this process is the primary instance; false if a secondary instance.
   */
  public initializeLock(): boolean {
    this.hasLock = this.app.requestSingleInstanceLock();
    if (!this.hasLock) {
      return false;
    }

    // Listen for second-instance launches via Electron's built-in mechanism
    this.app.on('second-instance', (_event, commandLine) => {
      this.handleIncomingArguments(commandLine);
    });

    // Also listen on the named pipe for external processes and legacy compatibility
    this.startNamedPipeServer();

    return true;
  }

  /**
   * Starts the named pipe server to receive external command payloads.
   */
  public startNamedPipeServer(): void {
    try {
      // On POSIX, remove existing stale socket file if present
      if (process.platform !== 'win32' && fs.existsSync(this.pipePath)) {
        try {
          fs.unlinkSync(this.pipePath);
        } catch {
          // Stale socket removal best-effort
        }
      }

      this.pipeServer = net.createServer((socket) => {
        let rawData = '';

        socket.on('data', (chunk) => {
          rawData += chunk.toString('utf-8');
        });

        socket.on('end', () => {
          try {
            if (rawData.trim()) {
              const parsed = JSON.parse(rawData);
              if (Array.isArray(parsed)) {
                this.handleIncomingArguments(parsed as string[]);
              }
            }
          } catch (err) {
            AppLog.warn(
              `Failed to parse pipe command: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        });

        socket.on('error', (err) => {
          AppLog.warn(`Named pipe client error: ${err.message}`);
        });
      });

      this.pipeServer.on('error', (err) => {
        AppLog.warn(`Named pipe server error on ${this.pipePath}: ${err.message}`);
      });

      this.pipeServer.listen(this.pipePath);
    } catch (err) {
      AppLog.warn(
        `Failed to start named pipe server: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Sends arguments from a secondary instance to the primary instance over the named pipe.
   */
  public static async sendArgumentsToExistingInstance(
    argv: readonly string[],
    pipePath = process.platform === 'win32'
      ? WINDOWS_PIPE_PATH
      : path.join(path.sep === '\\' ? 'C:\\temp' : '/tmp', `${INSTANCE_PIPE_NAME}.sock`),
    timeoutMs = 1500,
  ): Promise<boolean> {
    const files = extractExternalFiles(argv);
    if (files.length === 0) {
      return false;
    }

    return new Promise<boolean>((resolve) => {
      const socket = net.createConnection(pipePath);
      let resolved = false;

      const finish = (result: boolean) => {
        if (resolved) return;
        resolved = true;
        socket.destroy();
        resolve(result);
      };

      const timer = setTimeout(() => {
        finish(false);
      }, timeoutMs);

      socket.on('connect', () => {
        try {
          const payload = JSON.stringify(files);
          socket.write(payload, 'utf-8', () => {
            socket.end();
            clearTimeout(timer);
            finish(true);
          });
        } catch {
          clearTimeout(timer);
          finish(false);
        }
      });

      socket.on('error', (err) => {
        clearTimeout(timer);
        AppLog.warn(`Could not forward external import request: ${err.message}`);
        finish(false);
      });
    });
  }

  /**
   * Handles incoming arguments received from a secondary instance or external pipe.
   */
  public handleIncomingArguments(args: readonly string[]): void {
    const files = extractExternalFiles(args);
    this.activateMainWindow();

    if (files.length > 0) {
      if (this.onFilesReceived) {
        this.onFilesReceived(files);
      } else {
        this.pendingFiles.push(...files);
      }
    }
  }

  /**
   * Consumes and clears any pending external files received before handlers were bound.
   */
  public flushPendingFiles(): string[] {
    const result = [...this.pendingFiles];
    this.pendingFiles = [];
    return result;
  }

  /**
   * Activates and restores the main application window to the foreground.
   */
  public activateMainWindow(): void {
    const window = this.getMainWindow();
    if (!window || window.isDestroyed()) return;

    if (!window.isVisible()) {
      window.show();
    }
    window.setSkipTaskbar(false);
    if (window.isMinimized()) {
      window.restore();
    }

    // Toggle topmost briefly to ensure the window comes to the foreground
    // even when obscured by full-screen or foreign applications
    window.setAlwaysOnTop(true);
    window.setAlwaysOnTop(false);
    window.focus();
  }

  /**
   * Disposes the named pipe server and releases resources.
   */
  public dispose(): void {
    if (this.pipeServer) {
      try {
        this.pipeServer.close();
      } catch {
        // Ignored on teardown
      }
      this.pipeServer = null;
    }
    this.pendingFiles = [];
  }
}
