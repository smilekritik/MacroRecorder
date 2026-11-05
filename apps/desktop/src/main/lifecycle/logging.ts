/**
 * Main application diagnostics and error logging.
 * Faithful 1:1 port of MacroRecorder.Core/Diagnostics/AppLog.cs.
 * Features 1 MiB log rotation to .log.old, line sanitization, and level formatting.
 */

import fs from 'node:fs';
import path from 'node:path';

export class AppLogManager {
  private readonly maxBytes = 1_048_576; // 1 MiB
  private logFilePath: string | null = null;

  /**
   * Configures the application log root directory and log file path.
   */
  public configure(rootPath: string): void {
    try {
      fs.mkdirSync(rootPath, { recursive: true });
      this.logFilePath = path.join(rootPath, 'macro-recorder.log');
    } catch {
      // Best-effort configuration; fallback remains unconfigured
    }
  }

  /**
   * Current log file path (or null if not yet configured).
   */
  public get filePath(): string | null {
    return this.logFilePath;
  }

  /**
   * Folder where the log lives.
   */
  public get directoryPath(): string | null {
    return this.logFilePath ? path.dirname(this.logFilePath) : null;
  }

  /**
   * Writes a log entry with level and message.
   * Performs automatic rotation to .log.old if size exceeds 1 MiB.
   */
  public write(level: string, message: string): void {
    if (!this.logFilePath) return;

    try {
      if (fs.existsSync(this.logFilePath)) {
        const stats = fs.statSync(this.logFilePath);
        if (stats.size >= this.maxBytes) {
          const oldPath = `${this.logFilePath}.old`;
          try {
            if (fs.existsSync(oldPath)) {
              fs.unlinkSync(oldPath);
            }
            fs.renameSync(this.logFilePath, oldPath);
          } catch {
            // If rotation fails, proceed to append
          }
        }
      }

      const timestamp = new Date().toISOString();
      const sanitized = this.sanitize(message);
      const line = `${timestamp} [${level}] ${sanitized}\n`;
      fs.appendFileSync(this.logFilePath, line, { encoding: 'utf-8' });
    } catch {
      // Logging operations should never crash the caller
    }
  }

  public info(message: string): void {
    this.write('INFO', message);
  }

  public warn(message: string): void {
    this.write('WARN', message);
  }

  public error(message: string): void {
    this.write('ERROR', message);
  }

  public fatal(message: string): void {
    this.write('FATAL', message);
  }

  public debug(message: string): void {
    this.write('DEBUG', message);
  }

  /**
   * Replaces carriage returns and line feeds with spaces to prevent log splitting.
   */
  public sanitize(value: string): string {
    return value.replace(/\r/g, ' ').replace(/\n/g, ' ');
  }

  /**
   * Resets internal state (useful for tests).
   */
  public reset(): void {
    this.logFilePath = null;
  }
}

/** Global singleton instance */
export const AppLog = new AppLogManager();
