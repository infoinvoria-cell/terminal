import { describe, it, expect, beforeEach } from "vitest";
import {
  putQuote, getQuote, getAllQuotes, clearCache, deriveStatus,
} from "../data-manager";

describe("DataManager", () => {
  beforeEach(() => clearCache());

  describe("deriveStatus", () => {
    it("returns 'historical' for local_csv regardless of age", () => {
      expect(deriveStatus("local_csv", null)).toBe("historical");
      expect(deriveStatus("local_csv", new Date().toISOString())).toBe("historical");
    });

    it("returns 'live' for dukascopy", () => {
      expect(deriveStatus("dukascopy", new Date().toISOString())).toBe("live");
    });

    it("returns 'unavailable' for synthetic", () => {
      expect(deriveStatus("synthetic", null)).toBe("unavailable");
    });

    it("returns 'unavailable' when updatedAt is null (non-local)", () => {
      expect(deriveStatus("supabase_quotes", null)).toBe("unavailable");
    });

    it("returns 'stale' when data is 35 minutes old", () => {
      const old = new Date(Date.now() - 35 * 60 * 1_000).toISOString();
      expect(deriveStatus("supabase_quotes", old)).toBe("stale");
    });

    it("returns 'unavailable' when data is 3 hours old", () => {
      const veryOld = new Date(Date.now() - 3 * 60 * 60 * 1_000).toISOString();
      expect(deriveStatus("supabase_quotes", veryOld)).toBe("unavailable");
    });

    it("returns 'delayed' for fresh supabase_quotes", () => {
      const fresh = new Date(Date.now() - 10_000).toISOString();
      expect(deriveStatus("supabase_quotes", fresh)).toBe("delayed");
    });
  });

  describe("putQuote / getQuote", () => {
    it("stores and retrieves a quote", () => {
      const now = new Date().toISOString();
      putQuote("6E1!", {
        open: 1.08, high: 1.09, low: 1.07, close: 1.085,
        volume: 50000, timestamp: now, updatedAt: now,
      }, "supabase_quotes");

      const q = getQuote("6E1!");
      expect(q).not.toBeNull();
      expect(q!.close).toBe(1.085);
      expect(q!.provider).toBe("supabase_quotes");
      expect(q!.status).toBe("delayed");
      expect(q!.delayMinutes).toBe(15);
    });

    it("is case-insensitive on symbol lookup", () => {
      const now = new Date().toISOString();
      putQuote("6e1!", {
        open: 1.08, high: 1.09, low: 1.07, close: 1.085,
        volume: 0, timestamp: now, updatedAt: now,
      }, "supabase_quotes");
      expect(getQuote("6E1!")).not.toBeNull();
    });

    it("returns null for unknown symbol", () => {
      expect(getQuote("UNKNOWN")).toBeNull();
    });

    it("marks dukascopy quotes as live with 0 delay", () => {
      const now = new Date().toISOString();
      putQuote("EURUSD", {
        open: 1.08, high: 1.09, low: 1.07, close: 1.085,
        volume: 0, timestamp: now, updatedAt: now,
      }, "dukascopy");

      const q = getQuote("EURUSD");
      expect(q!.status).toBe("live");
      expect(q!.delayMinutes).toBe(0);
    });
  });

  describe("getAllQuotes", () => {
    it("returns all stored quotes", () => {
      const now = new Date().toISOString();
      putQuote("GC1!", { open: 2000, high: 2010, low: 1990, close: 2005, volume: 0, timestamp: now, updatedAt: now }, "supabase_quotes");
      putQuote("6E1!", { open: 1.08, high: 1.09, low: 1.07, close: 1.085, volume: 0, timestamp: now, updatedAt: now }, "supabase_quotes");

      const all = getAllQuotes();
      expect(all.length).toBe(2);
      expect(all.map(q => q.symbol).sort()).toEqual(["6E1!", "GC1!"]);
    });
  });
});
