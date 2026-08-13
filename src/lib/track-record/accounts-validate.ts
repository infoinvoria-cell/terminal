/**
 * Server-only. Validates account config completeness.
 * NEVER outputs field values — only field names and boolean status.
 */

import type { Mt4AccountConfig, Mt5AccountConfig, AccountsConfig } from "./accounts-config";

type ValidationResult = {
  accountId: string;
  platform: string;
  enabled: boolean;
  missingFields: string[];
  isComplete: boolean;
};

const MT4_REQUIRED: (keyof Mt4AccountConfig)[] = [
  "login",
  "server",
  "terminalPath",
  "currency",
  "brokerTimezone",
  "bridgeToken",
];

const MT5_REQUIRED: (keyof Mt5AccountConfig)[] = [
  "login",
  "server",
  "terminalPath",
  "currency",
  "brokerTimezone",
];

function validateMt4(cfg: Mt4AccountConfig): ValidationResult {
  const missing = MT4_REQUIRED.filter((k) => !cfg[k]);
  return {
    accountId: cfg.id,
    platform: "MT4",
    enabled: cfg.enabled,
    missingFields: missing,
    isComplete: missing.length === 0,
  };
}

function validateMt5(cfg: Mt5AccountConfig): ValidationResult {
  const missing = MT5_REQUIRED.filter((k) => !cfg[k]);
  return {
    accountId: cfg.id,
    platform: "MT5",
    enabled: cfg.enabled,
    missingFields: missing,
    isComplete: missing.length === 0,
  };
}

export type AccountsValidation = {
  account1: ValidationResult;
  account2: ValidationResult;
  syncEnabled: boolean;
  myfxbookEnabled: boolean;
  canSync: boolean;
};

export function validateAccountsConfig(cfg: AccountsConfig): AccountsValidation {
  const a1 = validateMt4(cfg.account1);
  const a2 = validateMt5(cfg.account2);
  return {
    account1: a1,
    account2: a2,
    syncEnabled: cfg.sync.enabled,
    myfxbookEnabled: cfg.myfxbook.enabled,
    canSync:
      cfg.sync.enabled &&
      (cfg.account1.enabled ? a1.isComplete : true) &&
      (cfg.account2.enabled ? a2.isComplete : true),
  };
}
