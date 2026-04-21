// @design-house/shared/weighted-length.test.ts
import { describe, it, expect } from "vitest";
import {
  weightedLength,
  isCjkCodePoint,
  isShortConceptualPrompt,
  isWithinSummaryLimit,
} from "./weighted-length.js";

describe("weightedLength — basic", () => {
  it("empty string → 0", () => {
    expect(weightedLength("")).toBe(0);
  });

  it("pure ASCII counts 1 each", () => {
    expect(weightedLength("hello")).toBe(5);
  });

  it("pure CJK counts 2 each", () => {
    expect(weightedLength("你好")).toBe(4);
    expect(weightedLength("一個")).toBe(4);
  });

  it("mixed CJK + ASCII: '做一個 button' = 3*2 + 1 + 6 = 13", () => {
    // spec AC-3.0 example: '做一個 button' = 3 CJK × 2 + ' ' + 'button' = 6 + 1 + 6 = 13
    // Note: spec doc rounded to 15 but let's be precise — space + 'button' = 7 ASCII chars
    expect(weightedLength("做一個 button")).toBe(6 + 1 + 6);
  });

  it("punctuation (ASCII) counts 1", () => {
    expect(weightedLength("hello, world!")).toBe(13);
  });

  it("fullwidth punctuation (CJK range) counts 2", () => {
    // '，' (U+FF0C) is fullwidth comma, in CJK Fullwidth range
    expect(weightedLength("你好，世界")).toBe(10); // 5 chars × 2
  });

  it("emoji surrogate pair counts 1 code point (1 weight since not CJK)", () => {
    expect(weightedLength("🦄")).toBe(1);
  });

  it("Japanese hiragana counts 2 each", () => {
    expect(weightedLength("あいう")).toBe(6);
  });

  it("Korean hangul counts 2 each", () => {
    expect(weightedLength("안녕")).toBe(4);
  });
});

describe("isCjkCodePoint", () => {
  it("detects CJK Unified Ideographs", () => {
    expect(isCjkCodePoint("中".codePointAt(0)!)).toBe(true);
  });

  it("rejects ASCII", () => {
    expect(isCjkCodePoint("a".codePointAt(0)!)).toBe(false);
    expect(isCjkCodePoint("0".codePointAt(0)!)).toBe(false);
  });

  it("detects Hiragana", () => {
    expect(isCjkCodePoint("あ".codePointAt(0)!)).toBe(true);
  });

  it("detects Fullwidth", () => {
    expect(isCjkCodePoint(0xff01)).toBe(true); // ！
  });

  it("rejects emoji (not in CJK blocks)", () => {
    expect(isCjkCodePoint(0x1f984)).toBe(false); // 🦄
  });
});

describe("isShortConceptualPrompt — AC-3.0 Understand heuristic", () => {
  it("short CJK prompt triggers", () => {
    expect(isShortConceptualPrompt("做一個 button")).toBe(true); // 13 < 60
  });

  it("short English prompt triggers", () => {
    expect(isShortConceptualPrompt("build me a login page")).toBe(true); // 21 < 60
  });

  it("long prompt does not trigger", () => {
    const long = "請幫我製作一個登入頁面，包含電子郵件欄位、密碼欄位、忘記密碼連結、記住我的 checkbox，以及清楚的錯誤訊息顯示區域";
    // > 60 weighted chars, should NOT trigger
    expect(isShortConceptualPrompt(long)).toBe(false);
  });

  it("custom threshold is honored", () => {
    expect(isShortConceptualPrompt("hello", 10)).toBe(true); // 5 < 10
    expect(isShortConceptualPrompt("hello world long enough", 10)).toBe(false);
  });
});

describe("isWithinSummaryLimit — AC-4.7", () => {
  it("short summary passes", () => {
    expect(isWithinSummaryLimit("已完成，請檢視 index.html")).toBe(true);
  });

  it("exactly 500 weighted passes (boundary)", () => {
    const s = "a".repeat(500);
    expect(isWithinSummaryLimit(s)).toBe(true);
  });

  it("501 weighted fails", () => {
    const s = "a".repeat(501);
    expect(isWithinSummaryLimit(s)).toBe(false);
  });

  it("250 CJK chars (= 500 weighted) passes boundary", () => {
    const s = "好".repeat(250);
    expect(isWithinSummaryLimit(s)).toBe(true);
  });

  it("251 CJK chars (= 502 weighted) fails", () => {
    const s = "好".repeat(251);
    expect(isWithinSummaryLimit(s)).toBe(false);
  });
});
