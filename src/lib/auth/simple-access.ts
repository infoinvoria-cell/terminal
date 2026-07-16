export const SIMPLE_ACCESS_UNLOCK_KEY = "capitalife.simpleAccess.unlocked";
export const SIMPLE_ACCESS_ATTEMPTS_KEY = "capitalife.simpleAccess.attempts";
export const SIMPLE_ACCESS_LOCKOUT_UNTIL_KEY = "capitalife.simpleAccess.lockoutUntil";
export const SIMPLE_ACCESS_LOCKOUT_MS = 24 * 60 * 60 * 1000;
export const SIMPLE_ACCESS_MAX_ATTEMPTS = 3;

export type SimpleAccessState = {
  unlocked: boolean;
  attempts: number;
  lockedUntil: number | null;
};

function safeWindow() {
  return typeof window !== "undefined" ? window : null;
}

function readNumber(key: string): number {
  const win = safeWindow();
  if (!win) return 0;
  const value = Number.parseInt(win.localStorage.getItem(key) ?? "0", 10);
  return Number.isFinite(value) ? value : 0;
}

function writeNumber(key: string, value: number) {
  const win = safeWindow();
  if (!win) return;
  win.localStorage.setItem(key, String(value));
}

function readBoolean(key: string): boolean {
  const win = safeWindow();
  if (!win) return false;
  return win.localStorage.getItem(key) === "true";
}

function writeBoolean(key: string, value: boolean) {
  const win = safeWindow();
  if (!win) return;
  win.localStorage.setItem(key, value ? "true" : "false");
}

export function getSimpleAccessState(): SimpleAccessState {
  const lockedUntil = readNumber(SIMPLE_ACCESS_LOCKOUT_UNTIL_KEY);
  const now = Date.now();
  if (lockedUntil > 0 && lockedUntil <= now) {
    resetSimpleAccessFailures();
  }
  const activeLockedUntil = lockedUntil > now ? lockedUntil : null;
  return {
    unlocked: readBoolean(SIMPLE_ACCESS_UNLOCK_KEY) && !activeLockedUntil,
    attempts: readNumber(SIMPLE_ACCESS_ATTEMPTS_KEY),
    lockedUntil: activeLockedUntil,
  };
}

export function unlockSimpleAccess() {
  writeBoolean(SIMPLE_ACCESS_UNLOCK_KEY, true);
  resetSimpleAccessFailures();
}

export function resetSimpleAccessFailures() {
  writeNumber(SIMPLE_ACCESS_ATTEMPTS_KEY, 0);
  writeNumber(SIMPLE_ACCESS_LOCKOUT_UNTIL_KEY, 0);
}

export function clearSimpleAccess() {
  writeBoolean(SIMPLE_ACCESS_UNLOCK_KEY, false);
  resetSimpleAccessFailures();
}

export function registerSimpleAccessFailure(): SimpleAccessState {
  const attempts = readNumber(SIMPLE_ACCESS_ATTEMPTS_KEY) + 1;
  writeNumber(SIMPLE_ACCESS_ATTEMPTS_KEY, attempts);
  writeBoolean(SIMPLE_ACCESS_UNLOCK_KEY, false);

  if (attempts >= SIMPLE_ACCESS_MAX_ATTEMPTS) {
    const lockedUntil = Date.now() + SIMPLE_ACCESS_LOCKOUT_MS;
    writeNumber(SIMPLE_ACCESS_LOCKOUT_UNTIL_KEY, lockedUntil);
    return {
      unlocked: false,
      attempts,
      lockedUntil,
    };
  }

  return {
    unlocked: false,
    attempts,
    lockedUntil: null,
  };
}

export function isSimpleAccessPasswordValid(input: string, expectedPassword: string) {
  return input.trim() === expectedPassword.trim();
}
