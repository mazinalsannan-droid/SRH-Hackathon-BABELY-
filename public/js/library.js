// Babbly's Library engine + Double lock + Babble codes + libraryofbabel.info helpers.
// Runs entirely in the browser: no server ever sees your passphrase or unlocked text.
/* ===== Babbly core: the Library + Double lock ===== */
const LIB = "abcdefghijklmnopqrstuvwxyz ,.";
const PAGE_LEN = 3200;           // 40 lines x 80 chars, like Borges' books
const WALLS = 4, SHELVES = 5, VOLUMES = 32, PAGES = 410;
const M = 29n ** 3200n;          // number of possible pages
const P10 = 29n ** 10n;

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function digitsToBig(d) {           // d[i] is the digit for 29^i
  let n = 0n;
  for (let c = PAGE_LEN / 10 - 1; c >= 0; c--) {
    let v = 0;
    for (let k = 9; k >= 0; k--) v = v * 29 + d[c * 10 + k];
    n = n * P10 + BigInt(v);
  }
  return n;
}
function bigToDigits(n) {
  const d = new Uint8Array(PAGE_LEN);
  for (let c = 0; c < PAGE_LEN / 10; c++) {
    let v = Number(n % P10); n = n / P10;
    for (let k = 0; k < 10; k++) { d[c * 10 + k] = v % 29; v = Math.floor(v / 29); }
  }
  return d;
}
function constFrom(seed) {
  const r = mulberry32(seed), d = new Uint8Array(PAGE_LEN);
  for (let i = 0; i < PAGE_LEN; i++) d[i] = Math.floor(r() * 29);
  if (d[0] === 0) d[0] = 7;          // never divisible by 29, so it has an inverse
  return digitsToBig(d);
}
function invModM(a) {
  const a0 = Number(a % 29n);
  let x0 = 1; while ((a0 * x0) % 29 !== 1) x0++;
  let x = BigInt(x0), mod = 29n;
  while (mod < M) {
    mod = mod * mod; if (mod > M) mod = M;
    x = (x * (2n - (a * x) % mod)) % mod; if (x < 0n) x += mod;
  }
  return x;
}
const mod = (x) => ((x % M) + M) % M;

let K = null;   // keys of the Library, built once on first use
function keys() {
  if (K) return K;
  const A = constFrom(0xBAB1), C = constFrom(0x1941), B = constFrom(0xB0E5), D = constFrom(0x7A1E);
  K = { A, C, B, D, AI: invModM(A), BI: invModM(B) };
  return K;
}

/* page digits -> address */
function pageToAddress(d) {
  const { A, C, B, D } = keys();
  const n1 = mod(A * digitsToBig(d) + C);
  const r = digitsToBig(bigToDigits(n1).reverse());
  let t = mod(B * r + D);
  const page = Number(t % 410n) + 1; t /= 410n;
  const vol = Number(t % 32n) + 1; t /= 32n;
  const shelf = Number(t % 5n) + 1; t /= 5n;
  const wall = Number(t % 4n) + 1; t /= 4n;
  return { hex: t.toString(36), wall, shelf, vol, page };
}
function parseB36(s) {
  if (!/^[0-9a-z]+$/.test(s)) throw new Error("hex");
  let n = 0n;
  for (let i = 0; i < s.length; i += 10) {
    const ch = s.slice(i, i + 10);
    n = n * (36n ** BigInt(ch.length)) + BigInt(parseInt(ch, 36));
  }
  return n;
}
/* address -> page digits */
function addressToPage(a) {
  const { AI, BI, C, D } = keys();
  const ok = (v, max) => Number.isInteger(v) && v >= 1 && v <= max;
  if (!ok(a.wall, WALLS) || !ok(a.shelf, SHELVES) || !ok(a.vol, VOLUMES) || !ok(a.page, PAGES)) throw new Error("coords");
  let t = parseB36(a.hex);
  t = t * 4n + BigInt(a.wall - 1);
  t = t * 5n + BigInt(a.shelf - 1);
  t = t * 32n + BigInt(a.vol - 1);
  t = t * 410n + BigInt(a.page - 1);
  if (t >= M) throw new Error("range");
  const r = mod((t - D) * BI);
  const n1 = digitsToBig(bigToDigits(r).reverse());
  return bigToDigits(mod((n1 - C) * AI));
}

function randDigits(n) {
  const out = new Uint8Array(n), buf = new Uint8Array(n * 2);
  let i = 0;
  while (i < n) {
    crypto.getRandomValues(buf);
    for (let j = 0; j < buf.length && i < n; j++) if (buf[j] < 232) out[i++] = buf[j] % 29;
  }
  return out;
}
const digitsToText = (d) => Array.from(d, (x) => LIB[x]).join("");
const textToDigits = (s) => Uint8Array.from(s, (c) => LIB.indexOf(c));

/* Hide text on a page: random filler around it, at a random spot */
function shelve(text) {
  const d = randDigits(PAGE_LEN);
  const start = text.length >= PAGE_LEN ? 0 : Math.floor(Math.random() * (PAGE_LEN - text.length + 1));
  for (let i = 0; i < text.length; i++) d[start + i] = LIB.indexOf(text[i]);
  return { address: pageToAddress(d), start, len: text.length, page: digitsToText(d) };
}
function randomPage() {
  const d = randDigits(PAGE_LEN);
  return { address: pageToAddress(d), page: digitsToText(d) };
}
const readPage = (address) => digitsToText(addressToPage(address));

/* Library alphabet only */
function toLibText(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/ß/g, "ss").replace(/[!?;:]/g, ".").replace(/[\s\-_/]+/g, " ")
    .replace(/[^a-z ,.]/g, "").replace(/ {2,}/g, " ");
}

/* ----- Double lock: AES-256-GCM with a PBKDF2 key, written in Library letters ----- */
const enc = new TextEncoder(), dec = new TextDecoder();
async function deriveKey(pass, salt) {
  const base = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 200000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
function bytesToLib(bytes) {
  let hex = "01"; for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  let n = BigInt("0x" + hex), s = "";
  while (n > 0n) { s = LIB[Number(n % 29n)] + s; n /= 29n; }
  return s;
}
function libToBytes(s) {
  let n = 0n;
  for (const c of s) { const i = LIB.indexOf(c); if (i < 0) throw new Error("char"); n = n * 29n + BigInt(i); }
  let hex = n.toString(16); if (hex.length % 2) hex = "0" + hex;
  if (!hex.startsWith("01")) throw new Error("frame");
  const out = new Uint8Array(hex.length / 2 - 1);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(2 + i * 2, 2), 16);
  return out;
}
async function lockText(text, pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pass, salt);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(text)));
  const all = new Uint8Array(28 + ct.length); all.set(salt, 0); all.set(iv, 16); all.set(ct, 28);
  return bytesToLib(all);
}
async function unlockText(libStr, pass) {
  const b = libToBytes(libStr);
  const key = await deriveKey(pass, b.slice(0, 16));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b.slice(16, 28) }, key, b.slice(28));
  return dec.decode(pt);
}

/* ----- Babble codes: bbl1.<L|P>.<start>.<len>.<wall>.<shelf>.<vol>.<page>.<hexagon> ----- */
function makeCode(locked, start, len, a) {
  return ["bbl1", locked ? "L" : "P", start, len, a.wall, a.shelf, a.vol, a.page, a.hex].join(".");
}
function parseCode(code) {
  const p = code.replace(/\s+/g, "").toLowerCase().split(".");
  if (p.length !== 9 || p[0] !== "bbl1" || !["l", "p"].includes(p[1])) throw new Error("code");
  const [start, len, wall, shelf, vol, page] = p.slice(2, 8).map(Number);
  if (![start, len].every((v) => Number.isInteger(v) && v >= 0) || start + len > PAGE_LEN) throw new Error("code");
  return { locked: p[1] === "l", start, len, address: { wall, shelf, vol, page, hex: p[8] } };
}

/* ----- The real libraryofbabel.info (Jonathan Basile's site) ----- */
const LOB = "https://libraryofbabel.info";
const lobSearchUrl = (text) => LOB + "/search.cgi?find=" + encodeURIComponent(text) + "&btnSubmit=Search&method=x";
const lobBookUrl = (a) => LOB + "/book.cgi?" + a.hex + "-w" + a.wall + "-s" + a.shelf + "-v" + String(a.vol).padStart(2, "0") + ":" + a.page;
/* Accepts a book.cgi link or "hexagon-w2-s1-v19:244" (page optional) */
function parseLob(input) {
  const s = input.replace(/\s+/g, "").toLowerCase();
  const m = s.match(/([0-9a-z]+)-w([1-4])-s([1-5])-v(\d{1,2})(?::(\d{1,3}))?/);
  if (!m) return null;
  const vol = +m[4], page = m[5] ? +m[5] : null;
  if (vol < 1 || vol > 32 || (page !== null && (page < 1 || page > 410))) return null;
  return { hex: m[1], wall: +m[2], shelf: +m[3], vol, page };
}
/* Double-locked Babbles are wrapped so the edges survive the site's trailing spaces */
const wrapForLob = (cipher) => "babble " + cipher + " end";
function cipherCandidates(pageText) {
  const t = pageText.replace(/[\r\n]/g, "").toLowerCase(), out = [];
  let s = t.indexOf("babble ");
  while (s >= 0 && out.length < 40) {
    let e = t.indexOf(" end", s + 7);
    while (e >= 0 && out.length < 40) { out.push(t.slice(s + 7, e)); e = t.indexOf(" end", e + 1); }
    s = t.indexOf("babble ", s + 1);
  }
  return out.sort((a, b) => b.length - a.length);
}


export {
  LIB, PAGE_LEN, shelve, randomPage, readPage, toLibText, lockText, unlockText, makeCode, parseCode,
  LOB, lobSearchUrl, lobBookUrl, parseLob, wrapForLob, cipherCandidates,
};
