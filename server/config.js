// Babbly server settings. Every value can be set as an environment variable
// or in a ".env" file next to package.json (see .env.example).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Minimal .env loader (no dependency needed)
const envFile = path.join(ROOT, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const env = (k, d) => (process.env[k] === undefined || process.env[k] === "" ? d : process.env[k]);
const bool = (k, d) => ["1", "true", "yes", "on"].includes(String(env(k, d)).toLowerCase());

export const config = {
  port: Number(env("PORT", 8080)),
  host: env("HOST", "0.0.0.0"),
  dbPath: path.resolve(ROOT, env("DB_PATH", "data/babbly.db")),
  publicDir: path.join(ROOT, "public"),
  // Set to true when the site is served over HTTPS (needed for phones / install).
  // "auto" trusts the X-Forwarded-Proto header from a proxy or tunnel.
  cookieSecure: env("COOKIE_SECURE", "auto"),
  trustProxy: bool("TRUST_PROXY", true),
  sessionDays: Number(env("SESSION_DAYS", 30)),
  allowSignups: bool("ALLOW_SIGNUPS", true),

  // AI: any OpenAI-compatible endpoint. Default = Ollama running on this computer.
  aiEnabled: bool("AI_ENABLED", true),
  aiBaseUrl: env("AI_BASE_URL", "http://localhost:11434/v1"),
  aiModel: env("AI_MODEL", "llama3.2:3b"),
  aiApiKey: env("AI_API_KEY", ""),
  aiTimeoutMs: Number(env("AI_TIMEOUT_MS", 45000)),

  // Searching the real libraryofbabel.info from the server
  lobEnabled: bool("LOB_ENABLED", true),
};
