import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const ACTIVITY_EVENTS = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;
const CLOSED_AT_KEY = "buildbuy_closed_at";
const MAX_CLOSED_MS = 60 * 60 * 1000; // 1 hour

export function useIdleTimeout(timeoutMinutes = 30, warningSeconds = 60) {
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(warningSeconds);
  const idleTimer = useRef<ReturnType<typeof setTimeout>>();
  const countdownTimer = useRef<ReturnType<typeof setInterval>>();

  const logout = useCallback(async () => {
    clearTimeout(idleTimer.current);
    clearInterval(countdownTimer.current);
    localStorage.removeItem(CLOSED_AT_KEY);
    await supabase.auth.signOut();
    window.location.href = "/login";
  }, []);

  useEffect(() => {
    const closedAt = localStorage.getItem(CLOSED_AT_KEY);
    if (closedAt) {
      const elapsed = Date.now() - Number(closedAt);
      localStorage.removeItem(CLOSED_AT_KEY);
      if (elapsed >= MAX_CLOSED_MS) {
        logout();
        return;
      }
    }

    const handleBeforeUnload = () => {
      localStorage.setItem(CLOSED_AT_KEY, String(Date.now()));
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [logout]);

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
