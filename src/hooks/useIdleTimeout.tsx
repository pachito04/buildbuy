import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const ACTIVITY_EVENTS = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;

export function useIdleTimeout(timeoutMinutes = 30, warningSeconds = 60) {
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(warningSeconds);
  const idleTimer = useRef<ReturnType<typeof setTimeout>>();
  const countdownTimer = useRef<ReturnType<typeof setInterval>>();

  const logout = useCallback(async () => {
    clearTimeout(idleTimer.current);
    clearInterval(countdownTimer.current);
    await supabase.auth.signOut();
    window.location.href = "/login";
  }, []);

  const resetIdle = useCallback(() => {
    clearTimeout(idleTimer.current);
    clearInterval(countdownTimer.current);
    setShowWarning(false);
    setCountdown(warningSeconds);

    idleTimer.current = setTimeout(() => {
      setShowWarning(true);
      let remaining = warningSeconds;
      countdownTimer.current = setInterval(() => {
        remaining -= 1;
        setCountdown(remaining);
        if (remaining <= 0) {
          logout();
        }
      }, 1000);
    }, timeoutMinutes * 60 * 1000);
  }, [timeoutMinutes, warningSeconds, logout]);

  const stayActive = useCallback(() => {
    resetIdle();
  }, [resetIdle]);

  useEffect(() => {
    resetIdle();
    const handler = () => {
      if (!showWarning) resetIdle();
    };
    ACTIVITY_EVENTS.forEach((e) => document.addEventListener(e, handler, { passive: true }));
    return () => {
      ACTIVITY_EVENTS.forEach((e) => document.removeEventListener(e, handler));
      clearTimeout(idleTimer.current);
      clearInterval(countdownTimer.current);
    };
  }, [resetIdle, showWarning]);

  return { showWarning, countdown, stayActive, logout };
}
