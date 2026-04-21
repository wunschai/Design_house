// @design-house/shared/weighted-length

/**
 * 計算字串的「加權字元數」：CJK 字元各計 2、其他各計 1。
 *
 * 用途：AC-3.0（Understand heuristic，加權 < 60 視為概念性短訊）與
 * AC-4.7（summary 加權 ≤ 500）共用同一度量。在 persona 判斷（backend
 * / CC 行為）與 AC 自動檢驗（Playwright / unit）之間避免出現兩套互不
 * 一致的計數規則。
 *
 * CJK 範圍採常用 Unicode block 聯集：
 *   - CJK Unified Ideographs               U+4E00–U+9FFF
 *   - CJK Unified Ideographs Ext A         U+3400–U+4DBF
 *   - CJK Compatibility Ideographs         U+F900–U+FAFF
 *   - Hiragana / Katakana                  U+3040–U+309F / U+30A0–U+30FF
 *   - Hangul Syllables                     U+AC00–U+D7AF
 *   - CJK Symbols and Punctuation          U+3000–U+303F
 *   - Halfwidth and Fullwidth Forms (全形) U+FF00–U+FFEF
 *
 * 其餘（包含英文、數字、Latin punctuation、emoji surrogate pair 的 high
 * surrogate 等）一律計 1。
 */
export function weightedLength(s: string): number {
  let total = 0;
  for (const ch of s) {
    // for..of 以 code point 迭代（對 surrogate pair 安全）
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    total += isCjkCodePoint(cp) ? 2 : 1;
  }
  return total;
}

/** 判定 code point 是否屬於 CJK 範圍（與 weightedLength 對應）。 */
export function isCjkCodePoint(cp: number): boolean {
  return (
    (cp >= 0x3000 && cp <= 0x303f) || // CJK Symbols and Punctuation
    (cp >= 0x3040 && cp <= 0x309f) || // Hiragana
    (cp >= 0x30a0 && cp <= 0x30ff) || // Katakana
    (cp >= 0x3400 && cp <= 0x4dbf) || // CJK Ext A
    (cp >= 0x4e00 && cp <= 0x9fff) || // CJK Unified
    (cp >= 0xac00 && cp <= 0xd7af) || // Hangul
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK Compat
    (cp >= 0xff00 && cp <= 0xffef)    // Fullwidth
  );
}

/** AC-3.0 判定：Understand 發問是否該觸發。 */
export function isShortConceptualPrompt(s: string, threshold = 60): boolean {
  return weightedLength(s) < threshold;
}

/** AC-4.7 判定：summary 是否在長度上限內。 */
export function isWithinSummaryLimit(s: string, limit = 500): boolean {
  return weightedLength(s) <= limit;
}
