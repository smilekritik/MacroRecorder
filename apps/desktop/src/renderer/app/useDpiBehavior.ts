/**
 * @macro-recorder/desktop - DPI Behavior Hook
 * Monitors devicePixelRatio changes, updates CSS custom properties, and provides DPI scale factor.
 */

import { useState, useEffect } from 'react';

export function useDpiBehavior() {
  const [dpr, setDpr] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return window.devicePixelRatio || 1;
    }
    return 1;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const updateDpr = () => {
      const currentDpr = window.devicePixelRatio || 1;
      setDpr(currentDpr);
      document.documentElement.style.setProperty('--device-pixel-ratio', String(currentDpr));
    };

    updateDpr();

    // Listen to media query changes when crossing DPI boundaries
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    const handleChange = () => {
      updateDpr();
    };

    mq.addEventListener('change', handleChange);
    window.addEventListener('resize', handleChange);

    return () => {
      mq.removeEventListener('change', handleChange);
      window.removeEventListener('resize', handleChange);
    };
  }, []);

  return {
    devicePixelRatio: dpr,
    scalePercent: Math.round(dpr * 100),
  };
}
