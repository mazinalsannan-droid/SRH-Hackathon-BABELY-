// Looks text up on the real libraryofbabel.info (Jonathan Basile's site) and returns its addresses.
// The site's algorithm isn't public, so we ask its own search page, just as a visitor would.
import { config } from "./config.js";

export const LOB = "https://libraryofbabel.info";
const cache = new Map();

export const bookUrl = (a) => `${LOB}/book.cgi?${a.hex}-w${a.wall}-s${a.shelf}-v${String(a.vol).padStart(2, "0")}:${a.page}`;

/* The results page has sections "exact match", "with random characters", "with random English words",
   "title search". Each result calls postform('hex','wall','shelf','volume','page'[,'index']). */
export function parseResults(html) {
  const sections = [];
  const re = /<h3>([^<]*)<\/h3>/gi;
  let m;
  const heads = [];
  while ((m = re.exec(html))) heads.push({ title: m[1].trim().replace(/:$/, ""), at: m.index });
  heads.forEach((h, i) => {
    const chunk = html.slice(h.at, i + 1 < heads.length ? heads[i + 1].at : undefined);
    const call = chunk.match(/postform\('([0-9a-z]+)'\s*,\s*'(\d+)'\s*,\s*'(\d+)'\s*,\s*'(\d+)'\s*,\s*'(\d+)'(?:\s*,\s*'(\d*)')?/i);
    if (!call) return;
    const a = { hex: call[1].toLowerCase(), wall: +call[2], shelf: +call[3], vol: +call[4], page: +call[5] };
    sections.push({ kind: h.title, ...a, index: call[6] ? +call[6] : null, url: bookUrl(a) });
  });
  return sections;
}

export async function searchLob(text) {
  if (!config.lobEnabled) throw Object.assign(new Error("disabled"), { status: 503 });
  if (cache.has(text)) return cache.get(text);
  const url = `${LOB}/search.cgi?find=${encodeURIComponent(text)}&btnSubmit=Search&method=x`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { "User-Agent": "Babbly/1.0 (personal Library of Babel messenger)" } });
  if (!res.ok) throw Object.assign(new Error("site error " + res.status), { status: 502 });
  const results = parseResults(await res.text());
  if (!results.length) throw Object.assign(new Error("no results"), { status: 502 });
  const out = { exact: results.find((r) => /exact/i.test(r.kind)) || results[0], all: results };
  cache.set(text, out);
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return out;
}
