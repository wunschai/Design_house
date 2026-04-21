// 重置指定 project 的 CC session + 清 messages（dev 用）
const path = require("node:path");
const Database = require("better-sqlite3");

const slug = process.argv[2];
if (!slug) {
  console.error("usage: node reset-session.cjs <projectSlug>");
  process.exit(1);
}

const db = new Database(path.resolve(__dirname, "../../../.data/design_house.db"));
const r1 = db.prepare("UPDATE sessions SET cc_session_id = NULL WHERE project_slug = ?").run(slug);
console.log(`reset session for ${slug}: ${r1.changes} row(s)`);
const r2 = db.prepare("DELETE FROM messages WHERE project_slug = ?").run(slug);
console.log(`cleared ${r2.changes} messages`);
db.close();
