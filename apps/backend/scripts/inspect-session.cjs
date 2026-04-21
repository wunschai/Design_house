const path = require("node:path");
const Database = require("better-sqlite3");
const db = new Database(path.resolve(__dirname, "../../../.data/design_house.db"), { readonly: true });
const slug = process.argv[2] ?? "untitled-1776759390674";
const session = db.prepare("SELECT * FROM sessions WHERE project_slug = ?").get(slug);
console.log("session:", session);
const msgCount = db.prepare("SELECT COUNT(*) c, role FROM messages WHERE project_slug = ? GROUP BY role").all(slug);
console.log("messages by role:", msgCount);
