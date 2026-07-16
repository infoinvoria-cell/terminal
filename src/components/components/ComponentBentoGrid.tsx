import { COMPONENT_GROUPS, GROUP_LAYOUT } from "@/lib/components/components-data";
import ComponentGroupBox from "./ComponentGroupBox";
import styles from "./ComponentBentoGrid.module.css";

export default function ComponentBentoGrid() {
  const populated = COMPONENT_GROUPS.filter((g) => g.assets.length > 0);

  return (
    <div className={styles.bento}>
      {populated.map((group) => {
        const layout = GROUP_LAYOUT[group.id];
        if (!layout) return null;
        return (
          <div
            key={group.id}
            className={styles.cell}
            style={{
              gridColumn: `${layout.colStart} / span ${layout.colSpan}`,
              gridRow: layout.row,
            }}
          >
            <ComponentGroupBox group={group} />
          </div>
        );
      })}
    </div>
  );
}
