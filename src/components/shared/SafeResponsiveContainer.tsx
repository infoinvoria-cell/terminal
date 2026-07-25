"use client";

import {
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";

type Dimension = number | string;

type Props = {
  children: ReactElement<{ width?: number; height?: number }>;
  width?: Dimension;
  height?: Dimension;
  minWidth?: number;
  minHeight?: number;
  className?: string;
  style?: CSSProperties;
};

function toCssDimension(value: Dimension | undefined, fallback: string): string | number {
  if (value == null) return fallback;
  return typeof value === "number" ? `${value}px` : value;
}

export default function SafeResponsiveContainer({
  children,
  width = "100%",
  height = "100%",
  minWidth = 0,
  minHeight = 0,
  className,
  style,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;

    const update = () => {
      const rect = node.getBoundingClientRect();
      setIsReady(rect.width > 0 && rect.height > 0);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={hostRef}
      className={className}
      style={{
        width: toCssDimension(width, "100%"),
        height: toCssDimension(height, "100%"),
        minWidth,
        minHeight,
        ...style,
      }}
    >
      {isReady && isValidElement(children)
        ? cloneElement(children, {
            width: Math.max(1, Math.round(hostRef.current?.clientWidth ?? 0)),
            height: Math.max(1, Math.round(hostRef.current?.clientHeight ?? 0)),
          })
        : null}
    </div>
  );
}
