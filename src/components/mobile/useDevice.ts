"use client";

import { useSyncExternalStore } from "react";

const MOBILE_MAX = 767;
const TABLET_MAX = 1024;

function subscribe(onStoreChange: () => void) {
  const mobileQuery = window.matchMedia(`(max-width: ${MOBILE_MAX}px)`);
  const tabletQuery = window.matchMedia(`(min-width: ${MOBILE_MAX + 1}px) and (max-width: ${TABLET_MAX}px)`);

  mobileQuery.addEventListener("change", onStoreChange);
  tabletQuery.addEventListener("change", onStoreChange);

  return () => {
    mobileQuery.removeEventListener("change", onStoreChange);
    tabletQuery.removeEventListener("change", onStoreChange);
  };
}

function getSnapshot() {
  if (window.innerWidth <= MOBILE_MAX) return "mobile" as const;
  if (window.innerWidth <= TABLET_MAX) return "tablet" as const;
  return "desktop" as const;
}

function getServerSnapshot() {
  return "desktop" as const;
}

export function useDevice() {
  const device = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return {
    device,
    isMobile: device === "mobile",
    isTablet: device === "tablet",
    isDesktop: device === "desktop",
  } as const;
}
