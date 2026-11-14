// Babbly server: serves the app (public/) and the API. Zero npm dependencies.
// Start with:  npm start   (or: node --disable-warning=ExperimentalWarning server/server.js)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { q } from "./db.js";
import {
  validateCredentials, hashPassword, verifyPassword, verifyDummy, createSession, sessionUser,
  endSession, sessionCookie, clearCookie, limit, USERNAME_RE,
} from "./auth.js";
import { searchLob, LOB } from "./lob.js";
import { runAi, aiStatus } from "./ai.js";

const CODE_RE = /^bbl1\.[lp]\.\d{1,4}\.\d{1,4}\.[1-4]\.[1-5]\.\d{1,2}\.\d{1,3}\.[0-9a-z]{1,3200}$/i;
const LOB_RE = /^https:\/\/libraryofbabel\.info\/book\.cgi\?[0-9a-z]{1,3400}-w[1-4]-s[1-5]-v\d{2}:\d{1,3}$/i;
const LIB_TEXT_RE = /^[a-z ,.]{1,3200}$/;

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8",
};

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

function send(res, status, body, headers = {}) {
  const data = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  res.end(data);
}

function clientIp(req) {
  const fwd = config.trustProxy ? String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() : "";
  return fwd || req.socket.remoteAddress || "?";
}

async function readJson(req) {
  if (!String(req.headers["content-type"] || "").includes("application/json")) throw new HttpError(415, "Send JSON.");
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > 64 * 1024) throw new HttpError(413, "That's too big."); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { throw new HttpError(400, "Couldn't read that request."); }
}

function needUser(req) {
  const u = sessionUser(req);
  if (!u) throw new HttpError(401, "Sign in to do that.");
  return u;
}

const pub = (u) => ({ username: u.username });
const asItem = (r) => ({ id: r.id, other: r.other, code: r.code, lob: r.lob, locked: !!r.locked, note: r.note, at: r.created_at, read: !!r.read_at });

/* ---------------- API routes ---------------- */
const routes = {
  "GET /api/health": async () => ({ ok: true }),

  "GET /api/auth/me": async (req) => {
    const u = sessionUser(req);
    return { user: u ? pub(u) : null, unread: u ? q.unreadCount.get(u.id).n : 0, signups: config.allowSignups };
  },

  "POST /api/auth/register": async (req, res) => {
    if (!config.allowSignups) throw new HttpError(403, "New accounts are switched off on this Babbly.");
    if (!limit("reg:" + clientIp(req), 10, 3600000)) throw new HttpError(429, "Too many new accounts from here. Try again later.");
    const { username, password } = await readJson(req);
    const err = validateCredentials(username, password);
    if (err) throw new HttpError(400, err);
    if (q.userByName.get(username)) throw new HttpError(409, "That username is taken. Try another one.");
    const info = q.createUser.run(username, hashPassword(password), Date.now());
    const token = createSession(Number(info.lastInsertRowid));
    res.setHeader("Set-Cookie", sessionCookie(req, token));
    return { user: { username } };
  },

  "POST /api/auth/login": async (req, res) => {
    const { username, password } = await readJson(req);
    if (typeof username !== "string" || typeof password !== "string") throw new HttpError(400, "Enter your username and password.");
    if (!limit("login:" + clientIp(req), 30, 900000) || !limit("login:" + username.toLowerCase(), 10, 900000))
      throw new HttpError(429, "Too many tries. Wait 15 minutes and try again.");
    const u = q.userByName.get(username);
    const ok = u ? verifyPassword(password, u.pass_hash) : (verifyDummy(password), false);
    if (!ok) throw new HttpError(401, "That username and password don't match.");
    res.setHeader("Set-Cookie", sessionCookie(req, createSession(u.id)));
    return { user: pub(u) };
  },

  "POST /api/auth/logout": async (req, res) => {
    endSession(req);
    res.setHeader("Set-Cookie", clearCookie(req));
    return { ok: true };
  },

  "POST /api/auth/password": async (req) => {
    const me = needUser(req);
    const { current, next } = await readJson(req);
    const row = q.userByName.get(me.username);
    if (!limit("pw:" + me.id, 10, 900000)) throw new HttpError(429, "Too many tries. Wait a bit.");
    if (typeof current !== "string" || !verifyPassword(current, row.pass_hash)) throw new HttpError(401, "Your current password isn't right.");
    const err = validateCredentials(me.username, next);
    if (err) throw new HttpError(400, err);
    q.setPassword.run(hashPassword(next), me.id);
    return { ok: true };
  },

  "GET /api/users/search": async (req, res, url) => {
    const me = needUser(req);
    const term = String(url.searchParams.get("q") || "").replace(/[^a-z0-9_.]/gi, "").slice(0, 20);
    if (!term) return { users: [] };
    const like = term.replace(/[\\%_]/g, (c) => "\\" + c) + "%";
    return { users: q.searchUsers.all(like, me.id).map((r) => r.username) };
  },

  "POST /api/babbles": async (req) => {
    const me = needUser(req);
    const { to, code, lob, locked, note } = await readJson(req);
    if (typeof to !== "string" || !USERNAME_RE.test(to)) throw new HttpError(400, "Choose who to send it to.");
    if (typeof code !== "string" || !CODE_RE.test(code)) throw new HttpError(400, "That Babble code is damaged.");
    if (lob != null && (typeof lob !== "string" || !LOB_RE.test(lob))) throw new HttpError(400, "That Library link is damaged.");
    const target = q.userByName.get(to);
    if (!target) throw new HttpError(404, `There's no Babbler called ${to}.`);
    if (q.sentToday.get(me.id, Date.now() - 86400000).n >= 300) throw new HttpError(429, "You've sent a lot today. Try again tomorrow.");
    const cleanNote = typeof note === "string" ? note.replace(/[\u0000-\u001f]/g, "").slice(0, 80) : null;
    q.sendBabble.run(me.id, target.id, code, lob || null, locked ? 1 : 0, cleanNote || null, Date.now());
    return { ok: true, to: target.username };
  },

  "GET /api/babbles": async (req, res, url) => {
    const me = needUser(req);
    const box = url.searchParams.get("box") === "sent" ? "sent" : "inbox";
    return { items: (box === "sent" ? q.sent : q.inbox).all(me.id).map(asItem), unread: q.unreadCount.get(me.id).n };
  },

  "POST /api/babbles/read": async (req) => {
    const me = needUser(req);
    const { id } = await readJson(req);
    q.markRead.run(Date.now(), Number(id), me.id);
    return { ok: true, unread: q.unreadCount.get(me.id).n };
  },

  "POST /api/babbles/hide": async (req) => {
    const me = needUser(req);
    const { id, box } = await readJson(req);
    (box === "sent" ? q.hideForFrom : q.hideForTo).run(Number(id), me.id);
    return { ok: true };
  },

  "GET /api/saved": async (req) => {
    const me = needUser(req);
    return { items: q.listSaved.all(me.id).map((r) => ({ id: r.id, kind: r.kind, title: r.title, code: r.code, lob: r.lob, at: r.created_at })) };
  },

  "POST /api/saved": async (req) => {
    const me = needUser(req);
    const { kind, title, code, lob } = await readJson(req);
    if (!["babble", "find", "note"].includes(kind)) throw new HttpError(400, "Unknown kind.");
    if (code != null && (typeof code !== "string" || !CODE_RE.test(code))) throw new HttpError(400, "That code is damaged.");
    if (lob != null && (typeof lob !== "string" || !LOB_RE.test(lob))) throw new HttpError(400, "That link is damaged.");
    const t = String(title || "").replace(/[\u0000-\u001f]/g, "").slice(0, 120) || "Saved";
    const info = q.addSaved.run(me.id, kind, t, code || null, lob || null, Date.now());
    return { id: Number(info.lastInsertRowid) };
  },

  "POST /api/saved/delete": async (req) => {
    const me = needUser(req);
    const { id } = await readJson(req);
    q.deleteSaved.run(Number(id), me.id);
    return { ok: true };
  },

  // Real libraryofbabel.info lookup (works for guests too, rate limited)
  "POST /api/lob/search": async (req) => {
    if (!limit("lob:" + clientIp(req), 30, 600000)) throw new HttpError(429, "Too many Library searches. Wait a few minutes.");
    const { text } = await readJson(req);
    if (typeof text !== "string" || !LIB_TEXT_RE.test(text)) throw new HttpError(400, "The Library only has a–z, space, comma and period.");
    try { return await searchLob(text); }
    catch (e) { throw new HttpError(e.status || 502, "libraryofbabel.info didn't answer. Try again, or use the manual search link."); }
  },

  "GET /api/ai/status": async () => aiStatus(),

  "POST /api/ai": async (req) => {
    const u = sessionUser(req);
    const key = u ? "ai:u" + u.id : "ai:" + clientIp(req);
    if (!limit(key, u ? 60 : 20, 600000)) throw new HttpError(429, "Too many AI requests. Wait a few minutes.");
    const { task, ...input } = await readJson(req);
    const data = await runAi(task, input);
    if (!data) throw new HttpError(503, "ai_unavailable");
    return { data };
  },
};

/* ---------------- static files ---------------- */
function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === "/") rel = "/index.html";
  const file = path.normalize(path.join(config.publicDir, rel));
  if (!file.startsWith(config.publicDir)) return send(res, 403, { error: "Forbidden" });
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      // Unknown paths fall back to the app shell (so #tabs and reloads work)
      if (!path.extname(rel)) return serveFile(res, path.join(config.publicDir, "index.html"), ".html");
      return send(res, 404, { error: "Not found" });
    }
    serveFile(res, file, path.extname(file).toLowerCase());
  });
}
function serveFile(res, file, ext) {
  const cache = ext === ".html" || file.endsWith("sw.js") || ext === ".webmanifest" ? "no-cache" : "public, max-age=604800";
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": cache });
  fs.createReadStream(file).pipe(res);
}

/* ---------------- server ---------------- */
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com 'unsafe-inline'",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; "),
};

const server = http.createServer(async (req, res) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  const url = new URL(req.url, "http://local");
  const key = `${req.method} ${url.pathname}`;
  if (url.pathname.startsWith("/api/")) {
    const handler = routes[key];
    if (!handler) return send(res, 404, { error: "Unknown API route." });
    // CSRF guard: state-changing calls must come from our own page
    if (req.method !== "GET" && req.headers["x-babbly"] !== "1") return send(res, 403, { error: "Blocked." });
    try { send(res, 200, await handler(req, res, url)); }
    catch (e) {
      const status = e.status || 500;
      if (status === 500) console.error(e);
      send(res, status, { error: status === 500 ? "Something went wrong on the server." : e.message });
    }
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, { error: "Method not allowed" });
  serveStatic(req, res, url);
});

server.listen(config.port, config.host, () => {
  console.log(`\n  Babbly is running:  http://localhost:${config.port}`);
  console.log(`  Database:           ${config.dbPath}`);
  console.log(`  AI endpoint:        ${config.aiEnabled ? config.aiBaseUrl + "  (model " + config.aiModel + ")" : "off"}`);
  console.log(`  Real Library:       ${config.lobEnabled ? LOB : "off"}\n`);
});
