/**
 * Typed IPC Handler Registry for Electron Main process.
 * Registers typed channel handlers, orchestrates sender authentication,
 * payload validation, cancellation tracking, and error redaction boundaries.
 */

import { ipcMain, type IpcMain, type IpcMainInvokeEvent } from 'electron';
import { CancellationManager } from './cancellation.js';
import { IpcChannels, isKnownIpcChannel, type IpcChannelName } from './channels.js';
import { createErrorResult, redactError } from './error-redaction.js';
import { validateSender, type SenderValidationOptions } from './sender.js';
import { SubscriptionManager } from './subscriptions.js';
import {
  IpcErrorCode,
  type IpcContractMap,
  type IpcHandler,
  type IpcHandlerContext,
  type IpcRequestFor,
  type IpcResponseFor,
  type IpcResult,
} from './types.js';
import { validateIpcPayload } from './validation.js';

export interface RegistryOptions {
  readonly ipcMainInstance?: IpcMain | undefined;
  readonly senderOptions?: SenderValidationOptions | undefined;
  readonly cancellationManager?: CancellationManager | undefined;
  readonly subscriptionManager?: SubscriptionManager | undefined;
}

export class IpcHandlerRegistry {
  private readonly ipc: IpcMain;
  private readonly senderOptions: SenderValidationOptions;
  public readonly cancellation: CancellationManager;
  public readonly subscriptions: SubscriptionManager;
  private readonly registeredChannels = new Set<string>();

  constructor(options: RegistryOptions = {}) {
    this.ipc = options.ipcMainInstance ?? ipcMain;
    this.senderOptions = options.senderOptions ?? {};
    this.cancellation = options.cancellationManager ?? new CancellationManager();
    this.subscriptions = options.subscriptionManager ?? new SubscriptionManager();

    // Register built-in handlers for IPC lifecycle control.
    this.registerCancellationHandler();
    this.registerSubscriptionHandlers();
  }

  /**
   * Registers a strongly-typed handler for an IPC channel.
   */
  public register<C extends IpcChannelName>(
    channel: C,
    handler: IpcHandler<C>,
  ): void {
    if (!isKnownIpcChannel(channel)) {
      throw new Error(`Cannot register unknown IPC channel: "${channel}"`);
    }

    if (this.registeredChannels.has(channel)) {
      this.unregister(channel);
    }

    const dispatcher = async (
      event: IpcMainInvokeEvent,
      rawPayload: unknown,
    ): Promise<IpcResult<IpcResponseFor<C>>> => {
      // 1. Extract or generate requestId for error envelopes
      const payloadObj = (typeof rawPayload === 'object' && rawPayload !== null)
        ? (rawPayload as Record<string, unknown>)
        : {};
      const requestId = typeof payloadObj.requestId === 'string' ? payloadObj.requestId : 'unknown';

      // 2. Validate sender frame and origin security
      const senderResult = validateSender(event, this.senderOptions);
      if (!senderResult.valid) {
        return createErrorResult(senderResult.code, senderResult.reason, requestId);
      }

      // 3. Validate request payload against runtime schema
      const validation = validateIpcPayload(channel, rawPayload);
      if (!validation.ok) {
        return createErrorResult(
          IpcErrorCode.INVALID_ARGUMENT,
          `Invalid payload for ${channel}: ${validation.error}`,
          requestId,
        );
      }

      const request = validation.value;

      // 4. Check if request was pre-cancelled before dispatch
      if (this.cancellation.isCancelled(request.requestId)) {
        return createErrorResult(
          IpcErrorCode.CANCELLED,
          this.cancellation.getReason(request.requestId) ?? 'Request was cancelled before execution',
          request.requestId,
        );
      }

      // 5. Register in cancellation manager to create AbortSignal
      const signal = this.cancellation.register(request.requestId, request.cancellationToken);

      const context: IpcHandlerContext = {
        senderWebContentsId: event.sender.id,
        senderWebContents: event.sender,
        senderProcessId: senderResult.processId,
        senderFrameUrl: senderResult.url,
        signal,
      };

      try {
        // If aborted while in event loop
        if (signal.aborted) {
          return createErrorResult(
            IpcErrorCode.CANCELLED,
            this.cancellation.getReason(request.requestId) ?? 'Request was cancelled',
            request.requestId,
          );
        }

        const data = await handler(request as IpcRequestFor<C>, context);

        if (signal.aborted) {
          return createErrorResult(
            IpcErrorCode.CANCELLED,
            this.cancellation.getReason(request.requestId) ?? 'Request was cancelled during execution',
            request.requestId,
          );
        }

        return {
          success: true,
          data,
          requestId: request.requestId,
        };
      } catch (err: unknown) {
        if (signal.aborted) {
          return createErrorResult(
            IpcErrorCode.CANCELLED,
            this.cancellation.getReason(request.requestId) ?? 'Request was cancelled during execution',
            request.requestId,
          );
        }

        const redacted = redactError(err);
        return {
          success: false,
          error: redacted,
          requestId: request.requestId,
        };
      } finally {
        this.cancellation.complete(request.requestId);
      }
    };

    this.ipc.handle(channel, dispatcher);
    this.registeredChannels.add(channel);
  }

  /**
   * Unregisters a specific IPC channel handler.
   */
  public unregister(channel: string): void {
    if (this.registeredChannels.has(channel)) {
      try {
        this.ipc.removeHandler(channel);
      } catch {
        // Ignore if already removed
      }
      this.registeredChannels.delete(channel);
    }
  }

  /**
   * Unregisters all handlers and cleans up all subscriptions and cancellation records.
   */
  public unregisterAll(): void {
    for (const channel of this.registeredChannels) {
      try {
        this.ipc.removeHandler(channel);
      } catch {
        // Ignore errors during mass teardown
      }
    }
    this.registeredChannels.clear();
    this.cancellation.clear();
    this.subscriptions.clear();
  }

  /**
   * Returns whether a handler is registered for the channel.
   */
  public hasHandler(channel: string): boolean {
    return this.registeredChannels.has(channel);
  }

  private registerCancellationHandler(): void {
    this.register(
      IpcChannels.IPC_CANCEL,
      (request: IpcContractMap['ipc:cancel']['request']) => {
        const cancelled = this.cancellation.cancel(
          request.targetRequestId,
          request.reason ?? 'Client cancellation request',
        );
        return { cancelled };
      },
    );
  }

  private registerSubscriptionHandlers(): void {
    this.register(IpcChannels.IPC_SUBSCRIBE, (request, context) => ({
      subscribed: this.subscriptions.subscribe(context.senderWebContents, request.channel),
    }));

    this.register(IpcChannels.IPC_UNSUBSCRIBE, (request, context) => {
      this.subscriptions.unsubscribe(context.senderWebContents, request.channel);
      return { unsubscribed: true };
    });
  }
}
