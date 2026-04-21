import { describe, it, expect, beforeAll } from "vitest";
import { buildAgentMarkdown } from "./build-agent.js";

// Minimal stub for source text — enough to exercise the function
const STUB_SOURCE = `You are an expert designer working with the user as a manager.
HTML is your tool, but your medium and output format vary.

## React + Babel (for inline JSX)
<script src="https://unpkg.com/react@18.3.1/umd/react.development.js" integrity="sha384-hD6/rw4ppMLGNu3tX5cjIb+uRZ7UkRJ6BPkLpg4hAu/6onKUg4lLsHAs9EBPT82L" crossorigin="anonymous"></script>
<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js" integrity="sha384-u6aeetuaXnQ38mYT8rp6sbXaQe3NL9t+IBXmnYxwkUI2Hw4bsp2Wvmx4yRQF1uAm" crossorigin="anonymous"></script>
<script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js" integrity="sha384-m08KidiNqLdpJqLq95G/LEi8Qvjl/xUYll3QILypMoQ65QorJ9Lvtp2RXYGBFj1y" crossorigin="anonymous"></script>
`;

/**
 * Parse a minimal YAML frontmatter block.
 * Handles: scalar strings, lists (- item), and quoted strings.
 */
function parseFrontmatter(raw: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = raw.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // key: value pair
    const scalarMatch = line.match(/^(\w+):\s*(.+)$/);
    const listKeyMatch = line.match(/^(\w+):\s*$/);
    if (listKeyMatch) {
      const key = listKeyMatch[1];
      const items: string[] = [];
      i++;
      while (i < lines.length && lines[i].match(/^\s+-\s+/)) {
        items.push(lines[i].replace(/^\s+-\s+/, "").trim());
        i++;
      }
      result[key] = items;
      continue;
    } else if (scalarMatch) {
      const key = scalarMatch[1];
      let value: string = scalarMatch[2].trim();
      // strip surrounding quotes
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      result[key] = value;
    }
    i++;
  }
  return result;
}

let output: string;
let body: string;
let parsedFm: Record<string, unknown>;

beforeAll(() => {
  output = buildAgentMarkdown(STUB_SOURCE);

  // Split frontmatter from body
  const fmMatch = output.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) throw new Error("No YAML frontmatter found in output");
  const frontmatterRaw = fmMatch[1];
  body = fmMatch[2];
  parsedFm = parseFrontmatter(frontmatterRaw);
});

// ─── Frontmatter: safeParse tests ──────────────────────────────────────────

describe("YAML frontmatter structure", () => {
  it("should contain name: design-artifact", () => {
    expect(parsedFm["name"]).toBe("design-artifact");
  });

  it("should contain a non-empty description field", () => {
    expect(typeof parsedFm["description"]).toBe("string");
    expect((parsedFm["description"] as string).length).toBeGreaterThan(10);
  });

  it("should contain a tools array", () => {
    expect(Array.isArray(parsedFm["tools"])).toBe(true);
  });

  it("should have exactly 5 tools", () => {
    expect((parsedFm["tools"] as unknown[]).length).toBe(5);
  });

  it("should include mcp__design_house__read_file in tools", () => {
    expect(parsedFm["tools"]).toContain("mcp__design_house__read_file");
  });

  it("should include mcp__design_house__write_file in tools", () => {
    expect(parsedFm["tools"]).toContain("mcp__design_house__write_file");
  });

  it("should include mcp__design_house__list_files in tools", () => {
    expect(parsedFm["tools"]).toContain("mcp__design_house__list_files");
  });

  it("should include mcp__design_house__show_to_user in tools", () => {
    expect(parsedFm["tools"]).toContain("mcp__design_house__show_to_user");
  });

  it("should include mcp__design_house__done in tools", () => {
    expect(parsedFm["tools"]).toContain("mcp__design_house__done");
  });

  it("should contain a model field", () => {
    expect(typeof parsedFm["model"]).toBe("string");
    expect((parsedFm["model"] as string).length).toBeGreaterThan(0);
  });

  it("should contain a color field", () => {
    expect(parsedFm["color"]).toBeDefined();
  });
});

// ─── Body: self-positioning anchor ────────────────────────────────────────

describe("Body: self-positioning opening", () => {
  it("should contain 'You are an expert designer'", () => {
    expect(body).toContain("You are an expert designer");
  });

  it("should NOT start the body with 'I'm Claude Code'", () => {
    expect(body).not.toContain("I'm Claude Code");
    expect(body).not.toContain("As Claude Code");
    expect(body).not.toContain("I am Claude Code");
  });
});

// ─── Body: workflow six steps ─────────────────────────────────────────────

describe("Body: workflow six steps", () => {
  it("should contain Understand step", () => {
    expect(body).toContain("Understand");
  });

  it("should contain Explore step", () => {
    expect(body).toContain("Explore");
  });

  it("should contain Plan step", () => {
    expect(body).toContain("Plan");
  });

  it("should contain Build step", () => {
    expect(body).toContain("Build");
  });

  it("should contain done reference in workflow (Finish step)", () => {
    expect(body).toContain("`done`");
  });

  it("should contain Summarize step with EXTREMELY BRIEFLY", () => {
    expect(body).toContain("Summarize");
    expect(body).toContain("EXTREMELY BRIEFLY");
  });
});

// ─── Body: React+Babel pinned versions ────────────────────────────────────

describe("Body: React+Babel pinned CDN versions", () => {
  it("should contain react@18.3.1 CDN URL", () => {
    expect(body).toContain("react@18.3.1");
  });

  it("should contain react-dom@18.3.1 CDN URL", () => {
    expect(body).toContain("react-dom@18.3.1");
  });

  it("should contain @babel/standalone@7.29.0 CDN URL", () => {
    expect(body).toContain("@babel/standalone@7.29.0");
  });

  it("should contain sha384 integrity hash for react", () => {
    expect(body).toContain(
      "sha384-hD6/rw4ppMLGNu3tX5cjIb+uRZ7UkRJ6BPkLpg4hAu/6onKUg4lLsHAs9EBPT82L"
    );
  });

  it("should contain sha384 integrity hash for react-dom", () => {
    expect(body).toContain(
      "sha384-u6aeetuaXnQ38mYT8rp6sbXaQe3NL9t+IBXmnYxwkUI2Hw4bsp2Wvmx4yRQF1uAm"
    );
  });

  it("should contain sha384 integrity hash for babel standalone", () => {
    expect(body).toContain(
      "sha384-m08KidiNqLdpJqLq95G/LEi8Qvjl/xUYll3QILypMoQ65QorJ9Lvtp2RXYGBFj1y"
    );
  });
});

// ─── Body: styles object naming rule ──────────────────────────────────────

describe("Body: styles object naming hard rule", () => {
  it("should contain 'NEVER' and 'const styles' warning", () => {
    expect(body).toContain("NEVER");
    expect(body).toContain("const styles");
  });
});

// ─── Body: 8 Fallback/Constraint numbered rules ───────────────────────────

describe("Body: 8 Fallback/Constraint numbered rules present", () => {
  it("should contain numbered rule 1", () => {
    expect(body).toMatch(/1\.\s/);
  });

  it("should contain numbered rule 2", () => {
    expect(body).toMatch(/2\.\s/);
  });

  it("should contain numbered rule 3", () => {
    expect(body).toMatch(/3\.\s/);
  });

  it("should contain numbered rule 4", () => {
    expect(body).toMatch(/4\.\s/);
  });

  it("should contain numbered rule 5", () => {
    expect(body).toMatch(/5\.\s/);
  });

  it("should contain numbered rule 6", () => {
    expect(body).toMatch(/6\.\s/);
  });

  it("should contain numbered rule 7", () => {
    expect(body).toMatch(/7\.\s/);
  });

  it("should contain numbered rule 8", () => {
    expect(body).toMatch(/8\.\s/);
  });
});

// ─── Body: ADR-005 hardrule 5 — no window.claude.* ───────────────────────

describe("Body: window.claude.complete prohibition (hardRule 5)", () => {
  it("should mention window.claude prohibition", () => {
    expect(body).toContain("window.claude");
  });
});

// ─── Body: ADR-005 hardRule 6 — Tweaks reverse default ───────────────────

describe("Body: Tweaks reverse default (hardRule 6)", () => {
  it("should mention postMessage prohibition", () => {
    expect(body).toContain("postMessage");
  });

  it("should NOT instruct to add tweaks by default", () => {
    // The original rule says "add a couple anyway by default" — persona must reverse this
    expect(body).not.toContain("add a couple anyway by default");
  });
});

// ─── Body: ADR-005 hardRule 7 — copyrighted designs refusal ──────────────

describe("Body: copyrighted designs refusal (hardRule 7)", () => {
  it("should mention copyrighted design refusal", () => {
    expect(body).toContain("copyrighted");
  });
});

// ─── ADR-005 hardRule 8 regression: list_files must NOT contain filter/offset ──

describe("ADR-005 hardRule 8 regression: output-layer guard", () => {
  it("should NOT contain 'filter' anywhere in the output", () => {
    expect(output).not.toContain("filter");
  });

  it("should NOT contain 'offset' anywhere in the output", () => {
    expect(output).not.toContain("offset");
  });

  it("list_files description should be present in output", () => {
    expect(output).toContain("list_files");
  });

  it("list_files description should mention path parameter", () => {
    expect(output).toContain("path");
  });

  it("list_files description should mention depth parameter", () => {
    expect(output).toContain("depth");
  });
});

// ─── Output is idempotent ─────────────────────────────────────────────────

describe("buildAgentMarkdown idempotency", () => {
  it("should produce identical output on repeated calls with the same input", () => {
    const output2 = buildAgentMarkdown(STUB_SOURCE);
    expect(output2).toBe(output);
  });
});
