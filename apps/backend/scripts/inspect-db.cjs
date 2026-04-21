// quick diagnostic — dump raw_log + recent messages
const path = require("node:path");
const Database = require("better-sqlite3");
const db = new Database(path.resolve(__dirname, "../../../.data/design_house.db"), { readonly: true });

console.log("=== raw_log (newest first) ===");
for (const r of db.prepare("SELECT severity, reason, substr(raw,1,300) as raw FROM raw_log ORDER BY id DESC LIMIT 10").all()) {
  console.log(`[${r.severity}] ${r.reason} | ${r.raw}`);
}

console.log("\n=== messages (newest first) ===");
for (const r of db.prepare("SELECT role, is_error, tool_name, substr(content,1,300) as content FROM messages ORDER BY created_at DESC LIMIT 14").all()) {
  console.log(`[${r.role}] err=${r.is_error} tool=${r.tool_name ?? '-'} | ${r.content}`);
}
