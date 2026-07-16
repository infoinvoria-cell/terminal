"use client";

import { useState, useMemo, useCallback } from "react";
import type { ComponentGroup } from "@/lib/components/components-types";
import AssetComponentColumn from "./AssetComponentColumn";
import styles from "./ComponentGroupBox.module.css";

type Props = {
  group: ComponentGroup;
};

export default function ComponentGroupBox({ group }: Props) {
  const allKeys = useMemo(
    () => group.assets.flatMap((a) => a.modes.map((m) => `${a.symbol}:${m.id}`)),
    [group.assets],
  );

  const [openKeys, setOpenKeys] = useState<ReadonlySet<string>>(new Set());

  const allOpen = allKeys.length > 0 && allKeys.every((k) => openKeys.has(k));

  const toggleAll = useCallback(() => {
    setOpenKeys(allOpen ? new Set() : new Set(allKeys));
  }, [allOpen, allKeys]);

  const toggleKey = useCallback((key: string) => {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  return (
    <div className={styles.box}>
      <div className={styles.header}>
        <span className={styles.title}>{group.title}</span>
        <button
          type="button"
          className={`${styles.allBtn} ${allOpen ? styles.allBtnOpen : ""}`}
          onClick={toggleAll}
        >
          All
        </button>
      </div>
      <div className={styles.columns}>
        {group.assets.map((asset) => (
          <AssetComponentColumn
            key={asset.symbol}
            asset={asset}
            openKeys={openKeys}
            onToggleKey={toggleKey}
          />
        ))}
      </div>
    </div>
  );
}
