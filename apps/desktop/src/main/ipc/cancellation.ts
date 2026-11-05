/**
 * In-flight request cancellation tracking and lifecycle management for Electron Main IPC.
 * Bridges IPC cancellation requests to standard AbortSignal primitives.
 */

interface ActiveRequestEntry {
  readonly controller: AbortController;
  readonly requestId: string;
  readonly cancellationToken?: string | undefined;
  readonly createdAt: number;
  reason?: string | undefined;
}

export class CancellationManager {
  private readonly byRequestId = new Map<string, ActiveRequestEntry>();
  private readonly byToken = new Map<string, ActiveRequestEntry>();
  private readonly ttlMs: number;

  constructor(ttlMs = 300_000) {
    this.ttlMs = ttlMs;
  }

  /**
   * Registers a new in-flight request and returns its AbortSignal.
   */
  public register(requestId: string, cancellationToken?: string): AbortSignal {
    this.cleanupExpired();

    const controller = new AbortController();
    const entry: ActiveRequestEntry = {
      controller,
      requestId,
      ...(cancellationToken !== undefined ? { cancellationToken } : {}),
      createdAt: Date.now(),
    };

    this.byRequestId.set(requestId, entry);
    if (cancellationToken) {
      this.byToken.set(cancellationToken, entry);
    }

    return controller.signal;
  }

  /**
   * Cancels an active request by its requestId or cancellationToken.
   * Returns true if a matching active request was found and cancelled.
   */
  public cancel(targetId: string, reason = 'Operation cancelled by user request'): boolean {
    const entry = this.byRequestId.get(targetId) ?? this.byToken.get(targetId);
    if (!entry) {
      return false;
    }

    entry.reason = reason;
    if (!entry.controller.signal.aborted) {
      entry.controller.abort(reason);
    }
    return true;
  }

  /**
   * Checks whether a request has been cancelled.
   */
  public isCancelled(requestId: string): boolean {
    const entry = this.byRequestId.get(requestId);
    return entry !== undefined && entry.controller.signal.aborted;
  }

  /**
   * Gets the cancellation reason if the request was cancelled.
   */
  public getReason(requestId: string): string | undefined {
    return this.byRequestId.get(requestId)?.reason;
  }

  /**
   * Marks a request completed and frees its resources.
   */
  public complete(requestId: string): void {
    const entry = this.byRequestId.get(requestId);
    if (!entry) return;

    this.byRequestId.delete(requestId);
    if (entry.cancellationToken) {
      this.byToken.delete(entry.cancellationToken);
    }
  }

  /**
   * Cleans up all tracked entries (used during shutdown or test teardown).
   */
  public clear(): void {
    for (const entry of this.byRequestId.values()) {
      if (!entry.controller.signal.aborted) {
        entry.controller.abort('CancellationManager cleared');
      }
    }
    this.byRequestId.clear();
    this.byToken.clear();
  }

  /**
   * Removes stale requests that exceeded TTL without explicit completion.
   */
  public cleanupExpired(): void {
    const now = Date.now();
    for (const [id, entry] of this.byRequestId.entries()) {
      if (now - entry.createdAt > this.ttlMs) {
        if (!entry.controller.signal.aborted) {
          entry.controller.abort('Request timed out in cancellation registry');
        }
        this.byRequestId.delete(id);
        if (entry.cancellationToken) {
          this.byToken.delete(entry.cancellationToken);
        }
      }
    }
  }
}
