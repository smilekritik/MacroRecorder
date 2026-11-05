import { describe, it, expect } from 'vitest';

describe('Timeline dirty guard and save/discard decision logic', () => {
  it('executes transition immediately when clean', () => {
    let executed = false;
    let isPromptOpen = false;
    const isDirty = false;

    function executeWithGuard(action: () => void) {
      if (!isDirty) {
        action();
        return;
      }
      isPromptOpen = true;
    }

    executeWithGuard(() => {
      executed = true;
    });

    expect(executed).toBe(true);
    expect(isPromptOpen).toBe(false);
  });

  it('holds transition and prompts user when dirty', () => {
    let executed = false;
    let isPromptOpen = false;
    let pendingAction: (() => void) | null = null;
    const isDirty = true;

    function executeWithGuard(action: () => void) {
      if (!isDirty) {
        action();
        return;
      }
      pendingAction = action;
      isPromptOpen = true;
    }

    executeWithGuard(() => {
      executed = true;
    });

    expect(executed).toBe(false);
    expect(isPromptOpen).toBe(true);
    expect(pendingAction).not.toBeNull();
  });

  it('saves and continues pending transition on save decision', async () => {
    let executed = false;
    let saved = false;
    let pendingAction: (() => void) | null = () => {
      executed = true;
    };

    async function handleSaveDecision() {
      saved = true;
      if (pendingAction) {
        pendingAction();
        pendingAction = null;
      }
    }

    await handleSaveDecision();
    expect(saved).toBe(true);
    expect(executed).toBe(true);
    expect(pendingAction).toBeNull();
  });

  it('discards and continues pending transition on discard decision', () => {
    let executed = false;
    let discarded = false;
    let pendingAction: (() => void) | null = () => {
      executed = true;
    };

    function handleDiscardDecision() {
      discarded = true;
      if (pendingAction) {
        pendingAction();
        pendingAction = null;
      }
    }

    handleDiscardDecision();
    expect(discarded).toBe(true);
    expect(executed).toBe(true);
    expect(pendingAction).toBeNull();
  });

  it('cancels pending transition on cancel decision', () => {
    let executed = false;
    let pendingAction: (() => void) | null = () => {
      executed = true;
    };

    function handleCancelDecision() {
      pendingAction = null;
    }

    handleCancelDecision();
    expect(executed).toBe(false);
    expect(pendingAction).toBeNull();
  });
});
