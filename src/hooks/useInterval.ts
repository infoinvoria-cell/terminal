"use client";

import { useEffect, useRef } from "react";

export function useInterval(callback: () => void, delay: number | null) {
  const savedCallback = useRef(callback);
  useEffect(() => { savedCallback.current = callback; }, [callback]);

  useEffect(() => {
    if (delay === null) return;

    function tick() {
      if (document.visibilityState === "hidden") return;
      savedCallback.current();
    }

    const id = setInterval(tick, delay);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [delay]);
}
