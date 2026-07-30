export type OhlcQualityInput = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  tick?: boolean;
};

export type OhlcQualityEvent = {
  time: string;
  severity: "repair" | "quarantine" | "warning";
  flag:
    | "non_finite"
    | "non_positive"
    | "body_outside_range"
    | "close_outlier"
    | "wick_outlier"
    | "future_timestamp"
    | "tick_session_extreme"
    | "duplicate_timestamp"
    | "unsorted_input"
    | "interval_gap";
  method: string;
  original: OhlcQualityInput;
  corrected: OhlcQualityInput | null;
};

export type OhlcQualityResult = {
  accepted: OhlcQualityInput[];
  quarantined: OhlcQualityInput[];
  events: OhlcQualityEvent[];
  flags: string[];
};

export function validateAndRepairOhlc(
  input: OhlcQualityInput[],
  options: { intraday: boolean; nowMs?: number },
): OhlcQualityResult {
  const events: OhlcQualityEvent[] = [];
  const quarantined: OhlcQualityInput[] = [];
  const repaired: OhlcQualityInput[] = [];
  const nowMs = options.nowMs ?? Date.now();
  let previousInputTime = Number.NEGATIVE_INFINITY;
  for (const raw of input) {
    const currentTime = Date.parse(options.intraday ? raw.time : `${raw.time.slice(0, 10)}T00:00:00Z`);
    if (Number.isFinite(currentTime) && currentTime < previousInputTime) {
      events.push({
        time: raw.time,
        severity: "repair",
        flag: "unsorted_input",
        method: "Sort accepted bars by timestamp before downstream use",
        original: { ...raw },
        corrected: { ...raw },
      });
    }
    if (Number.isFinite(currentTime)) previousInputTime = currentTime;
  }

  const sortedInput = [...input].sort((left, right) => left.time.localeCompare(right.time));
  const seenTimes = new Set<string>();
  for (const raw of sortedInput) {
    const original = { ...raw };
    if (seenTimes.has(raw.time)) {
      quarantine(raw, original, "duplicate_timestamp", "Keep first timestamp and quarantine duplicate", events, quarantined);
      continue;
    }
    seenTimes.add(raw.time);
    if (![raw.open, raw.high, raw.low, raw.close].every(Number.isFinite)) {
      quarantine(raw, original, "non_finite", "Reject non-finite OHLC value", events, quarantined);
      continue;
    }
    if ([raw.open, raw.high, raw.low, raw.close].some((value) => value <= 0)) {
      quarantine(raw, original, "non_positive", "Reject zero or negative price", events, quarantined);
      continue;
    }
    const timestamp = Date.parse(options.intraday ? raw.time : `${raw.time.slice(0, 10)}T00:00:00Z`);
    if (!Number.isFinite(timestamp) || timestamp > nowMs + 60_000) {
      quarantine(raw, original, "future_timestamp", "Reject invalid or future period", events, quarantined);
      continue;
    }

    let current = { ...raw };
    const bodyHigh = Math.max(current.open, current.close);
    const bodyLow = Math.min(current.open, current.close);
    if (current.high < bodyHigh || current.low > bodyLow || current.low > current.high) {
      current = {
        ...current,
        high: Math.max(current.high, bodyHigh),
        low: Math.min(current.low, bodyLow),
      };
      events.push({
        time: current.time,
        severity: "repair",
        flag: "body_outside_range",
        method: "Expand high/low only to contain open and close; original retained in event",
        original,
        corrected: { ...current },
      });
    }

    if (options.intraday && current.tick) {
      const maxExtra = Math.max(Math.abs(current.close) * 0.0035, 1e-6);
      const corrected = {
        ...current,
        high: Math.max(bodyHigh, Math.min(current.high, bodyHigh + maxExtra)),
        low: Math.min(bodyLow, Math.max(current.low, bodyLow - maxExtra)),
      };
      if (corrected.high !== current.high || corrected.low !== current.low) {
        events.push({
          time: current.time,
          severity: "repair",
          flag: "tick_session_extreme",
          method: "Cap tick-built session extreme to 0.35% around candle body",
          original: { ...current },
          corrected: { ...corrected },
        });
        current = corrected;
      }
    }
    repaired.push(current);
  }

  const closes = repaired.map((bar) => bar.close).sort((a, b) => a - b);
  const p90 = closes[Math.max(0, Math.floor(closes.length * 0.9) - 1)] ?? null;
  const maxClose = closes.at(-1) ?? null;
  const accepted = repaired.filter((bar) => {
    if (repaired.length < 3 || p90 === null || maxClose === null || p90 <= 0) return true;
    const minAllowed = Math.max(p90 * 0.1, maxClose * 0.02);
    if (bar.close < minAllowed || bar.close > p90 * 20) {
      quarantine(bar, bar, "close_outlier", "Quarantine close outside robust cross-series range", events, quarantined);
      return false;
    }
    if (bar.low < bar.close * 0.2 || bar.high > bar.close * 5) {
      quarantine(bar, bar, "wick_outlier", "Quarantine extreme wick relative to close", events, quarantined);
      return false;
    }
    return true;
  });

  for (let index = 1; index < accepted.length; index += 1) {
    const previous = accepted[index - 1]!;
    const current = accepted[index]!;
    const gapMs = Date.parse(`${current.time.slice(0, 10)}T00:00:00Z`) - Date.parse(`${previous.time.slice(0, 10)}T00:00:00Z`);
    if (!options.intraday && gapMs > 7 * 24 * 60 * 60 * 1000) {
      events.push({
        time: current.time,
        severity: "warning",
        flag: "interval_gap",
        method: `Observed calendar gap after ${previous.time}; exchange-calendar review required`,
        original: { ...current },
        corrected: { ...current },
      });
    }
  }

  return {
    accepted,
    quarantined,
    events,
    flags: [...new Set(events.map((event) => event.flag))],
  };
}

function quarantine(
  row: OhlcQualityInput,
  original: OhlcQualityInput,
  flag: OhlcQualityEvent["flag"],
  method: string,
  events: OhlcQualityEvent[],
  quarantined: OhlcQualityInput[],
) {
  quarantined.push({ ...row });
  events.push({
    time: row.time,
    severity: "quarantine",
    flag,
    method,
    original,
    corrected: null,
  });
}
