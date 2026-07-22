"use client";

import ComponentBentoGrid from "@/components/components/ComponentBentoGrid";
import styles from "./ComponentsPage.module.css";

export function ComponentsShell() {
  return (
    <main className={styles.page}>
      <ComponentBentoGrid />
    </main>
  );
}
