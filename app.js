"use strict";
// Babbly app: screens, tabs and sheets. Library math lives in library.js,
// server calls in api.js, offline "AI" in ai-fallback.js.

const S = { user: null, guest: false, online: false, box: "inbox", inbox: [], sent: [], saved: [], unread: 0, current: null, ai: null };
const HAS_CRYPTO = !!(window.crypto && crypto.subtle);
const LOB_LINK_RE = /^https:\/\/libraryofbabel\.info\/book\.cgi\?[0-9a-z]+-w[1-4]-s[1-5]-v\d{2}:\d{1,3}$/i;

/* ================= Start ================= */
async function boot() {
  S.online = await serverOnline();
  if (S.online) {
    try { const me = await api("auth/me"); if (me.user) return enterApp(me.user); if (!me.signups) setAuthMode("login", true); } catch {}
  } else {
    ["authSeg", "authForm"].forEach((id) => $(id).classList.add("hidden"));
    document.querySelector(".welcome .divider").classList.add("hidden");
    $("guestBtn").className = "btn primary big";
    $("guestBtn").textContent = "Open Babbly";
    $("welcomeNote").textContent = "This copy of Babbly runs entirely on your device. Accounts and sending to other Babblers need the Babbly server.";
  }
  if (store.get("guest", false)) return enterApp(null);
  showWelcome();
}

function showWelcome() {
  $("main").classList.add("hidden");
  $("welcome").classList.remove("hidden");
}

/* ================= Welcome / accounts ================= */
let authMode = "login";
function setAuthMode(mode, lockLogin) {
  authMode = mode;
  document.querySelectorAll("#authSeg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
  if (lockLogin) document.querySelector('#authSeg [data-mode="register"]').disabled = true;
  $("authBtn").textContent = mode === "login" ? "Sign in" : "Create account";
  $("authPass").autocomplete = mode === "login" ? "current-password" : "new-password";
  showErr($("authErr"));
}
document.querySelectorAll("#authSeg button").forEach((b) => b.addEventListener("click", () => setAuthMode(b.dataset.mode)));
$("authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = $("authUser").value.trim(), password = $("authPass").value;
  if (!username || !password) return showErr($("authErr"), "Enter a username and a password.");
  const btn = $("authBtn"); busy(btn, true, authMode === "login" ? "Signing in…" : "Creating…");
  try {
    const r = await api("auth/" + (authMode === "login" ? "login" : "register"), { username, password });
    store.del("guest");
    $("authPass").value = "";
    enterApp(r.user);
    if (authMode === "register") toast(`Welcome to Babbly, ${r.user.username}!`);
  } catch (err) { showErr($("authErr"), err.message); }
  finally { busy(btn, false); }
});
$("guestBtn").addEventListener("click", () => { store.set("guest", true); enterApp(null); });

function enterApp(user) {
  S.user = user; S.guest = !user;
  $("welcome").classList.add("hidden");
  $("main").classList.remove("hidden");
  const name = user ? user.username : "Guest";
  $("whoName").textContent = user ? "@" + name : "Guest";
  $("whoAvatar").replaceChildren(avatarFor(name));
  $("whoAvatar").firstChild.style.cssText = "width:34px;height:34px;font-size:15px";
  $("meAvatar").replaceChildren(avatarFor(name));
  $("meName").textContent = user ? "@" + name : "Guest";
  $("meSub").textContent = user ? "Babbler" : "Browsing as a guest on this device";
  $("toField").classList.toggle("hidden", !user);
  $("mCreate").classList.toggle("hidden", !!user || !S.online);
  $("mPassword").classList.toggle("hidden", !user);
  $("mLogoutLabel").textContent = user ? "Sign out" : "Leave guest mode";
  $("boxSeg").classList.toggle("hidden", !user);
  setBox(user ? "inbox" : "saved");
  if (!HAS_CRYPTO) {
    $("optLock").checked = false; $("optLock").disabled = true;
    $("passField").classList.add("hidden");
    $("optLock").parentElement.title = "Lock needs a secure (https) connection";
  }
  updateWriteUi();
  refreshLists();
  checkAi();
  route();
}

$("mLogout").addEventListener("click", async () => {
  if (S.user) { try { await api("auth/logout", {}); } catch {} }
  store.del("guest");
  S.user = null; S.inbox = []; S.sent = []; S.saved = [];
  showWelcome();
});
$("mCreate").addEventListener("click", () => { store.del("guest"); setAuthMode("register"); showWelcome(); setTimeout(() => $("authUser").focus(), 50); });
$("whoBtn").addEventListener("click", () => go("me"));

/* ================= Routing ================= */
const VIEWS = ["write", "inbox", "explore", "me"];
function route() {
  const h = location.hash.slice(1);
  if (h.startsWith("c=")) { // shared Babble link: #c=<code>
    const code = decodeURIComponent(h.slice(2));
    history.replaceState(null, "", "#inbox");
    show("inbox"); openBabble({ code }); return;
  }
  show(VIEWS.includes(h) ? h : "write");
}
function show(name) {
  VIEWS.forEach((v) => $("v-" + v).classList.toggle("on", v === name));
  document.querySelectorAll("nav.tabs a").forEach((a) => (a.dataset.v === name ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  $("views").scrollTop = 0;
  if (name === "inbox") refreshLists();
}
function go(name) { if (location.hash === "#" + name) show(name); else location.hash = name; }
window.addEventListener("hashchange", () => { if (!$("main").classList.contains("hidden")) route(); });

/* ================= Shared bits ================= */
document.addEventListener("click", (e) => {
  const eye = e.target.closest("[data-eye]");
  if (eye) { const i = $(eye.dataset.eye); const vis = i.type === "text"; i.type = vis ? "password" : "text"; eye.textContent = vis ? "Show" : "Hide"; }
  if (e.target.closest("[data-close]") || e.target === $("sheet")) closeSheet();
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });

function viewPage(address, ranges, title) {
  openSheet("t-page", (r) => {
    r('[data-r="title"]').textContent = title || "Page " + address.page;
    coords(r('[data-r="coords"]'), address);
    r('[data-r="hex"]').textContent = address.hex;
    r('[data-r="hexsum"]').textContent = `Full hexagon name (${address.hex.length.toLocaleString()} characters)`;
    const text = readPage(address), box = r('[data-r="text"]');
    const rs = (ranges || []).filter((x) => x.len > 0).sort((a, b) => a.start - b.start);
    let pos = 0;
    rs.forEach((x) => { if (x.start < pos) return; box.append(document.createTextNode(text.slice(pos, x.start)), el("mark", x.cls || "", text.substr(x.start, x.len))); pos = x.start + x.len; });
    box.append(document.createTextNode(text.slice(pos)));
  });
}

const appLink = (code) => (location.protocol.startsWith("http") ? location.origin + location.pathname : "") + "#c=" + encodeURIComponent(code);
async function shareBabble(c) {
  const lines = ["A Babble for you."];
  if (location.protocol.startsWith("http")) lines.push("Open it in Babbly: " + appLink(c.code)); else lines.push("Babble code: " + c.code);
  if (c.lob) lines.push("On libraryofbabel.info: " + c.lob);
  if (c.locked) lines.push("You'll need the passphrase.");
  const text = lines.join("\n");
  if (navigator.share) { try { await navigator.share({ title: "A Babble for you", text }); return; } catch (e) { if (e && e.name === "AbortError") return; } }
  toast((await copy(text)) ? "Copied. Paste it into any chat." : "Sharing isn't available here.");
}

/* ================= WRITE ================= */
const msg = $("msg");
const limitChars = () => ($("optLock").checked ? 1500 : PAGE_LEN);
function updateWriteUi() {
  const n = msg.value.length, lim = limitChars(), meta = $("msgMeta");
  $("msgCount").textContent = n ? `${n.toLocaleString()} / ${lim.toLocaleString()}` : "";
  meta.classList.remove("warn");
  if ($("optLock").checked) $("msgHint").textContent = n ? "Any characters work when locked" : "";
  else {
    const norm = toLibText(msg.value);
    if (norm !== msg.value) { meta.classList.add("warn"); $("msgHint").textContent = "Stored as: " + (norm.length > 46 ? norm.slice(0, 46) + "…" : norm); }
    else $("msgHint").textContent = n ? "Only a–z, space , . exist in the Library" : "";
  }
  if (n > lim) { meta.classList.add("warn"); $("msgCount").textContent += " · too long"; }
  $("passField").classList.toggle("hidden", !$("optLock").checked);
  const to = $("toIn").value.trim().replace(/^@/, "");
  $("hideBtn").textContent = S.user && to ? `Hide & send to @${to}` : "Hide in the Library";
}
msg.addEventListener("input", updateWriteUi);
$("optLock").addEventListener("change", updateWriteUi);

/* username suggestions */
let suggestTimer;
function suggestUsers(input, box, onPick) {
  clearTimeout(suggestTimer);
  const q = input.value.trim().replace(/^@/, "");
  if (!q || !S.user) { box.textContent = ""; return; }
  suggestTimer = setTimeout(async () => {
    try {
      const { users } = await api("users/search?q=" + encodeURIComponent(q));
      box.textContent = "";
      users.forEach((u) => {
        const b = el("button"); b.type = "button"; const av = avatarFor(u); av.style.cssText = "width:30px;height:30px;font-size:14px";
        b.append(av, el("span", null, "@" + u)); b.addEventListener("click", () => onPick(u)); box.append(b);
      });
    } catch { box.textContent = ""; }
  }, 180);
}
$("toIn").addEventListener("input", () => { updateWriteUi(); suggestUsers($("toIn"), $("toSuggest"), (u) => { $("toIn").value = u; $("toSuggest").textContent = ""; updateWriteUi(); }); });

async function findReal(text) {
  if (!S.online) return { state: "manual", search: lobSearchUrl(text) };
  try {
    const r = await api("lob/search", { text });
    return { state: "found", ...r.exact, search: lobSearchUrl(text) };
  } catch { return { state: "manual", search: lobSearchUrl(text) }; }
}

$("hideBtn").addEventListener("click", async () => {
  showErr($("writeErr"));
  const raw = msg.value.trim(), locked = $("optLock").checked, pass = $("pass").value;
  const to = S.user ? $("toIn").value.trim().replace(/^@/, "") : "";
  if (!raw) { msg.focus(); return showErr($("writeErr"), "Write a message first."); }
  if (raw.length > limitChars()) return showErr($("writeErr"), `That's too long for one page. Keep it under ${limitChars().toLocaleString()} characters.`);
  if (locked && !pass) { $("pass").focus(); return showErr($("writeErr"), "Add a passphrase, or switch off Lock."); }
  const btn = $("hideBtn"); busy(btn, true, "Searching the Library…"); await tick();
  try {
    const lib = locked ? await lockText(raw, pass) : toLibText(raw).trim();
    if (!lib) throw new Error("Nothing left once the letters the Library doesn't have are removed. Use letters, or switch on Lock.");
    const r = shelve(lib);
    const c = S.current = { code: makeCode(locked, r.start, r.len, r.address), address: r.address, start: r.start, len: r.len, locked, preview: locked ? null : lib, lob: null, sentTo: null, real: null };
    const realText = locked ? wrapForLob(lib) : lib;
    c.real = $("optReal").checked ? { state: "searching" } : { state: "off", search: lobSearchUrl(realText) };
    openResult(c, to);
    if ($("optReal").checked) {
      c.real = await findReal(realText);
      if (c.real.state === "found") c.lob = c.real.url;
      if (S.current === c) renderReal();
    }
    if (to) await sendCurrent(to);
  } catch (e) { showErr($("writeErr"), e.message || "That didn't work. Try again."); }
  finally { busy(btn, false); updateWriteUi(); }
});

let resultScope = null;
function openResult(c, to) {
  resultScope = openSheet("t-result", (r) => {
    r('[data-r="title"]').textContent = to ? `Sending to @${to}…` : "Hidden in the Library";
    r('[data-r="lead"]').textContent = c.locked
      ? "Locked with your passphrase. Without it, this page is just noise."
      : "Not locked: anyone with the code can read it.";
    r('[data-r="lock"]').textContent = c.locked ? "Locked" : "Not locked"; r('[data-r="lock"]').className = c.locked ? "chip dark" : "chip";
    r('[data-r="hex"]').textContent = shortHex(c.address.hex);
    r('[data-r="hexlen"]').textContent = c.address.hex.length.toLocaleString() + " chars";
    coords(r('[data-r="coords"]'), c.address);
    r('[data-r="sendRow"]').classList.toggle("hidden", !S.user || !!to);
    r('[data-r="send"]').addEventListener("click", () => openSendPicker());
    r('[data-r="share"]').addEventListener("click", () => shareBabble(c));
    r('[data-r="copy"]').addEventListener("click", async () => toast((await copy(c.code)) ? "Babble code copied" : "Copy isn't available here"));
    r('[data-r="save"]').addEventListener("click", () => addSaved({ kind: "babble", title: c.locked ? "Locked Babble" : c.preview.slice(0, 80), code: c.code, lob: c.lob || undefined }));
    r('[data-r="view"]').addEventListener("click", () => viewPage(c.address, [{ start: c.start, len: c.len }], "Your Babble's page"));
  });
  renderReal();
}
function renderReal() {
  const c = S.current, r = resultScope;
  if (!c || !r || !$("sheet").classList.contains("on")) return;
  const body = r('[data-r="realBody"]'); if (!body) return;
  body.textContent = "";
  const real = c.real || {};
  if (real.state === "searching") { body.append(el("span", "spin"), document.createTextNode(" Asking libraryofbabel.info…")); return; }
  if (real.state === "found") {
    const line = el("div", "hexline"); line.append(el("span", null, shortHex(real.hex)), el("em", null, "real hex · " + real.hex.length.toLocaleString() + " chars"));
    const grid = el("div", "coords"); coords(grid, real);
    const row = el("div", "row");
    const ch = el("button", "btn ghost small", "Copy real hex"); ch.addEventListener("click", async () => toast((await copy(real.hex)) ? "Real hex code copied" : "Copy isn't available here"));
    const cl = el("button", "btn ghost small", "Copy link"); cl.addEventListener("click", async () => toast((await copy(real.url)) ? "Page link copied" : "Copy isn't available here"));
    const op = el("a", "btn ghost small", "Open ↗"); op.href = real.url; op.target = "_blank"; op.rel = "noopener noreferrer";
    row.append(ch, cl, op);
    body.style.cssText = "display:flex;flex-direction:column;gap:10px";
    body.append(line, grid, row);
    return;
  }
  const a = el("a", "btn ghost small", "Search libraryofbabel.info ↗"); a.href = real.search || "https://libraryofbabel.info/search.html"; a.target = "_blank"; a.rel = "noopener noreferrer";
  const p = el("p", "note", real.state === "off" ? "Want the site's real hex code too? Search for it there and use the exact match." : "Babbly couldn't reach the site from here. Search for it there and paste the page link into Open later.");
  p.style.margin = "0 0 8px";
  body.append(p, a);
}

function openSendPicker() {
  const c = S.current; if (!c) return;
  openSheet("t-send", (r) => {
    const input = $("sendTo"), list = r('[data-r="list"]');
    const pickUser = async (u) => {
      try { await sendCurrent(u); } catch (e) { showErr(r('[data-r="err"]'), e.message); }
    };
    input.addEventListener("input", () => suggestUsers(input, list, pickUser));
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" && input.value.trim()) pickUser(input.value.trim().replace(/^@/, "")); });
  });
}
async function sendCurrent(to) {
  const c = S.current;
  try {
    await api("babbles", { to, code: c.code, lob: c.lob && LOB_LINK_RE.test(c.lob) ? c.lob : null, locked: c.locked });
    c.sentTo = to;
    closeSheet();
    toast(`Sent to @${to}`);
    msg.value = ""; $("toIn").value = ""; updateWriteUi();
    refreshLists();
  } catch (e) {
    if (resultScope && $("sheet").classList.contains("on") && resultScope('[data-r="title"]')) {
      resultScope('[data-r="title"]').textContent = "Hidden, not sent yet";
      resultScope('[data-r="sendRow"]').classList.remove("hidden");
    }
    toast(e.message);
    throw e;
  }
}

/* ================= OPEN ================= */
function classify(v) {
  if (/^bbl1\./i.test(v)) { try { return { kind: "code", c: parseCode(v) }; } catch { return { kind: "bad" }; } }
  if (/libraryofbabel|-w[1-4]-s[1-5]-v\d/i.test(v)) { const a = parseLob(v); return a ? { kind: "lob", a } : { kind: "bad" }; }
  const t = v.replace(/[\r\n]/g, "").toLowerCase();
  if (/^[a-z ,.]+$/.test(t)) return { kind: "text", text: t, cands: cipherCandidates(t) };
  return { kind: "bad" };
}

/* item = { code?, other?, at?, id?, box?, lob?, locked? } */
function openBabble(item) {
  item = item || {};
  openSheet("t-open", (r) => {
    const input = $("openIn"), pf = r('[data-r="passField"]'), hint = r('[data-r="hint"]').firstElementChild;
    const fromLine = r('[data-r="from"]');
    if (item.other) {
      fromLine.textContent = (item.box === "sent" ? "To @" : "From @") + item.other + " · " + timeAgo(item.at);
      r('[data-r="title"]').textContent = item.locked ? "A locked Babble" : "A Babble";
      r('[data-r="pasteField"]').classList.add("hidden");
    } else fromLine.classList.add("hidden");
    if (item.code) input.value = item.code;
    if (item.id) {
      const rm = r('[data-r="remove"]'); rm.classList.remove("hidden");
      rm.addEventListener("click", () => removeItem(item));
    }
    const check = () => {
      r('[data-r="lobCard"]').classList.add("hidden"); hint.parentElement.classList.remove("warn");
      const v = input.value.trim();
      if (!v) { hint.textContent = ""; pf.classList.add("hidden"); return null; }
      const k = classify(v);
      if (k.kind === "code") { hint.textContent = (k.c.locked ? "Locked · " : "Not locked · ") + shortAddr(k.c.address); pf.classList.toggle("hidden", !k.c.locked); }
      else if (k.kind === "lob") {
        hint.textContent = "Page on libraryofbabel.info"; pf.classList.add("hidden");
        r('[data-r="lobLink"]').href = lobBookUrl({ ...k.a, page: k.a.page || 1 }); r('[data-r="lobCard"]').classList.remove("hidden");
      } else if (k.kind === "text") { hint.textContent = k.cands.length ? "Found a locked Babble in this page text" : "Text from a Library page"; pf.classList.toggle("hidden", !k.cands.length); }
      else { hint.parentElement.classList.add("warn"); hint.textContent = "Babbly can't read that. Check nothing was cut off."; pf.classList.add("hidden"); }
      return k;
    };
    input.addEventListener("input", () => { check(); r('[data-r="out"]').classList.add("hidden"); showErr(r('[data-r="err"]')); });
    const k0 = check();
    const doOpen = async () => {
      const err = r('[data-r="err"]'); showErr(err); r('[data-r="out"]').classList.add("hidden");
      const k = check();
      if (!k) return showErr(err, "Paste a Babble code, a libraryofbabel.info link, or text from a Library page.");
      if (k.kind === "bad") return showErr(err, "Babbly can't read that. Check nothing was cut off when it was copied.");
      if (k.kind === "lob") return showErr(err, "Open the page first, then copy its text and paste it here.");
      const pass = $("openPass").value, needPass = (k.kind === "code" && k.c.locked) || (k.kind === "text" && k.cands.length);
      if (needPass && !pass) { $("openPass").focus(); return showErr(err, "This Babble is locked. Enter the passphrase the sender gave you."); }
      if (needPass && !HAS_CRYPTO) return showErr(err, "Unlocking needs a secure (https) connection.");
      const btn = r('[data-r="go"]'); busy(btn, true, needPass ? "Unlocking…" : "Reading…"); await tick();
      try {
        let text, address = null, range = null;
        if (k.kind === "code") {
          let page;
          try { page = readPage(k.c.address); } catch { throw new Error("This address isn't in the Library. The code may have been cut off."); }
          const piece = k.c.len ? page.substr(k.c.start, k.c.len) : page;
          address = k.c.address; range = { start: k.c.start, len: k.c.len };
          if (k.c.locked) { try { text = await unlockText(piece, pass); } catch { throw new Error("That passphrase doesn't open this Babble. Check it with the sender."); } }
          else text = piece;
        } else if (k.cands.length) {
          for (const cand of k.cands.slice(0, 12)) { try { text = await unlockText(cand, pass); break; } catch {} }
          if (text == null) throw new Error("That passphrase doesn't open it, or part of the page is missing. Copy the whole page.");
        } else text = k.text.replace(/ {2,}/g, " ").trim();
        r('[data-r="text"]').textContent = "“" + text + "”";
        r('[data-r="okChip"]').textContent = needPass ? "✓ Unlocked" : "✓ Read";
        r('[data-r="out"]').classList.remove("hidden");
        const view = r('[data-r="view"]'); view.classList.toggle("hidden", !address);
        view.onclick = () => address && viewPage(address, [range], "Babble page");
        const real = r('[data-r="real"]'); if (item.lob && LOB_LINK_RE.test(item.lob)) { real.href = item.lob; real.classList.remove("hidden"); }
        r('[data-r="reply"]').onclick = () => { closeSheet(); msg.value = ""; $("toIn").value = item.box !== "sent" && item.other ? item.other : ""; updateWriteUi(); go("write"); setTimeout(() => msg.focus(), 80); };
        r('[data-r="save"]').onclick = () => addSaved({ kind: k.kind === "code" ? "babble" : "note", title: (needPass ? "Locked: " : "") + text.slice(0, 80), code: k.kind === "code" ? input.value.replace(/\s+/g, "") : undefined, lob: item.lob || undefined });
        if (item.id && item.box === "inbox" && !item.read) markRead(item);
      } catch (e) { showErr(err, e.message); }
      finally { busy(btn, false); }
    };
    r('[data-r="go"]').addEventListener("click", doOpen);
    $("openPass").addEventListener("keydown", (e) => { if (e.key === "Enter") doOpen(); });
    if (k0 && k0.kind === "code" && !k0.c.locked) doOpen();
  });
}
$("pasteBtn").addEventListener("click", () => openBabble({}));

/* ================= INBOX / SAVED ================= */
document.querySelectorAll("#boxSeg button").forEach((b) => b.addEventListener("click", () => setBox(b.dataset.box)));
function setBox(box) {
  S.box = box;
  document.querySelectorAll("#boxSeg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.box === box)));
  renderList();
}
async function refreshLists() {
  if (S.user) {
    try {
      const [inb, sent, saved] = await Promise.all([api("babbles?box=inbox"), api("babbles?box=sent"), api("saved")]);
      S.inbox = inb.items; S.sent = sent.items; S.saved = saved.items; S.unread = inb.unread;
    } catch (e) { if (e.status === 401) { toast("Please sign in again."); S.user = null; return showWelcome(); } }
  } else { S.saved = store.get("saved", []); S.inbox = []; S.sent = []; S.unread = 0; }
  renderList(); renderStats();
}
function renderStats() {
  $("stSent").textContent = S.sent.length; $("stRecv").textContent = S.inbox.length; $("stSaved").textContent = S.saved.length;
  const b = $("badge"); b.textContent = S.unread; b.classList.toggle("hidden", !S.unread);
}
function renderList() {
  const list = $("list"); list.textContent = "";
  const items = S.box === "saved" ? S.saved : S.box === "sent" ? S.sent : S.inbox;
  if (!items.length) {
    const e = el("div", "empty glass"); const img = el("span", "logo lg"); img.setAttribute("aria-hidden", "true");
    e.append(img, el("span", null, S.box === "inbox" ? "No Babbles yet. Share your username so friends can send you one." : S.box === "sent" ? "Babbles you send show up here." : S.user ? "Save Babbles and lucky finds to keep them here." : "Saved Babbles and finds stay on this device. Create an account to send and receive."));
    list.append(e); return;
  }
  items.forEach((it) => {
    const b = el("button", "item glass"); b.type = "button";
    const mid = el("div");
    if (S.box === "saved") {
      const av = el("div", "avatar", it.kind === "find" ? "F" : it.kind === "note" ? "N" : "B");
      mid.append(el("b", null, it.title), el("small", null, (it.kind === "find" ? "Lucky find" : "Babble") + " · " + timeAgo(it.at)));
      b.append(av, mid, el("span"));
      b.addEventListener("click", () => openSaved(it));
    } else {
      mid.append(el("b", null, (S.box === "sent" ? "To @" : "@") + it.other), el("small", null, timeAgo(it.at) + (it.locked ? " · locked" : "") + (it.lob ? " · real page" : "")));
      b.append(avatarFor(it.other), mid, S.box === "inbox" && !it.read ? el("span", "dot") : el("span"));
      b.addEventListener("click", () => openBabble({ ...it, box: S.box }));
    }
    list.append(b);
  });
}
function openSaved(it) {
  if (it.kind === "find" && it.code) {
    try { const c = parseCode(it.code); return viewPage(c.address, c.len ? [{ start: c.start, len: c.len }] : [], it.title); } catch {}
  }
  if (it.code) return openBabble({ code: it.code, id: it.id, box: "saved", lob: it.lob });
  if (it.lob) return window.open(it.lob, "_blank", "noopener");
  toast(it.title);
}
async function addSaved(entry) {
  if (S.user) { try { await api("saved", entry); toast("Saved"); refreshLists(); } catch (e) { toast(e.message); } }
  else { const s = store.get("saved", []); s.unshift({ ...entry, id: "l" + Date.now(), at: Date.now() }); store.set("saved", s.slice(0, 100)); S.saved = s; renderStats(); renderList(); toast("Saved on this device"); }
}
async function removeItem(item) {
  if (item.box === "saved") {
    if (S.user) { try { await api("saved/delete", { id: item.id }); } catch (e) { return toast(e.message); } }
    else store.set("saved", store.get("saved", []).filter((x) => x.id !== item.id));
  } else { try { await api("babbles/hide", { id: item.id, box: item.box }); } catch (e) { return toast(e.message); } }
  closeSheet(); toast("Removed"); refreshLists();
}
async function markRead(item) {
  try { const r = await api("babbles/read", { id: item.id }); item.read = true; S.unread = r.unread; const it = S.inbox.find((x) => x.id === item.id); if (it) it.read = true; renderStats(); renderList(); } catch {}
}
setInterval(async () => {
  if (!S.user || document.hidden) return;
  try { const me = await api("auth/me"); if (me.unread !== S.unread) refreshLists(); } catch {}
}, 30000);

/* ================= AI ================= */
async function checkAi() {
  S.ai = S.online ? await api("ai/status").catch(() => ({ available: false })) : { available: false };
  const s = $("aiStatus"); s.textContent = "";
  const dot = el("span", "status-dot" + (S.ai.available ? " on" : ""));
  s.append(dot, document.createTextNode(S.ai.available ? `Local AI connected (${S.ai.model})` : "Using built-in word swaps"));
}
async function ai(task, input) {
  if (!S.online || (S.ai && !S.ai.available)) return null;
  try { return (await api("ai", { task, ...input })).data; } catch { return null; }
}
$("mAi").addEventListener("click", () => openSheet("t-ai", (r) => {
  r('[data-r="state"]').textContent = S.ai && S.ai.available ? `✓ Connected to ${S.ai.model}.` : "No AI model is connected right now. Look-alikes and lucky sentences use Babbly's built-in word swaps.";
}));

/* ================= EXPLORE ================= */
document.querySelectorAll("#exSeg button").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll("#exSeg button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  $("ex-lucky").classList.toggle("hidden", b.dataset.ex !== "lucky");
  $("ex-alikes").classList.toggle("hidden", b.dataset.ex !== "alikes");
}));

let lucky = null;
function rollLucky() {
  const r = randomPage(), picks = findWords(r.page);
  lucky = { ...r, picks };
  const box = $("pageText"); box.textContent = "";
  let pos = 0;
  picks.forEach((p) => { box.append(document.createTextNode(r.page.slice(pos, p.start)), el("mark", "word", p.w)); pos = p.start + p.len; });
  box.append(document.createTextNode(r.page.slice(pos)));
  const chips = $("pageWords"); chips.textContent = "";
  [...new Set([...picks].sort((a, b) => b.len - a.len).map((p) => p.w))].slice(0, 10).forEach((w) => chips.append(el("span", "chip", w)));
  $("pageCount").textContent = picks.length + " real words";
  coords($("pageCoords"), r.address);
  $("meaningBlock").classList.add("hidden");
  $("pageCard").classList.remove("hidden");
}
$("luckyBtn").addEventListener("click", rollLucky);
$("pageRead").addEventListener("click", () => lucky && viewPage(lucky.address, lucky.picks.map((p) => ({ start: p.start, len: p.len, cls: "word" })), "A random page"));
$("pageSave").addEventListener("click", () => lucky && addSaved({ kind: "find", title: "Random page: " + [...new Set(lucky.picks.map((p) => p.w))].sort((a, b) => b.length - a.length).slice(0, 4).join(", "), code: makeCode(false, 0, 0, lucky.address) }));
$("pageMeaning").addEventListener("click", async () => {
  if (!lucky) return;
  const words = lucky.picks.map((p) => p.w), btn = $("pageMeaning");
  busy(btn, true, "Reading…");
  const res = await ai("meaning", { words });
  $("meaningText").textContent = res && typeof res.meaning === "string" ? res.meaning : offlineMeaning(words);
  $("meaningBlock").classList.remove("hidden");
  busy(btn, false);
});

let found = null;
$("sentenceBtn").addEventListener("click", async () => {
  const btn = $("sentenceBtn"); busy(btn, true, "Searching the shelves…");
  const res = await ai("lucky", { theme: randomTheme() });
  const fromAi = !!(res && typeof res.sentence === "string");
  const sentence = toLibText(fromAi ? res.sentence : offlineLucky()).trim().slice(0, 160) || offlineLucky();
  await tick();
  const r = shelve(sentence);
  found = { text: sentence, ...r };
  $("sentenceText").textContent = "“" + sentence + "”";
  coords($("sentenceCoords"), r.address);
  $("sentenceReal").href = lobSearchUrl(sentence);
  $("sentenceNote").textContent = fromAi ? "Written by your AI helper, found on a real page of the Library." : "From Babbly's own list, found on a real page of the Library.";
  $("sentenceCard").classList.remove("hidden");
  busy(btn, false);
});
$("sentenceSend").addEventListener("click", () => { if (!found) return; msg.value = found.text; $("optLock").checked = false; updateWriteUi(); go("write"); });
$("sentenceSave").addEventListener("click", () => found && addSaved({ kind: "find", title: found.text, code: makeCode(false, found.start, found.len, found.address) }));

let weird = "silly";
document.querySelectorAll("#weirdSeg button").forEach((b) => b.addEventListener("click", () => {
  weird = b.dataset.w; document.querySelectorAll("#weirdSeg button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
}));
async function runAlikes(useAi) {
  showErr($("alikeErr"));
  const q = toLibText($("alikeIn").value).trim();
  if (!q) return showErr($("alikeErr"), "Type a sentence first, like “to be or not to be”.");
  const btn = $("alikeBtn"); if (useAi) busy(btn, true, "Thinking up look-alikes…");
  let list = null, note = "Built-in word swaps. “Alike” counts letters that match in order.";
  if (useAi) {
    const res = await ai("lookalikes", { text: q, level: weird });
    if (res && Array.isArray(res.alikes)) { list = res.alikes.filter((x) => typeof x === "string"); note = "Written by your AI helper, then found on real pages of the Library."; }
  }
  if (!list) list = offlineAlikes(q, weird);
  await tick();
  const seen = new Set([q]), items = [];
  for (const raw of list) {
    const t = toLibText(raw).trim().slice(0, 120);
    if (!t || seen.has(t)) continue; seen.add(t);
    items.push({ t, score: similarity(q, t), ...shelve(t) });
  }
  items.sort((a, b) => b.score - a.score);
  const box = $("alikeList"); box.textContent = "";
  if (!items.length) box.append(el("div", "empty glass", "No look-alikes this time. Try another sentence or weirdness level."));
  items.forEach((it) => {
    const d = el("div", "alike glass");
    const bar = el("div", "simbar"), fill = el("i"); fill.style.width = it.score + "%"; bar.append(fill);
    const meta = el("div", "metarow"); meta.append(el("span", null, it.score + "% alike"), el("span", "mono", shortAddr(it.address)));
    const row = el("div", "row");
    const s = el("button", "btn ghost small", "Send"); s.addEventListener("click", () => { msg.value = it.t; $("optLock").checked = false; updateWriteUi(); go("write"); });
    const v = el("button", "btn ghost small", "Page"); v.addEventListener("click", () => viewPage(it.address, [{ start: it.start, len: it.len }], "Look-alike"));
    const sv = el("button", "btn ghost small", "Save"); sv.addEventListener("click", () => addSaved({ kind: "find", title: it.t, code: makeCode(false, it.start, it.len, it.address) }));
    const real = el("a", "btn ghost small", "Real ↗"); real.href = lobSearchUrl(it.t); real.target = "_blank"; real.rel = "noopener noreferrer";
    row.append(s, v, sv, real);
    d.append(el("div", "quote", "“" + it.t + "”"), bar, meta, row);
    box.append(d);
  });
  $("alikeNote").textContent = note;
  if (useAi) busy(btn, false);
}
$("alikeBtn").addEventListener("click", () => runAlikes(true));
$("alikeIn").addEventListener("keydown", (e) => { if (e.key === "Enter") runAlikes(true); });

/* ================= ME ================= */
let installEvent = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvent = e; });
$("mInstall").addEventListener("click", () => openSheet("t-install", (r) => {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent), android = /android/i.test(navigator.userAgent);
  if (ios) r('[data-r="android"]').classList.add("hidden");
  if (android) r('[data-r="ios"]').classList.add("hidden");
  if (installEvent) {
    const b = r('[data-r="install"]'); b.classList.remove("hidden");
    b.addEventListener("click", async () => { installEvent.prompt(); await installEvent.userChoice.catch(() => {}); installEvent = null; closeSheet(); });
  }
  const secure = location.protocol === "https:" || location.hostname === "localhost";
  r('[data-r="https"]').textContent = secure ? "Once installed, Babbly opens full screen like a normal app." : "Heads up: phones only install apps (and allow Lock) from an https:// address. See the README for a free way to get one.";
}));
$("mHow").addEventListener("click", () => openSheet("t-how"));
$("mPassword").addEventListener("click", () => openSheet("t-password", (r) => {
  r('[data-r="go"]').addEventListener("click", async () => {
    const btn = r('[data-r="go"]'); busy(btn, true, "Saving…");
    try { await api("auth/password", { current: $("pwCur").value, next: $("pwNew").value }); closeSheet(); toast("Password changed"); }
    catch (e) { showErr(r('[data-r="err"]'), e.message); }
    finally { busy(btn, false); }
  });
}));

/* first explore content so the tab never opens empty */
rollLucky();
runAlikes(false);
boot();
