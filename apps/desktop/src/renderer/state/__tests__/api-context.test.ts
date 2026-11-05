import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ApiProvider, useApiContext } from '../ApiContext.js';
import { createMockApi } from '../../hooks/useApi.js';
import { EngineState, IpcChannels } from '../../../../../../packages/contracts/src/index.js';

describe('ApiContext and Renderer Isolation', () => {
  it('provides injected mock API through React context', async () => {
    let capturedApi: ReturnType<typeof useApiContext> | null = null;

    const mockApi = createMockApi({
      [IpcChannels.PLAYBACK_GET_STATUS]: () => ({
        state: EngineState.Playing,
        elapsedMicroseconds: 5000,
      }),
    });

    function TestConsumer() {
      capturedApi = useApiContext();
      return React.createElement('div', null, 'API Consumer');
    }

    renderToString(
      React.createElement(
        ApiProvider,
        { api: mockApi },
        React.createElement(TestConsumer),
      ),
    );

    expect(capturedApi).not.toBeNull();

    const res = await capturedApi!.invoke(IpcChannels.PLAYBACK_GET_STATUS, {
      requestId: 'test-req',
    });

    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.state).toBe(EngineState.Playing);
    }
  });

  it('falls back safely when no provider is present without throwing', () => {
    let capturedApi: ReturnType<typeof useApiContext> | null = null;

    function FallbackConsumer() {
      capturedApi = useApiContext();
      return React.createElement('div', null, 'Fallback');
    }

    renderToString(React.createElement(FallbackConsumer));

    expect(capturedApi).not.toBeNull();
    expect(typeof capturedApi!.invoke).toBe('function');
    expect(typeof capturedApi!.on).toBe('function');
  });
});
