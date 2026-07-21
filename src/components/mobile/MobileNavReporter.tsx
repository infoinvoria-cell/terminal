"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Fires postMessage to parent window whenever the mobile pathname changes.
// Picked up by MobilePreviewOverlay to keep desktop route in sync.
export function MobileNavReporter() {
  const pathname = usePathname();
  useEffect(() => {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "capitalife-nav", path: pathname }, "*");
      }
    } catch { /* cross-origin or no parent */ }
  }, [pathname]);
  return null;
}
