# Babbly 🫧

Hide messages in the infinite Library of Babel and send them to other Babblers.

- **Accounts.** Babblers have a username and password, stored in a SQLite database on your server.
- **Guest mode.** Guests can hide, open and explore without an account. Their saved items stay on their own device.
- **Lock.** Messages are encrypted on the phone itself with AES-256 and a passphrase. The server only ever stores the address.
- **Real Library.** The server looks your text up on libraryofbabel.info and gives you that site's real hex code and page link.
- **Explore.** "I'm Feeling Babbly" pulls a random page, and Look-alikes turns "to be or not to be" into "to speed or not to speed". The AI for these runs on your own model, so no Claude or OpenAI key is needed.
- **Installable on phones.** Babbly is a web app you add to your home screen.

---

## 1. What's in the folder

```
babbly/
├── package.json            npm start / npm run dev
├── .env.example            all settings (copy to .env)
├── server/                 the backend (Node.js, no npm packages needed)
│   ├── server.js           web server + API routes
│   ├── config.js           settings / .env loader
│   ├── db.js               SQLite database: users, sessions, babbles, saved
│   ├── auth.js             passwords (scrypt), login sessions, rate limits
│   ├── lob.js              searches the real libraryofbabel.info
│   └── ai.js               talks to your local AI model (Ollama, LM Studio, llama.cpp…)
├── public/                 the app (what the browser/phone loads)
│   ├── index.html          screens and pop-up sheets
│   ├── css/styles.css      the design
│   ├── js/app.js           screens, tabs, buttons
│   ├── js/library.js       the Library math, Lock (AES), Babble codes
│   ├── js/ai-fallback.js   built-in word swaps when no AI is running
│   ├── js/api.js           calls to the server
│   ├── js/ui.js            small helpers (sheets, toasts, copy)
│   ├── manifest.webmanifest + sw.js   make it installable + work offline
│   └── assets/             mascot, icons, background images
└── tools/                  re-draws the background and icons (optional)
```

## 2. Run it on your computer

1. Install **Node.js 22 or newer** from https://nodejs.org (the LTS version is fine).
2. Open a terminal in the `babbly` folder and run:
   ```
   npm start
   ```
3. Open **http://localhost:8080**, create an account, and you're in.

No `npm install` is needed: the server only uses features built into Node. The database is created at `data/babbly.db`. Back up that file to keep your users and Babbles.

To change settings, copy `.env.example` to `.env` and edit it, for example to change the port or to switch off new sign-ups once all your friends have joined (`ALLOW_SIGNUPS=false`).

## 3. Let your friends use it (multiple Babblers)

Everyone has to reach the **same server**, and phones need an **https://** address. Without https, phones won't install the app and can't use Lock. Pick one of these:

### A. Quick and free: a tunnel from your computer (good for testing)
1. Install Cloudflare's `cloudflared`: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
2. With Babbly running, open a second terminal and run:
   ```
   cloudflared tunnel --url http://localhost:8080
   ```
3. It prints an address like `https://something-random.trycloudflare.com`. Send that to your friends.
   It only works while your computer is on, and you get a new address each time you start the tunnel.

### B. Always on: host it online
Any host that runs **Node.js 22+** and keeps a **persistent disk** works, because the SQLite file must survive restarts. For example:
- **Render.com**: New → Web Service → connect your GitHub repo. Start command `npm start`. Add a Disk mounted at `/data` and set `DB_PATH=/data/babbly.db`.
- **Railway** or **Fly.io**: same idea. Use a volume for `DB_PATH`.
- **A small VPS** (Hetzner, DigitalOcean…): run `npm start` with a process manager such as `pm2` or systemd, and put **Caddy** in front for automatic https:
  ```
  babbly.yourdomain.com {
      reverse_proxy localhost:8080
  }
  ```

## 4. Install it on a phone

Once Babbly is on an https:// address:

- **iPhone / iPad:** open the address in **Safari** → tap **Share** → **Add to Home Screen** → **Add**.
- **Android:** open it in **Chrome** → **⋮ menu** → **Install app** (or **Add to Home screen**).

It then opens full screen with its own icon, like a normal app. The **Me → Install on your phone** screen in Babbly shows the same steps.

**App Store / Google Play (optional, later):** you can wrap the same app with **Capacitor** (https://capacitorjs.com) to publish it as a real store app. That needs an Apple Developer account (99 $/year) and a Google Play account (25 $ once). The web app above is free and works today.

**Only a website?** You can also host just the `public/` folder on a static host (GitHub Pages, Netlify). It then runs in **offline guest mode**: hiding, opening, Lock and Explore all work, but accounts, the Inbox and automatic Real Library lookups need the server.

## 5. AI without Claude (or any paid API)

Babbly's AI is only used for the fun parts: Look-alikes, Lucky sentences, and "What's it saying?". The server sends those prompts to **any OpenAI-compatible endpoint**, so you can run a free model yourself. If none is running, Babbly quietly uses its built-in word swaps, so nothing breaks.

| Option | Where it runs | Effort | Notes |
|---|---|---|---|
| **Ollama** (recommended) | the computer/server running Babbly | easy | Install from https://ollama.com, then `ollama pull llama3.2:3b` (about 2 GB). Other good small models: `qwen2.5:3b`, `gemma2:2b`, `llama3.2:1b` (fastest). Defaults in `.env.example` already point here. |
| **LM Studio** | your computer, with a window to manage it | easy | Download a model, start "Local Server", set `AI_BASE_URL=http://localhost:1234/v1` and `AI_MODEL=` the model name. |
| **llama.cpp `llama-server`** | any machine, even a Raspberry Pi 5 with a 1B model | medium | Very lightweight. `llama-server -m model.gguf --port 8081`, then `AI_BASE_URL=http://localhost:8081/v1`. |
| **In the browser: WebLLM or Transformers.js** | each user's own phone/laptop | medium–hard | Fully offline on the device, no server AI at all. Needs WebGPU and a one-time download of about 0.4–1 GB per device (e.g. Qwen2.5-0.5B or Llama-3.2-1B). Heavy for older phones. |
| **Built-in on-device AI** (Chrome's built-in Gemini Nano, Apple Foundation Models, Android ML Kit GenAI) | the phone's own system model | hard | Free and private, but each needs a specific browser/OS version or a native app wrapper. Check current availability before you build on them. |
| **No AI, smarter rules** | anywhere | easy | Grow `public/js/ai-fallback.js` with a rhyming dictionary (e.g. the free CMU Pronouncing Dictionary). That gives real sound-alike swaps, tiny and 100% offline. |

**My suggestion:** for the server, use **Ollama with `llama3.2:3b` or `qwen2.5:3b`**. A normal laptop CPU answers in a few seconds. If you host Babbly on a cheap cloud server without a graphics card, use a 1B model, or keep the built-in swaps and add the rhyming dictionary.

## 6. Security notes

- Passwords are hashed with **scrypt** (with a random salt). Logins use a random session token in an **HttpOnly, SameSite** cookie that is marked **Secure** on https.
- Logins, sign-ups, AI calls and Library searches are **rate limited**.
- **Locked** Babbles are encrypted on the sender's device. The server and the database only hold the address, which is useless without the passphrase. Share passphrases face to face or over a different channel.
- **Unlocked** Babbles can be read by anyone who has the code. That's the point of the Library, so use Lock for anything private.
- Keep `data/babbly.db` backed up and private.

## 7. Customising the look

- **Background:** `public/assets/bg-portrait.jpg` (phones) and `bg-wide.jpg` (computers) are original illustrations drawn by `tools/make-background.html`. To use your own photo, replace those two files with your image, keeping the same names. Only use a photo you have the rights to.
- **Mascot / logo:** `public/assets/mascot.svg`. After changing it, run `npm run assets` to regenerate the app icons. This needs Python with Playwright (`pip install playwright && playwright install chromium`).
- **Colours and fonts:** the tokens at the top of `public/css/styles.css`.

## 8. API reference (for later features)

All endpoints are under `/api`. Requests that change data must send the header `X-Babbly: 1` and a JSON body.

| Method | Path | What it does |
|---|---|---|
| GET | `/auth/me` | Current user, unread count |
| POST | `/auth/register` `{username, password}` | Create account + sign in |
| POST | `/auth/login` `{username, password}` | Sign in |
| POST | `/auth/logout` | Sign out |
| POST | `/auth/password` `{current, next}` | Change password |
| GET | `/users/search?q=` | Username suggestions (signed in) |
| POST | `/babbles` `{to, code, lob?, locked}` | Send a Babble |
| GET | `/babbles?box=inbox\|sent` | List Babbles |
| POST | `/babbles/read` `{id}` / `/babbles/hide` `{id, box}` | Mark read / remove from a list |
| GET/POST | `/saved`, POST `/saved/delete` | Saved Babbles and finds |
| POST | `/lob/search` `{text}` | Real libraryofbabel.info address for a text |
| GET | `/ai/status`, POST `/ai` `{task, …}` | Local AI status / request |

Babble code format: `bbl1.<L|P>.<start>.<length>.<wall>.<shelf>.<volume>.<page>.<hexagon>`.
A share link is `https://your-babbly/#c=<code>`. The part after `#` never reaches the server.
