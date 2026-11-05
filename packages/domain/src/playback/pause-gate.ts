/**
 * Asynchronous manual-reset event gate for pausing and resuming playback.
 */

import {
  type CancellationToken,
  checkCancellation,
  OperationCanceledException,
} from './cancellation.js';

export class PauseGate {
  private _isSet: boolean;
  private readonly _waiters: Array<{
    resolve: () => void;
    reject: (err: unknown) => void;
  }> = [];

  public constructor(initialState = true) {
    this._isSet = initialState;
  }

  public get isSet(): boolean {
    return this._isSet;
  }

  public get IsSet(): boolean {
    return this._isSet;
  }

  public set(): void {
    if (this._isSet) return;
    this._isSet = true;
    const waiters = this._waiters.splice(0, this._waiters.length);
    for (const waiter of waiters) {
      waiter.resolve();
    }
  }

  public Set(): void {
    this.set();
  }

  public reset(): void {
    this._isSet = false;
  }

  public Reset(): void {
    this.reset();
  }

  public async wait(token?: CancellationToken | AbortSignal | null): Promise<void> {
    checkCancellation(token);
    if (this._isSet) {
      return;
    }

    return new Promise<void>((resolve, reject) => {
      let unregister: (() => void) | null = null;
      const waiter = {
        resolve: () => {
          if (unregister) {
            unregister();
            unregister = null;
          }
          resolve();
        },
        reject: (err: unknown) => {
          if (unregister) {
            unregister();
            unregister = null;
          }
          reject(err);
        },
      };

      if (token) {
        const onCancel = () => {
          const index = this._waiters.indexOf(waiter);
          if (index !== -1) {
            this._waiters.splice(index, 1);
          }
          waiter.reject(new OperationCanceledException('The operation was canceled.', token));
        };

        if ('register' in token && typeof token.register === 'function') {
          unregister = token.register(onCancel);
        } else if ('addEventListener' in token && typeof token.addEventListener === 'function') {
          token.addEventListener('abort', onCancel, { once: true });
          unregister = () => token.removeEventListener('abort', onCancel);
        }
      }

      this._waiters.push(waiter);
    });
  }

  public async Wait(token?: CancellationToken | AbortSignal | null): Promise<void> {
    return this.wait(token);
  }
}
