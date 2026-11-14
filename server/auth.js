// Usernames, passwords (scrypt) and login sessions (random token in an HttpOnly cookie).
import crypto from "node:crypto";
import { q } from "./db.js";
import { config } from "./config.js";

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
export const COOKIE = "babbly_sid";

export const USERNAME_RE = /^[a-z0-9_.]{3,20}$/i;

export function validateCredentials(username, password) {
  if (typeof username !== "string" || !USERNAME_RE.test(username))
    return "Usernames are 3–20 characters: letters, numbers, dots and underscores.";
  if (typeof password !== "string" || password.length < 8)
    return "Passwords need at least 8 characters.";
  if (password.length > 200) return "That password is too long.";
  return null;
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), hash.toString("base64")].join("$");
}

export function verifyPassword(password, stored) {
  const [alg, N, r, p, salt, hash] = String(stored).split("$");
  if (alg !== "scrypt") return false;
  const expected = Buffer.from(hash, "base64");
  const got = crypto.scryptSync(password, Buffer.from(salt, "base64"), expected.length, { N: +N, r: +r, p: +p });
  return crypto.timingSafeEqual(expected, got);
}

// Used when a username doesn't exist, so a wrong username takes as long as a wrong password
const DUMMY_HASH = hashPassword(crypto.randomBytes(12).toString("hex"));
export const verifyDummy = (password) => verifyPassword(password, DUMMY_HASH);

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = Date.now();
  q.createSession.run(sha256(token), userId, now, now + config.sessionDays * 86400000);
  return token;
}

export function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionUser(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token) return null;
  return q.sessionUser.get(sha256(token), Date.now()) || null;
}

export function endSession(req) {
  const token = parseCookies(req)[COOKIE];
  if (token) q.deleteSession.run(sha256(token));
}

function isHttps(req) {
  if (config.cookieSecure === "true") return true;
  if (config.cookieSecure === "false") return false;
  if (req.socket.encrypted) return true;
  return config.trustProxy && String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
}

export function sessionCookie(req, token) {
  const parts = [`${COOKIE}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${config.sessionDays * 86400}`];
  if (isHttps(req)) parts.push("Secure");
  return parts.join("; ");
}
export function clearCookie(req) {
  const parts = [`${COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (isHttps(req)) parts.push("Secure");
  return parts.join("; ");
}

/* Simple in-memory rate limiter: limit(key, max, windowMs) -> true when allowed */
const buckets = new Map();
export function limit(key, max, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.reset < now) { b = { n: 0, reset: now + windowMs }; buckets.set(key, b); }
  b.n++;
  if (buckets.size > 50000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
  return b.n <= max;
}

setInterval(() => q.purgeSessions.run(Date.now()), 3600000).unref();
