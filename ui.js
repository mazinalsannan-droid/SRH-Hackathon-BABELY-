"use strict";
// Small DOM helpers shared by the app.
const $ = (id) => document.getElementById(id);
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
const pad = (n) => String(n).padStart(2, "0");
const shortHex = (h) => (h.length > 16 ? h.slice(0, 8) + "…" + h.slice(-6) : h);
const shortAddr = (a) => `W${a.wall} · S${a.shelf} · V${pad(a.vol)} · P${a.page}`;
const tick = () => new Promise((r) => setTimeout(r, 30));

let toastTimer;
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
}
function showErr(node, msg) { if (!msg) { node.classList.add("hidden"); return; } node.textContent = msg; node.classList.remove("hidden"); }

function coords(container, a) {
  container.textContent = "";
  [["Wall", a.wall], ["Shelf", a.shelf], ["Vol", pad(a.vol)], ["Page", a.page]].forEach(([k, v]) => {
    const d = el("div"); d.append(el("small", null, k), el("b", null, String(v))); container.append(d);
  });
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    try { const ta = el("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.append(ta); ta.select(); const ok = document.execCommand("copy"); ta.remove(); return ok; } catch { return false; }
  }
}

function busy(btn, on, label) {
  if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.textContent = ""; btn.append(el("span", "spin"), document.createTextNode(" " + label)); }
  else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
}

function timeAgo(t) {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "just now"; if (s < 3600) return Math.floor(s / 60) + " min ago";
  if (s < 86400) return Math.floor(s / 3600) + " h ago"; return new Date(t).toLocaleDateString();
}

const store = {
  get(k, d) { try { const v = localStorage.getItem("babbly." + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("babbly." + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem("babbly." + k); } catch {} },
};

/* ---- Bottom sheet built from a <template> ---- */
let lastFocus = null;
function openSheet(templateId, setup) {
  const sheet = $("sheet"), body = $("sheetBody");
  body.textContent = "";
  body.append($(templateId).content.cloneNode(true));
  lastFocus = document.activeElement;
  sheet.classList.add("on");
  sheet.setAttribute("aria-hidden", "false");
  const scope = (sel) => body.querySelector(sel);
  if (setup) setup(scope, body);
  const first = body.querySelector("[autofocus]") || body.querySelector("button, input, textarea, a");
  setTimeout(() => first && first.focus({ preventScroll: true }), 60);
  return scope;
}
function closeSheet() {
  const sheet = $("sheet");
  if (!sheet.classList.contains("on")) return;
  sheet.classList.remove("on");
  sheet.setAttribute("aria-hidden", "true");
  if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
}

function avatarFor(name) {
  const d = el("div", "avatar", (name || "?").slice(0, 1).toUpperCase());
  let h = 0; for (const c of name || "") h = (h * 31 + c.charCodeAt(0)) >>> 0;
  d.style.setProperty("--hue", String([36, 200, 12, 28, 190, 44][h % 6]));
  return d;
}

