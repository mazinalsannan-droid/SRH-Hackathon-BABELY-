// Talks to the Babbly server. If there's no server (e.g. the files are opened
// directly or hosted as a plain website), Babbly runs in offline guest mode.
let online = null;

export async function serverOnline() {
  if (online !== null) return online;
  try {
    const r = await fetch("api/health", { cache: "no-store", signal: AbortSignal.timeout(4000) });
    online = r.ok && (await r.json()).ok === true;
  } catch { online = false; }
  return online;
}

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function api(path, body, method) {
  const opts = { method: method || (body ? "POST" : "GET"), credentials: "same-origin", headers: { "X-Babbly": "1" } };
  if (body) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
  let r;
  try { r = await fetch("api/" + path, opts); }
  catch { throw new ApiError(0, "Can't reach the Babbly server. Check your connection."); }
  let data = {};
  try { data = await r.json(); } catch {}
  if (!r.ok) throw new ApiError(r.status, data.error || "Something went wrong.");
  return data;
}
