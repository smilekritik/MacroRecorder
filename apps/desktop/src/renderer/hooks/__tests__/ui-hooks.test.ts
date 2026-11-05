import { describe, it, expect, vi } from 'vitest';

describe('UI and Accessibility Hooks logic', () => {
  it('disposes timer callbacks properly', () => {
    vi.useFakeTimers();
    const callback = vi.fn();

    const timer = setTimeout(callback, 100);
    expect(callback).not.toHaveBeenCalled();

    // Dispose before trigger
    clearTimeout(timer);

    vi.advanceTimersByTime(200);
    expect(callback).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('handles roving index calculation and looping', () => {
    const itemCount = 4;
    let index = 0;

    const moveNext = () => {
      index = index + 1 < itemCount ? index + 1 : 0;
    };
    const movePrev = () => {
      index = index - 1 >= 0 ? index - 1 : itemCount - 1;
    };

    expect(index).toBe(0);
    moveNext();
    expect(index).toBe(1);
    moveNext();
    expect(index).toBe(2);
    moveNext();
    expect(index).toBe(3);
    moveNext(); // loop to 0
    expect(index).toBe(0);

    movePrev(); // loop to 3
    expect(index).toBe(3);
  });
});
