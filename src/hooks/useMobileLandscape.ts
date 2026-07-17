import { useState, useEffect } from 'react';

export const useMobileLandscape = (): boolean => {
  const [isMobileLandscape, setIsMobileLandscape] = useState(false);

  useEffect(() => {
    const check = () => {
      const isTouch = window.matchMedia('(pointer: coarse)').matches;
      const isLandscape = window.innerWidth > window.innerHeight;
      setIsMobileLandscape(isTouch && isLandscape);
    };

    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);

    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);

  return isMobileLandscape;
};
