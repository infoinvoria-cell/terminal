"use client";

import Image from "next/image";
import type { AssetComponent, AssetStrategyMode } from "@/lib/components/components-types";
import styles from "./AssetComponentColumn.module.css";

type ModeToggleProps = {
  mode: AssetStrategyMode;
  open: boolean;
  onToggle: () => void;
};

function ModeToggle({ mode, open, onToggle }: ModeToggleProps) {
  const s = mode.stats;
  const isCore = s.status === "final_core";

  return (
    <div className={styles.modeBlock}>
      <button
        className={styles.modeBtn}
        onClick={onToggle}
        aria-expanded={open}
        type="button"
      >
        <span className={styles.modeLabel}>{mode.label}</span>
        {s.count > 0 && <span className={styles.modeCount}>{s.count}</span>}
        {isCore && <span className={styles.coreDot} title="Core" />}
        <span className={styles.modeChevron}>{open ? "▾" : "›"}</span>
      </button>

      {!open && (
        <div className={styles.modeSummary}>
          CAGR {s.cagr} · DD {s.maxDrawdown} · Cal {s.calmar}
        </div>
      )}

      {open && (
        <div className={styles.modeDetails}>
          <div className={styles.statGrid}>
            <span className={styles.statKey}>CAGR</span>
            <span className={styles.statVal}>{s.cagr}</span>
            <span className={styles.statKey}>Max DD</span>
            <span className={styles.statVal}>{s.maxDrawdown}</span>
            <span className={styles.statKey}>Calmar</span>
            <span className={styles.statVal}>{s.calmar}</span>
            <span className={styles.statKey}>Sharpe</span>
            <span className={styles.statVal}>{s.sharpe}</span>
            <span className={styles.statKey}>PF</span>
            <span className={styles.statVal}>{s.profitFactor}</span>
            <span className={styles.statKey}>Trades</span>
            <span className={styles.statVal}>{s.trades}</span>
            <span className={styles.statKey}>Winrate</span>
            <span className={styles.statVal}>{s.winrate}</span>
            <span className={styles.statKey}>WF/OOS</span>
            <span className={styles.statVal}>{s.wfOos}</span>
          </div>
          {mode.detailNames && mode.detailNames.length > 0 && (
            <div className={styles.detailNames}>
              {mode.detailNames.map((name) => (
                <span key={name} className={styles.detailName}>{name}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type Props = {
  asset: AssetComponent;
  openKeys: ReadonlySet<string>;
  onToggleKey: (key: string) => void;
};

export default function AssetComponentColumn({ asset, openKeys, onToggleKey }: Props) {
  return (
    <div className={styles.col}>
      {/* Identity — fixed min-height for alignment */}
      <div className={styles.identity}>
        <div className={styles.iconWrap}>
          {asset.iconFile ? (
            <Image
              src={asset.iconFile}
              alt={asset.label}
              width={30}
              height={30}
              className={styles.icon}
              unoptimized
            />
          ) : (
            <span className={styles.iconFallback}>
              {asset.symbol.slice(0, 2)}
            </span>
          )}
        </div>
        <div className={styles.names}>
          <div className={styles.symbol}>{asset.symbolDisplay}</div>
          <div className={styles.labelText}>{asset.label}</div>
        </div>
      </div>

      {/* Meta — always rendered for alignment; content conditional */}
      <div className={styles.meta}>
        {asset.version !== "offen" && (
          <>
            <div className={styles.metaRow}>
              <span className={styles.metaKey}>v{asset.version}</span>
              <span className={styles.metaVal}>{asset.dataCoverage}</span>
            </div>
            {asset.anomaliesCount !== undefined && (
              <div className={styles.metaRow}>
                <span className={styles.metaKey}>Setups</span>
                <span className={styles.metaVal}>{asset.anomaliesCount}</span>
              </div>
            )}
          </>
        )}
      </div>

      <div className={styles.divider} />

      {/* Strategy modes */}
      <div className={styles.modes}>
        {asset.modes.map((mode) => {
          const key = `${asset.symbol}:${mode.id}`;
          return (
            <ModeToggle
              key={mode.id}
              mode={mode}
              open={openKeys.has(key)}
              onToggle={() => onToggleKey(key)}
            />
          );
        })}
      </div>
    </div>
  );
}
