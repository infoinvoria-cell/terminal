"use client";

import { useEffect, useRef, useState } from "react";

type ElementSize = {
  width: number;
  height: number;
};

export default function useObservedElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const update = () => {
      const rect = node.getBoundingClientRect();
      const next = {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
      setSize((current) => (
        current.width === next.width && current.height === next.height
          ? current
          : next
      ));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ref, size };
}
