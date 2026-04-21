// slug 正規化工具
// kebab-case、CJK → project-<timestamp>、碰撞 suffix -2/-3

/**
 * 將任意字串正規化為 kebab-case slug。
 * CJK 字元含量多 (>50%) 時，改用 project-<timestamp>。
 */
export function normalizeSlug(name: string, timestamp?: number): string {
  const trimmed = name.trim();
  if (!trimmed) return `project-${timestamp ?? Date.now()}`;

  // 計算 CJK 字元比例
  const cjkCount = (trimmed.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g) ?? []).length;
  if (cjkCount / trimmed.length > 0.5) {
    return `project-${timestamp ?? Date.now()}`;
  }

  return trimmed
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")    // 移除非英數字
    .replace(/[\s_]+/g, "-")     // 空白與底線轉 hyphen
    .replace(/--+/g, "-")        // 合併多個 hyphen
    .replace(/^-+|-+$/g, "")     // 去掉首尾 hyphen
    || `project-${timestamp ?? Date.now()}`;
}

/**
 * 若 slug 已存在於已知 slugs，則追加 -2、-3... 直到不碰撞。
 */
export function resolveSlugCollision(slug: string, existingSlugs: Set<string>): string {
  if (!existingSlugs.has(slug)) return slug;
  let counter = 2;
  while (existingSlugs.has(`${slug}-${counter}`)) {
    counter++;
  }
  return `${slug}-${counter}`;
}
