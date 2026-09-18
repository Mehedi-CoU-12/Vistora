import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler } from 'react-native';

const CONFIRM_WINDOW_MS = 2000;

export function useDoubleBackExit(windowMs: number = CONFIRM_WINDOW_MS) {
  const [armed, setArmed] = useState(false);

  const armedRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelExit = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }

    armedRef.current = false;
    setArmed(false);
  }, []);

  const requestExit = useCallback(() => {
    if (armedRef.current) {
      cancelExit();
      BackHandler.exitApp();
      return;
    }

    armedRef.current = true;
    setArmed(true);
    timer.current = setTimeout(cancelExit, windowMs);
  }, [cancelExit, windowMs]);

  useEffect(() => cancelExit, [cancelExit]);

  return { armed, requestExit, cancelExit };
}
