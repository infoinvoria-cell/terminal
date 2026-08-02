"""
Seasonal Pattern Data Loader — Extended
Loads and merges daily OHLC CSVs for all seasonal pattern assets.
Covers original 10 + Brain production patterns + Agent portfolio + public anomalies.
"""
import pandas as pd
import os

ASSET_PATHS = {
    # ─── Original 10 ──────────────────────────────────────────────────
    "RB1": [
        r"C:\Users\joris\Desktop\Energy\NYMEX_DL_RB1!, 1D_37e39.csv",
        r"C:\Users\joris\Desktop\Seasonal\NYMEX_DL_RB1!, 1D_5a102.csv",
    ],
    "ZW1": [
        r"C:\Users\joris\Desktop\Agrar\CBOT_DL_ZW1!, 1D_6181d.csv",
        r"C:\Users\joris\Desktop\Seasonal\CBOT_DL_ZW1!, 1D_44b4f.csv",
    ],
    "GC1": [
        r"C:\Users\joris\Desktop\Metals\COMEX_DL_GC1!, 1D_6d2a1.csv",
        r"C:\Users\joris\Desktop\Core_Invest_Data\Futures\GC1_1D.csv",
    ],
    "NG1": [
        r"C:\Users\joris\Desktop\Energy\NYMEX_DL_NG1!, 1D_849f8.csv",
        r"C:\Users\joris\Desktop\Core_Invest_Data\Futures\NG1_1D.csv",
    ],
    "SB1": [
        r"C:\Users\joris\Desktop\Agrar\ICEUS_DLY_SB1!, 1D_98e2e.csv",
        r"C:\Users\joris\Desktop\Data\ICEUS_DLY_SB1!, 1D_7fcc4.csv",
    ],
    "CC1": [r"C:\Users\joris\Desktop\Agrar\ICEUS_DLY_CC1!, 1D_ac7c8.csv"],
    "PA1": [
        r"C:\Users\joris\Desktop\Metals\NYMEX_DL_PA1!, 1D_2c1e5.csv",
        r"C:\Users\joris\Desktop\Seasonal\NYMEX_DL_PA1!, 1D_09940.csv",
    ],
    "ZM1": [r"C:\Users\joris\Desktop\Seasonal\CBOT_DL_ZM1!, 1D_4d891.csv"],
    "CT1": [r"C:\Users\joris\Desktop\Agrar\ICEUS_DLY_CT1!, 1D_4d346.csv"],
    "ES1": [
        r"C:\Users\joris\Desktop\Indices\CME_MINI_DL_ES1!, 1D_99f1a.csv",
        r"C:\Users\joris\Desktop\Core_Invest_Data\Futures\ES1_1D.csv",
        r"C:\Users\joris\Desktop\Seasonal\CME_MINI_DL_ES1!, 1D_68c71.csv",
    ],
    # ─── Brain Production Assets ──────────────────────────────────────
    "ZC1": [
        r"C:\Users\joris\Desktop\Agrar\CBOT_DL_ZC1!, 1D_6fd3b.csv",
        r"C:\Users\joris\Desktop\Core_Invest_Data\Futures\ZC1_1D.csv",
    ],
    "ZS1": [
        r"C:\Users\joris\Desktop\Agrar\CBOT_DL_ZS1!, 1D_5a48c.csv",
        r"C:\Users\joris\Desktop\Core_Invest_Data\Futures\ZS1_1D.csv",
        r"C:\Users\joris\Desktop\Seasonal\CBOT_DL_ZS1!, 1D_c19f5.csv",
    ],
    "KC1": [r"C:\Users\joris\Desktop\Agrar\ICEUS_DLY_KC1!, 1D_7fd46.csv"],
    "OJ1": [r"C:\Users\joris\Desktop\Agrar\ICEUS_DLY_OJ1!, 1D_debe8.csv"],
    # ─── Extended: Energy, Metals, FX, Indices ────────────────────────
    "CL1": [
        r"C:\Users\joris\Desktop\Energy\NYMEX_DL_CL1!, 1D_aab5f.csv",
        r"C:\Users\joris\Desktop\Core_Invest_Data\Futures\CL1_1D.csv",
        r"C:\Users\joris\Desktop\Seasonal\NYMEX_DL_CL1!, 1D_68d96.csv",
    ],
    "HG1": [
        r"C:\Users\joris\Desktop\Metals\COMEX_DL_HG1!, 1D_a3d03.csv",
        r"C:\Users\joris\Desktop\Core_Invest_Data\Futures\HG1_1D.csv",
    ],
    "PL1": [
        r"C:\Users\joris\Desktop\Metals\NYMEX_DL_PL1!, 1D_11840.csv",
        r"C:\Users\joris\Desktop\Seasonal\NYMEX_DL_PL1!, 1D_2a0ee.csv",
    ],
    "BZ1": [r"C:\Users\joris\Desktop\Seasonal\NYMEX_DL_BZ1!, 1D_c7fdd.csv"],
    "6S1": [
        r"C:\Users\joris\Desktop\Core_Invest_Data\Futures\6S1_1D.csv",
        r"C:\Users\joris\Desktop\Invest Portfolio\CME_DL_6S1!, 1D_b8f81.csv",
    ],
    "ZN1": [
        r"C:\Users\joris\Desktop\Core_Invest_Data\Futures\ZN1_1D.csv",
        r"C:\Users\joris\Desktop\Seasonal\CBOT_DL_ZN1!, 1D_bc697.csv",
    ],
    "ZT1": [r"C:\Users\joris\Desktop\Core_Invest_Data\Futures\ZT1_1D.csv"],
    "DXY": [r"C:\Users\joris\Desktop\Data\ICEUS_DLY_DXY, 1D_4c8c2.csv"],
    "6A1": [r"C:\Users\joris\Desktop\Anomalien\CME_DL_6A1!, 1D_0af9e.csv"],
    # ─── Extended Futures ───────────────────────────────────────────────
    "SI1": [r"C:\Users\joris\Desktop\Metals\COMEX_DL_SI1!, 1D_93c3d.csv"],
    "NQ1": [
        r"C:\Users\joris\Desktop\Indices\CME_MINI_DL_NQ1!, 1D_fbe4c.csv",
        r"C:\Users\joris\Desktop\Core_Invest_Data\Futures\NQ1_1D.csv",
        r"C:\Users\joris\Desktop\Data\CME_MINI_DL_NQ1!, 1D_a4ea5.csv",
    ],
    "YM1": [r"C:\Users\joris\Desktop\Indices\CBOT_MINI_DL_YM1!, 1D_60682.csv"],
    "RTY1": [r"C:\Users\joris\Desktop\Core_Invest_Data\Futures\RTY1_1D.csv"],
    "FDAX1": [r"C:\Users\joris\Desktop\Indices\EUREX_DLY_FDAX1!, 1D_66db4.csv"],
    "6E1": [
        r"C:\Users\joris\Desktop\Core_Invest_Data\Futures\6E1_1D.csv",
        r"C:\Users\joris\Desktop\Data\CME_DL_6E1!, 1D_7e1f0.csv",
    ],
    "6B1": [
        r"C:\Users\joris\Desktop\Core_Invest_Data\Futures\6B1_1D.csv",
        r"C:\Users\joris\Desktop\Data\CME_DL_6B1!, 1D_52fb8.csv",
    ],
    "6J1": [
        r"C:\Users\joris\Desktop\Core_Invest_Data\Futures\6J1_1D.csv",
        r"C:\Users\joris\Desktop\Data\CME_DL_6J1!, 1D_96213.csv",
    ],
    "ZB1": [r"C:\Users\joris\Desktop\Core_Invest_Data\Futures\ZB1_1D.csv"],
    "RB1": [
        r"C:\Users\joris\Desktop\Energy\NYMEX_DL_RB1!, 1D_37e39.csv",
        r"C:\Users\joris\Desktop\Seasonal\NYMEX_DL_RB1!, 1D_5a102.csv",
    ],
    # ─── ETFs ────────────────────────────────────────────────────────
    "SPY": [
        r"C:\Users\joris\Desktop\Core_Invest_Data\ETFs\SPY_1D.csv",
        r"C:\Users\joris\Desktop\Data\BATS_SPY, 1D_bb5e9.csv",
    ],
    "QQQ": [r"C:\Users\joris\Desktop\Core_Invest_Data\ETFs\QQQ_1D.csv"],
    "GLD": [r"C:\Users\joris\Desktop\Core_Invest_Data\ETFs\GLD_1D.csv"],
    "TLT": [r"C:\Users\joris\Desktop\Core_Invest_Data\ETFs\TLT_1D.csv"],
    "IEF": [r"C:\Users\joris\Desktop\Core_Invest_Data\ETFs\IEF_1D.csv"],
    "LQD": [r"C:\Users\joris\Desktop\Core_Invest_Data\ETFs\LQD_1D.csv"],
    "EFA": [r"C:\Users\joris\Desktop\Core_Invest_Data\ETFs\EFA_1D.csv"],
    "EEM": [r"C:\Users\joris\Desktop\Core_Invest_Data\ETFs\EEM_1D.csv"],
    "VNQ": [r"C:\Users\joris\Desktop\Core_Invest_Data\ETFs\VNQ_1D.csv"],
    "DBC": [r"C:\Users\joris\Desktop\Core_Invest_Data\ETFs\DBC_1D.csv"],
    "HYG": [
        r"C:\Users\joris\Desktop\Core_Invest_Data\ETFs\HYG_1D.csv",
        r"C:\Users\joris\Desktop\Seasonal\BATS_HYG, 1D_95980.csv",
    ],
    "IWM": [r"C:\Users\joris\Desktop\Core_Invest_Data\ETFs\IWM_1D.csv"],
    "SHY": [r"C:\Users\joris\Desktop\Core_Invest_Data\ETFs\SHY_1D.csv"],
    "COPX": [r"C:\Users\joris\Desktop\Seasonal\BATS_COPX, 1D_cee9b.csv"],
    # ─── Stocks ──────────────────────────────────────────────────────
    "AAPL": [r"C:\Users\joris\Desktop\Aktien\BATS_AAPL, 1D_17e3e.csv"],
    "MSFT": [r"C:\Users\joris\Desktop\Aktien\BATS_MSFT, 1D_503af.csv"],
    "NVDA": [r"C:\Users\joris\Desktop\Aktien\BATS_NVDA, 1D_ec837.csv"],
    "AMZN": [r"C:\Users\joris\Desktop\Aktien\BATS_AMZN, 1D_4c034.csv"],
    "META": [r"C:\Users\joris\Desktop\Aktien\BATS_META, 1D_df7e3.csv"],
    "GOOGL": [r"C:\Users\joris\Desktop\Aktien\BATS_GOOGL, 1D_354cb.csv"],
}


def load_asset(symbol: str) -> pd.DataFrame | None:
    paths = ASSET_PATHS.get(symbol, [])
    dfs = []
    for path in paths:
        if not os.path.exists(path):
            continue
        df = pd.read_csv(path)
        df.columns = [c.strip().lower() for c in df.columns]
        if "time" not in df.columns:
            time_col = [c for c in df.columns if "date" in c or "time" in c]
            if not time_col:
                continue
            df = df.rename(columns={time_col[0]: "time"})
        df["time"] = pd.to_datetime(df["time"], errors="coerce")
        df = df.dropna(subset=["time"])
        dfs.append(df)

    if not dfs:
        return None

    merged = pd.concat(dfs, ignore_index=True)
    merged = merged.drop_duplicates(subset=["time"], keep="first")
    merged = merged.sort_values("time").reset_index(drop=True)
    return merged


def load_all() -> dict[str, pd.DataFrame]:
    result = {}
    for symbol in ASSET_PATHS:
        df = load_asset(symbol)
        if df is not None:
            result[symbol] = df
    return result


if __name__ == "__main__":
    print("DATENSTATUS (Extended):")
    print("=" * 80)
    for symbol in sorted(ASSET_PATHS.keys()):
        df = load_asset(symbol)
        if df is None:
            print(f"{symbol:5s}: KEINE DATEN")
            continue
        has_ohlc = all(c in df.columns for c in ["open", "high", "low", "close"])
        first = df["time"].iloc[0].date()
        last = df["time"].iloc[-1].date()
        years = (last - first).days / 365.25
        print(
            f"{symbol:5s}: {len(df):>6,} Bars | "
            f"{first} -> {last} ({years:.1f}y) | "
            f"OHLC: {'ja' if has_ohlc else 'FEHLT'}"
        )
    print("=" * 80)
