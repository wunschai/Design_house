import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getCachedResponse,
  registerPending,
  resolveDoneAck,
  _clearCacheForTesting,
  _getCacheSizeForTesting,
} from "./correlation-cache.js";

beforeEach(() => {
  _clearCacheForTesting();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("correlation-cache", () => {
  describe("getCachedResponse", () => {
    it("should return null for unknown correlationId", () => {
      expect(getCachedResponse("unknown-id")).toBeNull();
    });

    it("should return cached response after resolve", async () => {
      const promise = registerPending("id1");
      resolveDoneAck("id1", { ok: true, timedOut: false, consoleErrors: [] });
      const result = await promise;
      expect(result.ok).toBe(true);
      expect(getCachedResponse("id1")).toEqual(result);
    });
  });

  describe("registerPending - idempotency dedupe", () => {
    it("should allow registering multiple different correlationIds", () => {
      registerPending("id-a");
      registerPending("id-b");
      expect(_getCacheSizeForTesting()).toBe(2);
    });

    it("should resolve with done-ack data", async () => {
      const promise = registerPending("id2");
      resolveDoneAck("id2", { ok: true, timedOut: false, consoleErrors: ["err1"] });
      const result = await promise;
      expect(result).toEqual({ ok: true, timedOut: false, consoleErrors: ["err1"] });
    });

    it("should timeout after 5s and resolve with ok:false timedOut:true", async () => {
      const promise = registerPending("timeout-id", 5_000);
      vi.advanceTimersByTime(5_001);
      const result = await promise;
      expect(result.ok).toBe(false);
      expect(result.timedOut).toBe(true);
      expect(result.consoleErrors).toEqual([]);
    });
  });

  describe("TTL eviction", () => {
    it("should evict entries after 60s TTL on next access", () => {
      const promise = registerPending("old-id");
      // resolve it so it's in resolvedResponse state
      resolveDoneAck("old-id", { ok: true, timedOut: false, consoleErrors: [] });
      expect(_getCacheSizeForTesting()).toBe(1);

      // advance time > 60s
      vi.advanceTimersByTime(61_000);

      // lazy eviction triggered on next getCachedResponse call
      getCachedResponse("any");
      expect(_getCacheSizeForTesting()).toBe(0);
      // avoid unhandled promise rejection
      return promise;
    });
  });

  describe("LRU eviction at capacity 1000", () => {
    it("should evict oldest entry when capacity is exceeded", () => {
      // 填滿 1000 entries
      for (let i = 0; i < 1000; i++) {
        registerPending(`cap-${i}`);
      }
      expect(_getCacheSizeForTesting()).toBe(1000);

      // 新增第 1001 個 → 最舊的 cap-0 被淘汰
      registerPending("cap-1000");
      expect(_getCacheSizeForTesting()).toBe(1000);
      expect(getCachedResponse("cap-0")).toBeNull(); // evicted
      expect(_getCacheSizeForTesting()).toBeLessThanOrEqual(1000); // cap-0 evicted by getLRU
    });
  });

  describe("遲到 ack (late ack drop)", () => {
    it("should drop late ack for unknown correlationId and log warn", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      resolveDoneAck("nonexistent-id", { ok: true, timedOut: false, consoleErrors: [] });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Late ack"));
      warnSpy.mockRestore();
    });

    it("should drop late ack for already-resolved entry and log warn", async () => {
      const promise = registerPending("resolved-id");
      resolveDoneAck("resolved-id", { ok: true, timedOut: false, consoleErrors: [] });
      await promise;

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      // 二次 ack → drop
      resolveDoneAck("resolved-id", { ok: true, timedOut: false, consoleErrors: [] });
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Late ack"));
      warnSpy.mockRestore();
    });
  });

  describe("second request with same correlationId (idempotency)", () => {
    it("should return cached response for duplicate correlationId", async () => {
      const promise = registerPending("dup-id");
      resolveDoneAck("dup-id", { ok: true, timedOut: false, consoleErrors: [] });
      await promise;

      // 二次查詢 → 拿 cached
      const cached = getCachedResponse("dup-id");
      expect(cached).toEqual({ ok: true, timedOut: false, consoleErrors: [] });
    });
  });
});
