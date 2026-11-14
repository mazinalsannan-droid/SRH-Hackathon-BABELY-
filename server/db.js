// SQLite database using Node's built-in driver (Node 22.5+). No npm install needed.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
export const db = new DatabaseSync(config.dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    username    TEXT NOT NULL UNIQUE COLLATE NOCASE,
    pass_hash   TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash  TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL
  );

  -- A Babble only ever stores the code (an address). The server never sees the passphrase
  -- or the decrypted text of a double-locked Babble.
  CREATE TABLE IF NOT EXISTS babbles (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    from_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code        TEXT NOT NULL,
    lob         TEXT,
    locked      INTEGER NOT NULL DEFAULT 0,
    note        TEXT,
    created_at  INTEGER NOT NULL,
    read_at     INTEGER,
    hidden_by_to   INTEGER NOT NULL DEFAULT 0,
    hidden_by_from INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS babbles_to ON babbles(to_id, created_at);
  CREATE INDEX IF NOT EXISTS babbles_from ON babbles(from_id, created_at);

  CREATE TABLE IF NOT EXISTS saved (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL,
    title       TEXT NOT NULL,
    code        TEXT,
    lob         TEXT,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS saved_user ON saved(user_id, created_at);
`);

export const q = {
  userByName: db.prepare("SELECT id, username, pass_hash FROM users WHERE username = ?"),
  userById: db.prepare("SELECT id, username, created_at FROM users WHERE id = ?"),
  createUser: db.prepare("INSERT INTO users (username, pass_hash, created_at) VALUES (?, ?, ?)"),
  setPassword: db.prepare("UPDATE users SET pass_hash = ? WHERE id = ?"),
  searchUsers: db.prepare("SELECT username FROM users WHERE username LIKE ? ESCAPE '\\' AND id != ? ORDER BY length(username), username LIMIT 8"),

  createSession: db.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)"),
  sessionUser: db.prepare("SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?"),
  deleteSession: db.prepare("DELETE FROM sessions WHERE token_hash = ?"),
  deleteUserSessions: db.prepare("DELETE FROM sessions WHERE user_id = ?"),
  purgeSessions: db.prepare("DELETE FROM sessions WHERE expires_at <= ?"),

  sendBabble: db.prepare("INSERT INTO babbles (from_id, to_id, code, lob, locked, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"),
  sentToday: db.prepare("SELECT COUNT(*) AS n FROM babbles WHERE from_id = ? AND created_at > ?"),
  inbox: db.prepare(`SELECT b.id, u.username AS other, b.code, b.lob, b.locked, b.note, b.created_at, b.read_at
                     FROM babbles b JOIN users u ON u.id = b.from_id
                     WHERE b.to_id = ? AND b.hidden_by_to = 0 ORDER BY b.created_at DESC LIMIT 200`),
  sent: db.prepare(`SELECT b.id, u.username AS other, b.code, b.lob, b.locked, b.note, b.created_at, b.read_at
                    FROM babbles b JOIN users u ON u.id = b.to_id
                    WHERE b.from_id = ? AND b.hidden_by_from = 0 ORDER BY b.created_at DESC LIMIT 200`),
  markRead: db.prepare("UPDATE babbles SET read_at = ? WHERE id = ? AND to_id = ? AND read_at IS NULL"),
  hideForTo: db.prepare("UPDATE babbles SET hidden_by_to = 1 WHERE id = ? AND to_id = ?"),
  hideForFrom: db.prepare("UPDATE babbles SET hidden_by_from = 1 WHERE id = ? AND from_id = ?"),
  unreadCount: db.prepare("SELECT COUNT(*) AS n FROM babbles WHERE to_id = ? AND read_at IS NULL AND hidden_by_to = 0"),

  listSaved: db.prepare("SELECT id, kind, title, code, lob, created_at FROM saved WHERE user_id = ? ORDER BY created_at DESC LIMIT 300"),
  addSaved: db.prepare("INSERT INTO saved (user_id, kind, title, code, lob, created_at) VALUES (?, ?, ?, ?, ?, ?)"),
  deleteSaved: db.prepare("DELETE FROM saved WHERE id = ? AND user_id = ?"),
};
