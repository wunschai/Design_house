import { describe, it, expect } from "vitest";
import { normalizeSlug, resolveSlugCollision } from "./slug.js";

describe("normalizeSlug", () => {
  it("should convert spaces to hyphens", () => {
    expect(normalizeSlug("my project")).toBe("my-project");
  });

  it("should lowercase the slug", () => {
    expect(normalizeSlug("MyProject")).toBe("myproject");
  });

  it("should remove special characters", () => {
    expect(normalizeSlug("my!@#project")).toBe("myproject");
  });

  it("should handle CJK-heavy names by using project-<ts>", () => {
    const slug = normalizeSlug("我的專案設計", 12345);
    expect(slug).toBe("project-12345");
  });

  it("should handle ASCII names normally", () => {
    expect(normalizeSlug("design-artifact")).toBe("design-artifact");
  });

  it("should return project-<ts> for empty string", () => {
    const slug = normalizeSlug("", 99999);
    expect(slug).toBe("project-99999");
  });

  it("should collapse multiple hyphens", () => {
    expect(normalizeSlug("my--project")).toBe("my-project");
  });
});

describe("resolveSlugCollision", () => {
  it("should return same slug if no collision", () => {
    const result = resolveSlugCollision("my-project", new Set());
    expect(result).toBe("my-project");
  });

  it("should add -2 suffix on first collision", () => {
    const result = resolveSlugCollision("my-project", new Set(["my-project"]));
    expect(result).toBe("my-project-2");
  });

  it("should add -3 suffix on second collision", () => {
    const result = resolveSlugCollision(
      "my-project",
      new Set(["my-project", "my-project-2"])
    );
    expect(result).toBe("my-project-3");
  });
});
