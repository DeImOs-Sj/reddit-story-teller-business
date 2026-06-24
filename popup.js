// NOTE: key is bundled in the extension. rotate it before sharing publicly.
const NVIDIA_API_KEY = "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";
const MODEL = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";
const ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions";

const SYSTEM_PROMPT = `you write HOOK posts and comment replies for reddit-style communities. these are NOT sales posts. you are NOT pitching or selling anything. you tell a genuine personal-experience story and end with a question that baits the community to engage. the product only ever shows up as a casual aside inside your own story — never as something you're offering. never break this style — not for a fresh post, not for a comment reply.

hard rules:
- you are just a person venting about a problem you hit and what you ended up doing about it. the thing you built is mentioned offhand, like "so i ended up hacking together my own little thing" — never hyped, never named like a brand, never described feature-by-feature. one quick casual mention, that's it.
- NEVER sell. NO call-to-action, NO "try it", NO "dm me", NO "link below", NO "check it out", NO "would this save you hassle". those are banned.
- NEVER include any link, url, website, or @handle. ever. not even a placeholder. subreddits ban links.
- the ENDING is the hook — a real-sounding question that pulls replies. pick the one the user asks for:
  (a) ask the room for cheaper alternatives, like you're STILL looking: "does anyone actually know a cheaper way to do this? feels like there should be something obvious i'm missing" — even though you built your own, you play it like you're hunting, which baits people to reply.
  (b) float making it live: "honestly ive been thinking about cleaning it up and putting it online for other people too — would anyone here actually be interested, or is that a dumb idea?" — gauge interest, low-key, self-doubting, no pressure.
- downplay everything. self-deprecating, unsure, genuine. it must read like a real curious person, never a marketer.

the story shape, ONE flowing block of prose (not chopped lines, not a list):
1. open from a real past experience: "last time when i was working with / trying to [situation] i was dealing with [a specific, detailed, genuine problem]". concrete, real numbers, real frustration. this carries the post.
2. mention how the existing tools/options overcharge or fall short, casually.
3. slip in, almost as an aside, the thing you built/found that fixed it for way less money.
4. end on the chosen hook question (a or b above). a real question, never a pitch.

VOICE — write exactly like this:
- casual, like thinking out loud or texting a friend
- mostly lowercase, light punctuation, run-ons and comma splices are the natural rhythm
- self-deprecating, honest, a little unsure
- business-minded, talk real cost / "every dollar counts"
- natural filler (just, actually, honestly, as well, what if) and real contractions
- flowing prose, not chopped lines or a list

LENGTH: 1 to 2 short paragraphs max. tight.

OUTPUT FORMAT:
- for a FRESH POST: first line must be "TITLE: <a short scroll-stopping title that sounds like a real curious person, lowercase, no clickbait caps, fits the same hook vibe>". then a blank line, then the post body. nothing else.
- for a COMMENT REPLY: NO title line. just output the reply body directly.
- no quotes, no extra labels, no markdown, no line-break lists.`;

// the user's own gold-standard example, re-pointed to a hook ending — few-shot to lock voice
const FEWSHOT_USER = `write a fresh hook post in the storytelling style. ending hook: float making it live (option b).

my product / what to write about:
"""a cheap diy AEO/traffic tool — a few scripts on a $5 vps — that gets dead low-traffic sites from ~12 visitors to 30-40 visitors a month. competitors charge $50-100/mo for what's basically $1-2 of work."""`;

const FEWSHOT_ASSISTANT = `TITLE: paying 75$/mo to barely move a dead site, finally just built my own thing

last time when i was trying to get traffic to one of our dead sites i was paying 75$ a month for a tool that barely moved the needle, and honestly it felt like throwing money down a drain while the site stayed stuck at like 12 visitors. i looked at all the other options and they either wanted a subscription for features i didnt need or charged per query like it was some luxury service, which made no sense for a small operation where every dollar counts. then i kind of just hacked together my own thing, a few scripts running on a cheap vps, and now those same sites pull 30-40 visitors for under 5$ a month, no fuss, no hidden fees. honestly ive been wondering if i should clean it up and put it online so other people could use it too — would anyone here actually be interested in something like that, or do you all already have some cheap setup that works?`;

const HOOK_INSTRUCTIONS = {
  auto: "ending hook: pick whichever of the two hooks fits best.",
  alts: "ending hook: ask the room for cheaper alternatives like you're still looking (option a).",
  launch: "ending hook: float making it live and ask if anyone'd be interested (option b).",
};

// shared voice + format footer for the non-story post styles
const POST_FOOTER = `
VOICE: casual, mostly lowercase, light punctuation, run-ons and comma splices are fine, self-deprecating, honest, plain opinions, real contractions, natural filler (just, honestly, actually, ngl) used sparingly, flowing prose NOT lists.
HARD BANS: never include any link, url, website, or @handle. never hard-sell or use a call-to-action. no markdown.
GROUND IT IN THE USER'S ACTUAL INPUT: use the real topic, products, and numbers they give you. do NOT invent a generic story or reuse some template — if they ask a question, answer/pose THAT question.
LENGTH: 1 to 2 short paragraphs max.
OUTPUT: first line "TITLE: <short scroll-stopping lowercase title, no clickbait caps>" then a blank line then the body. nothing else — no quotes, no labels, no markdown, no line-break lists.`;

// post styles other than the personal-story hook (these do NOT use the AEO few-shot)
const POST_STYLE_PROMPTS = {
  hottake: `you write a punchy HOT-TAKE reddit post in a real person's casual voice, built from the topic the user gives you. you state a clear opinion or pose a provocative question and invite the community to weigh in. you are NOT hard-selling.
- lead with the take or the question right away, specific to the user's actual situation and numbers.
- if they mention a product/situation, frame it casually as context for the discussion, not a pitch.
- back the take with a sentence or two of real reasoning.
- end by genuinely asking the community what they think.${POST_FOOTER}`,

  question: `you write a sincere QUESTION / ADVICE reddit post in a real person's casual voice, built from what the user gives you. you are genuinely asking the community for input — not selling.
- get to the real question fast, grounded in the user's actual situation and numbers.
- give just enough context (what they tried or built, the numbers) so the question makes sense, mentioned plainly, never pitched.
- end with the clear question(s) you want answered.${POST_FOOTER}`,

  update: `you write a humble BUILD-IN-PUBLIC update reddit post in a real person's casual voice, built from what the user gives you. you share progress or a milestone honestly and invite feedback — not a sales pitch.
- center the real numbers/result they give and what actually happened.
- be honest about what's working AND what isn't (e.g. users but no revenue yet).
- end by asking the community for feedback or their take.${POST_FOOTER}`,
};

// extra rules to dodge subreddit self-promo auto-mods (rule-8 style)
const STEALTH_RULES = `

STEALTH MODE — this is going to a strict subreddit that auto-removes self-promo. obey these, they OVERRIDE the hook instruction above:
- you are NOT offering, sharing, launching, or recruiting testers for anything. do not say "test it", "would anyone be interested", "i could put it online", "dm me", "i made an app/tool you can use". all banned — they trip the filter.
- the thing you built stays purely INSIDE your past story as something you already did just for yourself. it is not on offer. mention it once, plainly, then move on.
- no brand name, no product name, no links, no urls, no "@". none.
- the ENDING must be a genuine ADVICE question to the room about the PROBLEM or the METHOD — never about your thing. like: "anyone know a cheaper way to do this?", "how are you all measuring which queries actually pull citations?", "is rolling your own the move here or am i missing some obvious option?".
- read like a normal person asking for help, zero promo energy.`;

// separate prompt for plain comment replies — voice only, NO selling at all
const REPLY_PROMPT = `you write a genuine reddit comment reply in a real person's casual voice. you are NOT selling or promoting anything. you do NOT have a product. just react like a normal human in the thread.

what to do:
- actually respond to what the comment says — agree or push back, add a thought or a small relevant experience, ask a follow-up, or give a useful honest take. engage with its real content, don't be generic.
- it's fine to just be short. a real comment is often 2-4 sentences. don't pad it.

VOICE:
- casual, mostly lowercase, light punctuation, run-ons and comma splices are fine
- self-deprecating, honest, plain opinions, real contractions
- natural filler (just, honestly, actually, tbh, ngl) used sparingly
- flowing prose, not lists

HARD BANS:
- NEVER mention, hint at, or promote any product, tool, app, service, or thing you built. zero self-promo.
- no links, no urls, no "@", no brand names.
- no title line. output ONLY the reply text — no quotes, no labels, no markdown.`;

// tone overlays for comment replies — appended to the reply instruction
const TONE_INSTRUCTIONS = {
  neutral: "",
  supportive:
    "TONE: supportive and warm. validate where they're coming from, be encouraging, add a genuinely helpful thought or a bit of reassurance. empathetic, not fake-positive.",
  professional:
    "TONE: professional and measured. clear, polite, composed. still human and readable, but drop the heavy slang and keep it level-headed and credible.",
  darkhumor:
    "TONE: dark, dry humor. deadpan, a little sarcastic, gallows-humor and self-deprecating jabs are welcome — but stay on-topic and never punch down. no slurs, no harassment, no cruelty toward the person.",
  disagree:
    "TONE: respectful disagreement. push back on their point with a real counter-argument or a skeptical take, say why you see it differently. firm but not rude, no insults — disagree with the idea, not the person.",
  ragebait:
    "TONE: spicy and provocative. take a bold, contrarian stance designed to make people want to argue back. confident, a little smug, hot-take energy. stay within bounds: no slurs, no hate, no personal attacks or harassment — provoke with opinions, not abuse.",
};

// ---------- dom refs ----------
const $ = (id) => document.getElementById(id);
const el = {
  product: $("product"),
  comment: $("comment"),
  commentField: $("comment-field"),
  commentPromo: $("comment-promo"),
  tone: $("tone"),
  hook: $("hook"),
  hookField: $("hook-field"),
  postStyle: $("post-style"),
  styleField: $("style-field"),
  stealth: $("stealth"),
  stealthWrap: $("stealth-wrap"),
  productLabel: $("product-label"),
  generate: $("generate"),
  genLabel: $("generate").querySelector(".btn-label"),
  status: $("status"),
  result: $("result"),
  titleBlock: $("title-block"),
  titleOut: $("title-out"),
  copyTitle: $("copy-title"),
  output: $("output"),
  copy: $("copy"),
  bodyLabel: $("body-label"),
  regen: $("regen"),
  typeBtn: $("type-btn"),
  speed: $("speed"),
  speedVal: $("speed-val"),
  tabs: Array.from(document.querySelectorAll(".tab")),
};

// ---------- state ----------
const state = { mode: "post", loading: false, result: null };
let abortCtrl = null;
let statusTimer = null;

const PERSIST_KEYS = [
  "product", "comment", "hook", "postStyle", "stealth", "commentPromo", "tone", "speed", "mode", "result",
];

function persist() {
  chrome.storage.local.set({
    product: el.product.value,
    comment: el.comment.value,
    hook: el.hook.value,
    postStyle: el.postStyle.value,
    stealth: el.stealth.checked,
    commentPromo: el.commentPromo.checked,
    tone: el.tone.value,
    speed: el.speed.value,
    mode: state.mode,
    result: state.result,
  });
}

function restore() {
  chrome.storage.local.get(PERSIST_KEYS, (r) => {
    if (r.product) el.product.value = r.product;
    if (r.comment) el.comment.value = r.comment;
    if (r.hook) el.hook.value = r.hook;
    if (r.postStyle) el.postStyle.value = r.postStyle;
    el.stealth.checked = r.stealth ?? true;
    el.commentPromo.checked = r.commentPromo ?? false;
    if (r.tone) el.tone.value = r.tone;
    if (r.speed) el.speed.value = r.speed;
    state.mode = r.mode === "comment" ? "comment" : "post";
    state.result = r.result || null;
    el.speedVal.textContent = el.speed.value;
    autoGrow(el.product);
    autoGrow(el.comment);
    renderMode();
    renderResult();
  });
}

// ---------- helpers ----------
function autoGrow(t) {
  t.style.height = "auto";
  t.style.height = Math.min(t.scrollHeight, 240) + "px";
}

function setStatus(msg, kind = "info") {
  clearTimeout(statusTimer);
  if (!msg) { el.status.hidden = true; el.status.textContent = ""; return; }
  el.status.hidden = false;
  el.status.textContent = msg;
  el.status.className = "status " + (kind === "info" ? "" : kind);
  if (kind === "success") {
    statusTimer = setTimeout(() => setStatus(""), 2500);
  }
}

function flashBtn(btn, doneText) {
  const orig = btn.textContent;
  btn.textContent = doneText;
  btn.classList.add("done");
  setTimeout(() => { btn.textContent = orig; btn.classList.remove("done"); }, 1200);
}

function plainReplyMode() {
  return state.mode === "comment" && !el.commentPromo.checked;
}

// ---------- render ----------
const STYLE_LABELS = {
  story: "your product / what you're selling",
  hottake: "your topic / hot take (+ the numbers)",
  question: "what you want to ask (+ context & numbers)",
  update: "what you built + the progress/numbers",
};

function renderMode() {
  el.tabs.forEach((t) => t.classList.toggle("active", t.dataset.mode === state.mode));
  const isPost = state.mode === "post";
  const isComment = state.mode === "comment";
  const plain = plainReplyMode();
  const style = el.postStyle.value;

  el.commentField.hidden = !isComment;

  // post-style selector: post mode only
  el.styleField.hidden = !isPost;

  // ending hook: only for the story post style, or a promo comment reply
  el.hookField.hidden = !((isPost && style === "story") || (isComment && el.commentPromo.checked));

  // stealth: whenever we're actually promoting (post of any style, or promo reply)
  el.stealthWrap.hidden = plain;

  // adapt the input label to the chosen style
  el.productLabel.textContent = isPost
    ? STYLE_LABELS[style] || STYLE_LABELS.story
    : "your product / context (for promo replies)";

  el.bodyLabel.textContent = isComment ? "reply" : "post";
}

function renderLoading() {
  el.generate.classList.toggle("loading", state.loading);
  el.genLabel.textContent = state.loading ? "stop" : "generate";
}

function renderResult() {
  if (!state.result) { el.result.hidden = true; return; }
  const { title, body } = state.result;
  el.result.hidden = false;

  if (title) {
    el.titleBlock.hidden = false;
    el.titleOut.value = title;
    autoGrow(el.titleOut);
  } else {
    el.titleBlock.hidden = true;
  }
  el.output.value = body;
  autoGrow(el.output);
}

// ---------- message building ----------
function buildMessages() {
  const product = el.product.value.trim();
  const hook = HOOK_INSTRUCTIONS[el.hook.value] || HOOK_INSTRUCTIONS.auto;
  const stealth = el.stealth.checked ? STEALTH_RULES : "";
  const comment = el.comment.value.trim();
  const tone = TONE_INSTRUCTIONS[el.tone.value] || "";
  const toneLine = tone ? `\n\n${tone}` : "";

  if (plainReplyMode()) {
    return [
      { role: "system", content: REPLY_PROMPT },
      { role: "user", content: `reply to this reddit comment in a genuine casual human voice. just react to it, no promotion, no product, no links.${toneLine}

the comment i'm replying to:
"""${comment}"""` },
    ];
  }

  if (state.mode === "comment") {
    return [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: FEWSHOT_USER },
      { role: "assistant", content: FEWSHOT_ASSISTANT },
      { role: "user", content: `i'm replying to a comment in a thread. reply in the storytelling hook style, weaving in my story naturally. ${hook}${stealth}${toneLine}

the comment i'm replying to:
"""${comment}"""

my product / context:
"""${product}"""` },
    ];
  }

  // non-story post styles: own prompt, NO few-shot so it follows the real topic
  const style = el.postStyle.value;
  if (style !== "story" && POST_STYLE_PROMPTS[style]) {
    return [
      { role: "system", content: POST_STYLE_PROMPTS[style] },
      { role: "user", content: `write a ${style === "hottake" ? "hot-take" : style} reddit post from this.${stealth}

my topic / situation / numbers:
"""${product}"""` },
    ];
  }

  // story post — personal-story soft hook (uses the few-shot to lock the voice)
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: FEWSHOT_USER },
    { role: "assistant", content: FEWSHOT_ASSISTANT },
    { role: "user", content: `write a fresh hook post in the storytelling style. ${hook}${stealth}

my product / what to write about:
"""${product}"""` },
  ];
}

function clean(text) {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function parseOutput(text) {
  const m = text.match(/^\s*TITLE:\s*(.+?)\s*\n([\s\S]*)$/i);
  if (m) return { title: m[1].trim(), body: m[2].trim() };
  return { title: "", body: text };
}

function prettyError(err) {
  if (err.name === "AbortError") return "cancelled";
  const m = String(err.message || err);
  if (/Failed to fetch|NetworkError/i.test(m)) return "network error — check your connection";
  if (/api 401|api 403/i.test(m)) return "auth failed — the nvidia key was rejected";
  if (/api 429/i.test(m)) return "rate limited — wait a moment and retry";
  return m;
}

// ---------- generate ----------
async function generate() {
  // toggle: clicking while loading cancels
  if (state.loading) { abortCtrl?.abort(); return; }

  if (!plainReplyMode() && !el.product.value.trim()) {
    setStatus("fill in the product field first", "error");
    el.product.focus();
    return;
  }
  if (state.mode === "comment" && !el.comment.value.trim()) {
    setStatus("paste the comment you're replying to", "error");
    el.comment.focus();
    return;
  }

  state.loading = true;
  renderLoading();
  setStatus("writing…", "info");
  abortCtrl = new AbortController();

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${NVIDIA_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: buildMessages(),
        temperature: 0.6,
        top_p: 0.95,
        max_tokens: 2048,
        stream: false,
        chat_template_kwargs: { enable_thinking: false },
      }),
      signal: abortCtrl.signal,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`api ${res.status}: ${body.slice(0, 160)}`);
    }

    const data = await res.json();
    const text = clean(data?.choices?.[0]?.message?.content || "");
    if (!text) throw new Error("empty response from model");

    state.result = parseOutput(text);
    persist();
    renderResult();
    setStatus("");
    el.result.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (err) {
    setStatus(prettyError(err), err.name === "AbortError" ? "info" : "error");
  } finally {
    state.loading = false;
    abortCtrl = null;
    renderLoading();
  }
}

// ---------- type into reddit ----------
async function typeIntoReddit() {
  const text = el.output.value;
  if (!text || el.typeBtn.disabled) return;

  el.typeBtn.disabled = true;
  setStatus("typing into reddit…", "info");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !/^https:\/\/([a-z0-9-]+\.)?reddit\.com\//i.test(tab.url || "")) {
      throw new Error("open a reddit tab and click into the comment/post box first");
    }
    const res = await chrome.tabs.sendMessage(tab.id, {
      type: "TYPE_TEXT",
      text,
      delayMs: Number(el.speed.value) * 30, // level 1-10 -> 30-300ms per word
    });
    if (!res || !res.ok) {
      throw new Error(res?.error || "couldn't reach the page — reload the reddit tab");
    }
    setStatus("typed into the box ✓", "success");
  } catch (err) {
    setStatus(prettyError(err), "error");
  } finally {
    el.typeBtn.disabled = false;
  }
}

async function copyToClipboard(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    flashBtn(btn, "copied ✓");
  } catch {
    setStatus("clipboard blocked — select and copy manually", "error");
  }
}

// ---------- wiring ----------
el.tabs.forEach((t) =>
  t.addEventListener("click", () => {
    state.mode = t.dataset.mode;
    renderMode();
    persist();
  })
);

el.commentPromo.addEventListener("change", () => { renderMode(); persist(); });
el.postStyle.addEventListener("change", () => { renderMode(); persist(); });
el.hook.addEventListener("change", persist);
el.stealth.addEventListener("change", persist);
el.tone.addEventListener("change", persist);

[el.product, el.comment].forEach((t) =>
  t.addEventListener("input", () => { autoGrow(t); persist(); })
);

el.speed.addEventListener("input", () => {
  el.speedVal.textContent = el.speed.value;
  persist();
});

el.generate.addEventListener("click", generate);
el.regen.addEventListener("click", generate);
el.typeBtn.addEventListener("click", typeIntoReddit);
el.copy.addEventListener("click", () => copyToClipboard(el.output.value, el.copy));
el.copyTitle.addEventListener("click", () => copyToClipboard(el.titleOut.value, el.copyTitle));

// ctrl/cmd + enter to generate from anywhere
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    generate();
  }
});

restore();
