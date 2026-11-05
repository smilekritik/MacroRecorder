/**
 * @macro-recorder/desktop - Recording Countdown Badge
 * Centered circular badge displaying the recording countdown number (3, 2, 1...).
 *
 * Features 220ms cubic ease pop animation on each countdown step.
 */

import React, { useEffect, useState } from 'react';
import type { CountdownBadgeProps } from './types.js';

export const CountdownBadge: React.FC<CountdownBadgeProps> = ({
  number,
  visible = true,
  theme = 'dark',
  className = '',
}) => {
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    setAnimating(true);
    const timer = setTimeout(() => {
      setAnimating(false);
    }, 220);
    return () => clearTimeout(timer);
  }, [number]);

  if (!visible || number <= 0) {
    return null;
  }

  const bgStyle =
    theme === 'light'
      ? 'rgba(255, 255, 255, 0.95)'
      : 'rgba(18, 23, 32, 0.95)';

  return (
    <div
      data-testid="countdown-host"
      role="timer"
      aria-live="assertive"
      aria-label={`Recording starts in ${number}`}
      className={`flex items-center justify-center pointer-events-none select-none ${className}`}
    >
      <div
        data-testid="countdown-badge"
        style={{
          width: 150,
          height: 150,
          backgroundColor: bgStyle,
          transition: 'transform 220ms cubic-bezier(0.33, 1, 0.68, 1), opacity 220ms ease-out',
          transform: animating ? 'scale(0.85)' : 'scale(1)',
          opacity: animating ? 0.8 : 1,
        }}
        className="rounded-full border-[3px] border-[var(--color-accent)] shadow-[0_10px_35px_rgba(0,0,0,0.55)] flex items-center justify-center"
      >
        <span
          data-testid="countdown-number"
          className="font-mono text-[72px] font-bold text-[var(--color-accent)] select-none leading-none"
        >
          {number}
        </span>
      </div>
    </div>
  );
};
