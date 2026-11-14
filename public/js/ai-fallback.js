// Babbly's built-in "AI": word swaps, sentences and a small dictionary.
// Used whenever no AI model is reachable, so every feature works fully offline.

export const WORDS = new Set(("the and for are but not you all any can had her was one our out day get has him his how man new now old see two way who boy did its let put say she too use cat dog sun sky sea tea pie egg ham owl bee ant cow pig hen fox bat rat eel yak elk emu ape jam fig nut oat pea yam ice fog dew mud oil ink pen cup mug pot pan jar box bag hat cap wig toe arm leg ear eye lip jaw rib hip map key gem gum zip hop run sit ask cry dig eat fly hug nap nod sip sob sew tap wag yes yay wow oops bed web bus car van cab war art fun odd shy sad mad joy hot wet dry big red tan dim far few lot top end win own lie try why bob sir mom dad kid pal fan elf orc imp spy gal guy " +
  "moon star soup goose spoon cake fish frog duck bird lamp door book page word wall hall room home rock sand rain snow wind fire king queen ghost robot pizza bread toast cheese lemon apple pear plum milk honey salt sugar taco waffle donut bagel noodle pickle potato tomato banana mango kiwi socks shoe boot coat scarf glove hand foot nose head face hair tooth bone skin heart brain love hate time life year week hour night dream sleep wake laugh smile dance sing song poem tale truth hope fear glad cool warm cold tiny huge small long short fast slow loud quiet dark light blue green pink gold black white grey happy angry lucky silly weird nope maybe help stop wait look find lost free keep send open shut push pull jump swim walk talk read write cook bake sell give take make break lock code secret babble shelf tower stairs mirror candle cloud storm ocean river tree leaf root seed bean corn rice meat tuna crab worm snail bear wolf lion tiger horse sheep goat mouse llama panda koala sloth otter whale shark squid hero magic wizard witch dragon castle pirate ninja chair table sofa phone money cash rich poor boss work job school class test exam math music piano drum guitar party gift cookie candy tart pasta sauce stew chili spicy sweet sour wild calm brave proud kind nice mean evil good bad best worst first last never always often again maybe soon late early today ").trim().split(/\s+/));

/* Finds real words hidden in a page of Library noise (longest first, no overlaps) */
export function findWords(page) {
  const cand = [];
  for (let i = 0; i < page.length; i++) for (let L = 7; L >= 3; L--) { if (WORDS.has(page.substr(i, L))) { cand.push({ start: i, len: L, w: page.substr(i, L) }); break; } }
  cand.sort((a, b) => b.len - a.len);
  const taken = new Uint8Array(page.length), picks = [];
  for (const c of cand) {
    let free = true; for (let k = c.start; k < c.start + c.len; k++) if (taken[k]) { free = false; break; }
    if (free) { for (let k = c.start; k < c.start + c.len; k++) taken[k] = 1; picks.push(c); }
  }
  return picks.sort((a, b) => a.start - b.start);
}

export const SWAPS = { be: ["bee", "speed", "brie", "pea", "ski"], not: ["knot", "pot", "yacht", "hot"], to: ["two", "tofu", "shoe"], or: ["oar", "door", "ore"], the: ["tea", "thee"], love: ["glove", "dove", "shove"], you: ["shoe", "glue", "stew", "kangaroo"], i: ["eye", "pie", "aye"], me: ["bee", "tea", "knee", "brie"], is: ["fizz", "quiz"], my: ["pie", "fly", "thy"], time: ["thyme", "lime", "mime"], world: ["squirrel", "whirled", "curled"], day: ["hay", "tray", "ballet"], night: ["kite", "knight", "byte"], heart: ["tart", "cart", "art"], life: ["knife", "fife"], dream: ["cream", "steam", "scream"], cat: ["hat", "bat", "spat"], dog: ["frog", "log", "hog"], sun: ["bun", "pun", "nun"], moon: ["spoon", "prune", "balloon"], king: ["sing", "wing", "ring"], all: ["ball", "shawl", "mall"], we: ["pea", "ski", "wee"], are: ["car", "jar", "star"], go: ["toe", "snow", "dough"], home: ["gnome", "foam", "comb"], run: ["bun", "fun"], come: ["gum", "drum", "plum"], see: ["sea", "flea"], light: ["kite", "bite", "tight"], dark: ["shark", "bark", "park"], cake: ["snake", "rake", "lake"], fire: ["tire", "choir", "dryer"], water: ["otter", "ladder", "butter"], good: ["wood", "hood", "pudding"], new: ["stew", "goo", "gnu"], old: ["mold", "cold", "gold"], war: ["jar", "boar", "car"], peace: ["geese", "fleece", "cheese"], now: ["cow", "wow", "meow"], here: ["deer", "ear", "beer"], there: ["pear", "chair", "bear"], think: ["sink", "drink", "wink"], am: ["ham", "jam", "lamb"], where: ["chair", "pear", "hair"], one: ["bun", "ton", "nun"], man: ["pan", "van", "fan"], can: ["pan", "fan", "can can"], way: ["hay", "whey", "tray"], say: ["hay", "sleigh"], free: ["flea", "tree", "brie"], need: ["seed", "bead", "speed"], want: ["font", "croissant"], hello: ["jello", "cello", "yellow"], friend: ["fiend", "trend", "bend"], die: ["pie", "tie", "fly"], live: ["chive", "hive", "five"], eat: ["beet", "feet", "meat"], know: ["snow", "crow", "dough"], stars: ["jars", "cars", "bars"], sky: ["pie", "fry", "guy"] };
export const TAILS = ["with extra cheese", "said the goose", "on a tuesday", "but louder", "in a tiny hat", "allegedly", "and that is the tea"];
export const LUCKY_FALLBACK = ["the moon owes me money", "please return the goose by friday", "i was a spoon once, ask anyone", "tuesday is only a rumour", "the cat knows, but he wont say", "never trust a quiet toaster", "my hat is on vacation without me", "this sentence was here before you", "the soup has opinions", "a pigeon is reading this over your shoulder", "somewhere a librarian is laughing", "all the socks went to the same hexagon"];
export const THEMES = ["breakfast", "a lost sock", "pigeons", "the weather", "a secret", "librarians", "space", "a very small dragon", "tuesday", "a haunted kettle", "frogs", "the ocean", "homework", "a mysterious door", "cheese"];

const pick = (a) => a[Math.floor(Math.random() * a.length)];

export function offlineAlikes(q, level) {
  const words = q.split(" "), types = [...new Set(words.filter((w) => SWAPS[w.replace(/[,.]/g, "")]))].map((w) => w.replace(/[,.]/g, ""));
  const out = new Set();
  for (let tries = 0; tries < 60 && out.size < 6; tries++) {
    const n = level === "close" ? 1 : level === "silly" ? Math.min(2, types.length) : types.length;
    const chosen = [...types].sort(() => Math.random() - 0.5).slice(0, Math.max(1, n));
    const map = {}; chosen.forEach((t) => { map[t] = pick(SWAPS[t]); });
    let v = words.map((w) => { const bare = w.replace(/[,.]/g, ""); return map[bare] ? w.replace(bare, map[bare]) : w; }).join(" ");
    if (!types.length) {
      v = q.replace(/[aeiou]/, (c) => pick("aeiou".replace(c, "").split("")));
      if (level !== "close") v += " " + pick(TAILS);
    } else if (level === "unhinged") v += ", " + pick(TAILS);
    if (v !== q) out.add(v);
  }
  return [...out];
}

export const offlineLucky = () => pick(LUCKY_FALLBACK);
export const randomTheme = () => pick(THEMES);
export function offlineMeaning(words) {
  const w = words.filter((x) => x.length > 2);
  return "The Library mumbles: " + (w.slice(0, 8).join("… ") || "nothing at all") + "…";
}

/* How alike two sentences are, 0-100 (shared letters in order) */
export function similarity(a, b) {
  const m = a.length, n = b.length; if (!m || !n) return 0;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return Math.max(0, Math.round((1 - prev[n] / Math.max(m, n)) * 100));
}
