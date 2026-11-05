/**
 * Cancellation primitives and async helpers.
 */

export class OperationCanceledException extends Error {
  public constructor(
    message = 'The operation was canceled.',
    public readonly token?: CancellationToken | AbortSignal | undefined,
  ) {
    super(message);
    this.name = 'OperationCanceledException';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class CancellationToken {
  private readonly _signal?: AbortSignal | undefined;

  public constructor(source?: AbortSignal | AbortController) {
    if (source instanceof AbortController) {
      this._signal = source.signal;
    } else if (source instanceof AbortSignal) {
      this._signal = source;
    }
  }

  public static readonly None = new CancellationToken();

  public get signal(): AbortSignal | undefined {
    return this._signal;
  }

  public get isCancellationRequested(): boolean {
    return this._signal?.aborted ?? false;
  }

  public get IsCancellationRequested(): boolean {
    return this.isCancellationRequested;
  }

  public get canBeCanceled(): boolean {
    return this._signal !== undefined;
  }

  public get CanBeCanceled(): boolean {
    return this.canBeCanceled;
  }

  public throwIfCancellationRequested(): void {
    if (this.isCancellationRequested) {
      throw new OperationCanceledException('The operation was canceled.', this);
    }
  }

  public ThrowIfCancellationRequested(): void {
    this.throwIfCancellationRequested();
  }

  public register(callback: () => void): () => void {
    if (this.isCancellationRequested) {
      callback();
      return () => {};
    }
    if (!this._signal) {
      return () => {};
    }
    const listener = () => callback();
    this._signal.addEventListener('abort', listener, { once: true });
    return () => {
      this._signal?.removeEventListener('abort', listener);
    };
  }

  public Register(callback: () => void): { dispose: () => void; Dispose: () => void } {
    const unregister = this.register(callback);
    return {
      dispose: unregister,
      Dispose: unregister,
    };
  }
}

export class CancellationTokenSource {
  private readonly _controller: AbortController = new AbortController();
  private readonly _token: CancellationToken;
  private _timer: ReturnType<typeof setTimeout> | null = null;
  private _unregisters: Array<() => void> = [];
  private _isDisposed = false;

  public constructor(delayMs?: number) {
    this._token = new CancellationToken(this._controller);
    if (delayMs !== undefined && delayMs > 0) {
      this.cancelAfter(delayMs);
    }
  }

  public get token(): CancellationToken {
    return this._token;
  }

  public get Token(): CancellationToken {
    return this._token;
  }

  public get isCancellationRequested(): boolean {
    return this._controller.signal.aborted;
  }

  public get IsCancellationRequested(): boolean {
    return this.isCancellationRequested;
  }

  public cancel(): void {
    if (this._isDisposed || this._controller.signal.aborted) {
      return;
    }
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this._controller.abort();
  }

  public Cancel(): void {
    this.cancel();
  }

  public cancelAfter(milliseconds: number): void {
    if (this._isDisposed || this._controller.signal.aborted) {
      return;
    }
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    if (milliseconds <= 0) {
      this.cancel();
      return;
    }
    this._timer = setTimeout(() => {
      this._timer = null;
      this.cancel();
    }, milliseconds);
  }

  public CancelAfter(milliseconds: number): void {
    this.cancelAfter(milliseconds);
  }

  public dispose(): void {
    if (this._isDisposed) return;
    this._isDisposed = true;
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    for (const unregister of this._unregisters) {
      unregister();
    }
    this._unregisters = [];
  }

  public Dispose(): void {
    this.dispose();
  }

  public static createLinkedTokenSource(
    ...sources: Array<CancellationToken | AbortSignal | undefined | null>
  ): CancellationTokenSource {
    const cts = new CancellationTokenSource();
    for (const src of sources) {
      if (!src) continue;
      if (src instanceof CancellationToken) {
        if (src.isCancellationRequested) {
          cts.cancel();
          return cts;
        }
        const unregister = src.register(() => cts.cancel());
        cts._unregisters.push(unregister);
      } else if (src instanceof AbortSignal) {
        if (src.aborted) {
          cts.cancel();
          return cts;
        }
        const onAbort = () => cts.cancel();
        src.addEventListener('abort', onAbort, { once: true });
        cts._unregisters.push(() => src.removeEventListener('abort', onAbort));
      }
    }
    return cts;
  }

  public static CreateLinkedTokenSource(
    ...sources: Array<CancellationToken | AbortSignal | undefined | null>
  ): CancellationTokenSource {
    return this.createLinkedTokenSource(...sources);
  }
}

export function checkCancellation(token?: CancellationToken | AbortSignal | null): void {
  if (!token) return;
  if (token instanceof CancellationToken) {
    token.throwIfCancellationRequested();
  } else if ('aborted' in token && token.aborted) {
    throw new OperationCanceledException('The operation was canceled.', token);
  }
}

export function sleep(
  milliseconds: number,
  token?: CancellationToken | AbortSignal | null,
): Promise<void> {
  if (milliseconds <= 0) {
    checkCancellation(token);
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    checkCancellation(token);

    let timer: ReturnType<typeof setTimeout> | null = null;
    let unregister: (() => void) | null = null;

    const onCancel = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      if (unregister) {
        unregister();
        unregister = null;
      }
      reject(new OperationCanceledException('The operation was canceled.', token ?? undefined));
    };

    if (token instanceof CancellationToken) {
      unregister = token.register(onCancel);
    } else if (token && 'addEventListener' in token) {
      token.addEventListener('abort', onCancel, { once: true });
      unregister = () => token.removeEventListener('abort', onCancel);
    }

    timer = setTimeout(() => {
      timer = null;
      if (unregister) {
        unregister();
        unregister = null;
      }
      resolve();
    }, milliseconds);
  });
}
