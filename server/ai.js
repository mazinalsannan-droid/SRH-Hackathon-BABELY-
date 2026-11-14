// AI for Look-alikes, Lucky sentences and "What is it saying?".
// Talks to any OpenAI-compatible endpoint: Ollama, LM Studio, llama.cpp server, vLLM, Jan…
// Nothing here needs Claude or any paid API key. If no model is reachable, the app
// falls back to Babbly's built-in word swaps (public/js/ai-fallback.js).
import { config } from "./config.js";

const LEVELS = {
  close: "close: change only one word or a few letters, it should still almost sound like the original",
  silly: "silly: swap the key words for funny sound-alikes",
  unhinged: "unhinged: go absurd, but the shape of the original must still be recognisable",
};

export function buildPrompt(task, input) {
  if (task === "lookalikes") {
    const q = String(input.text || "").slice(0, 200);
    return `You are the joke engine of Babbly, an app built on the Library of Babel. Write 6 look-alike versions of this sentence: "${q}"
Weirdness level: ${LEVELS[input.level] || LEVELS.silly}.
Each version keeps the rhythm and length of the original but swaps words for ones that sound or look similar, so it turns funny. Example for "to be or not to be": "to speed or not to speed", "two beans or not two beans".
Rules: only lowercase letters a-z, spaces, commas and periods. At most 90 characters each. All different from the original and from each other. Family friendly.
Reply with only JSON: {"alikes": ["...", "..."]}`;
  }
  if (task === "lucky") {
    return `Invent one short, funny, surprising sentence (5 to 14 words) that someone would be delighted to stumble on in an infinite library where every possible page exists. Loose theme: ${String(input.theme || "anything").slice(0, 40)}. Family friendly. Use only lowercase letters a-z, spaces, commas and periods.
Reply with only JSON: {"sentence": "..."}`;
  }
  if (task === "meaning") {
    const words = (Array.isArray(input.words) ? input.words : []).slice(0, 60).map((w) => String(w).replace(/[^a-z]/g, "")).filter(Boolean);
    return `On a random page of the Library of Babel, these are the only real English words found, in order: ${words.join(", ")}.
Write one funny sentence (at most 22 words) that claims to be what this page is secretly trying to say, using as many of these words as you can. Playful, family friendly.
Reply with only JSON: {"meaning": "..."}`;
  }
  return null;
}

function parseJson(text) {
  try { return JSON.parse(text); } catch {}
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch {} }
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch {} }
  return null;
}

let lastCheck = { at: 0, ok: false };
export async function aiStatus() {
  if (!config.aiEnabled) return { available: false, reason: "disabled" };
  if (Date.now() - lastCheck.at < 30000) return { available: lastCheck.ok, model: config.aiModel };
  try {
    const r = await fetch(config.aiBaseUrl.replace(/\/$/, "") + "/models", { signal: AbortSignal.timeout(2500), headers: authHeaders() });
    lastCheck = { at: Date.now(), ok: r.ok };
  } catch { lastCheck = { at: Date.now(), ok: false }; }
  return { available: lastCheck.ok, model: config.aiModel };
}

function authHeaders() { return config.aiApiKey ? { Authorization: `Bearer ${config.aiApiKey}` } : {}; }

export async function runAi(task, input) {
  if (!config.aiEnabled) return null;
  const prompt = buildPrompt(task, input);
  if (!prompt) return null;
  try {
    const r = await fetch(config.aiBaseUrl.replace(/\/$/, "") + "/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(config.aiTimeoutMs),
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        model: config.aiModel,
        temperature: 1.0,
        messages: [
          { role: "system", content: "You reply with valid JSON only. No explanations." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!r.ok) { lastCheck = { at: Date.now(), ok: false }; return null; }
    const data = await r.json();
    const text = data?.choices?.[0]?.message?.content || "";
    lastCheck = { at: Date.now(), ok: true };
    return parseJson(text);
  } catch {
    lastCheck = { at: Date.now(), ok: false };
    return null;
  }
}
