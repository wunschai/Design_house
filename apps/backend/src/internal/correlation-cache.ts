// ADR-010 idempotency cache — correlationId → pending/resolved map
// TTL: 60s, 容量: 1000 entries（LRU by insertion order）
import type { DoneOutput } from "@design-house/shared/mcp-tools";

const TTL_MS = 60_000;
const CAPACITY = 1000;

interface CacheEntry {
  resolvedResponse?: DoneOutput;
  pendingUntil: number;
  expiresAt: number; // 最後存取後 60s
  resolve?: (output: DoneOutput) => void;
  reject?: (err: Error) => void;
}

const _cache = new Map<string, CacheEntry>();

// ── Lazy eviction ─────────────────────────────────────────────────

function evictExpired(): void {
  const now = Date.now();
  for (const [id, entry] of _cache) {
    if (now > entry.expiresAt) {
      _cache.delete(id);
    }
  }
}

function evictLru(): void {
  // Map 保持插入順序，delete 最舊的那個
  const first = _cache.keys().next().value;
  if (first !== undefined) {
    _cache.delete(first);
  }
}

// ── 對外 API ──────────────────────────────────────────────────────

/**
 * 檢查 correlationId 是否已有 cached response（idempotency dedupe）。
 * 回傳 cached DoneOutput 或 null。
 */
export function getCachedResponse(correlationId: string): DoneOutput | null {
  evictExpired();
  const entry = _cache.get(correlationId);
  if (!entry) return null;
  return entry.resolvedResponse ?? null;
}

/**
 * 為 done tool 請求建立 pending entry。
 * 回傳一個 Promise，在 UI ack 或 timeout 時 resolve。
 */
export function registerPending(
  correlationId: string,
  timeoutMs = 5_000
): Promise<DoneOutput> {
  evictExpired();

  // 容量上限：LRU 淘汰
  if (_cache.size >= CAPACITY) {
    evictLru();
  }

  return new Promise<DoneOutput>((resolve, reject) => {
    const now = Date.now();
    const pendingUntil = now + timeoutMs;
    const expiresAt = now + TTL_MS;
    _cache.set(correlationId, { pendingUntil, expiresAt, resolve, reject });

    // 5s timeout
    setTimeout(() => {
      const entry = _cache.get(correlationId);
      if (entry && !entry.resolvedResponse) {
        const output: DoneOutput = { ok: false, timedOut: true, consoleErrors: [] };
        entry.resolvedResponse = output;
        entry.resolve?.(output);
      }
    }, timeoutMs);
  });
}

/**
 * UI 送 done-ack 時呼叫，resolve pending Promise。
 * 若 entry 不存在或已過 TTL → warn + drop。
 */
export function resolveDoneAck(correlationId: string, ackData: { ok: boolean; timedOut: boolean; consoleErrors: string[] }): void {
  evictExpired();
  const entry = _cache.get(correlationId);
  if (!entry) {
    // 遲到 ack — drop
    console.warn(`[correlation-cache] Late ack for unknown correlationId: ${correlationId}`);
    return;
  }
  if (entry.resolvedResponse) {
    // 已解決（可能已 timeout），drop
    console.warn(`[correlation-cache] Late ack for already-resolved correlationId: ${correlationId}`);
    return;
  }

  const output: DoneOutput = {
    ok: ackData.ok,
    timedOut: ackData.timedOut,
    consoleErrors: ackData.consoleErrors,
  };
  entry.resolvedResponse = output;
  entry.expiresAt = Date.now() + TTL_MS; // 重置 TTL
  entry.resolve?.(output);
}

// ── 測試輔助（僅測試使用）────────────────────────────────────────

export function _clearCacheForTesting(): void {
  _cache.clear();
}

export function _getCacheSizeForTesting(): number {
  return _cache.size;
}
