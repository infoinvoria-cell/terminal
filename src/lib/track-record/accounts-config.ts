/**
 * Server-only. Never import from client components.
 * All values come from env — never exposed to the browser.
 */

export type Mt4BridgeMode = "FILE" | "HTTP";
export type AccountPlatform = "MT4" | "MT5";

export type Mt4AccountConfig = {
  id: string;
  enabled: boolean;
  displayName: string;
  platform: "MT4";
  broker: string;
  login: string;
  server: string;
  terminalPath: string;
  dataPath: string;
  currency: string;
  brokerTimezone: string;
  bridgeMode: Mt4BridgeMode;
  /** Token for FILE/HTTP bridge endpoint auth — never logged */
  bridgeToken: string;
};

export type Mt5AccountConfig = {
  id: string;
  enabled: boolean;
  displayName: string;
  platform: "MT5";
  broker: string;
  login: string;
  server: string;
  terminalPath: string;
  currency: string;
  brokerTimezone: string;
};

export type MyfxbookConfig = {
  enabled: boolean;
};

export type SyncConfig = {
  enabled: boolean;
  intervalSeconds: number;
};

export type AccountsConfig = {
  account1: Mt4AccountConfig;
  account2: Mt5AccountConfig;
  myfxbook: MyfxbookConfig;
  sync: SyncConfig;
};

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

function envBool(name: string): boolean {
  return env(name).toLowerCase() === "true";
}

function envInt(name: string, fallback: number): number {
  const v = parseInt(env(name), 10);
  return isNaN(v) ? fallback : v;
}

function bridgeMode(raw: string): Mt4BridgeMode {
  return raw.toUpperCase() === "HTTP" ? "HTTP" : "FILE";
}

export function getAccountsConfig(): AccountsConfig {
  return {
    account1: {
      id: env("TRACK_ACCOUNT_1_ID") || "account_1",
      enabled: envBool("TRACK_ACCOUNT_1_ENABLED"),
      displayName: env("TRACK_ACCOUNT_1_DISPLAY_NAME") || "Account 1",
      platform: "MT4",
      broker: env("TRACK_ACCOUNT_1_BROKER"),
      login: env("TRACK_ACCOUNT_1_LOGIN"),
      server: env("TRACK_ACCOUNT_1_SERVER"),
      terminalPath: env("TRACK_ACCOUNT_1_TERMINAL_PATH"),
      dataPath: env("TRACK_ACCOUNT_1_DATA_PATH"),
      currency: env("TRACK_ACCOUNT_1_CURRENCY"),
      brokerTimezone: env("TRACK_ACCOUNT_1_BROKER_TIMEZONE"),
      bridgeMode: bridgeMode(env("TRACK_ACCOUNT_1_BRIDGE_MODE")),
      bridgeToken: env("TRACK_ACCOUNT_1_BRIDGE_TOKEN"),
    },
    account2: {
      id: env("TRACK_ACCOUNT_2_ID") || "account_2",
      enabled: envBool("TRACK_ACCOUNT_2_ENABLED"),
      displayName: env("TRACK_ACCOUNT_2_DISPLAY_NAME") || "Account 2",
      platform: "MT5",
      broker: env("TRACK_ACCOUNT_2_BROKER"),
      login: env("TRACK_ACCOUNT_2_LOGIN"),
      server: env("TRACK_ACCOUNT_2_SERVER"),
      terminalPath: env("TRACK_ACCOUNT_2_TERMINAL_PATH"),
      currency: env("TRACK_ACCOUNT_2_CURRENCY"),
      brokerTimezone: env("TRACK_ACCOUNT_2_BROKER_TIMEZONE"),
    },
    myfxbook: {
      enabled: envBool("MYFXBOOK_ENABLED"),
    },
    sync: {
      enabled: envBool("TRACK_RECORD_SYNC_ENABLED"),
      intervalSeconds: envInt("TRACK_RECORD_SYNC_INTERVAL_SECONDS", 30),
    },
  };
}

/** Returns true only if the account is explicitly enabled AND sync is enabled. */
export function isAccountSyncReady(
  account: Mt4AccountConfig | Mt5AccountConfig,
  sync: SyncConfig,
): boolean {
  return account.enabled && sync.enabled;
}
