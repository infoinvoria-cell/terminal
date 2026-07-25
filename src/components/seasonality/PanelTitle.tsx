"use client";

import type { ReactNode } from "react";
import styles from "./seasonal.module.css";

export function PanelTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className={styles.combinedHeader}>
      <span className={styles.pt}>{children}</span>
      {right ?? null}
    </div>
  );
}

