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

let mode = "post";

const $ = (id) => document.getElementById(id);
const productEl = $("product");
const hookEl = $("hook");
const stealthEl = $("stealth");
const commentEl = $("comment");
const commentField = $("comment-field");
const commentPromoEl = $("comment-promo");
const commentPromoWrap = $("comment-promo-wrap");
const outputEl = $("output");
const outputWrap = $("output-wrap");
const copyBtn = $("copy");
const titleEl = $("title-out");
const titleWrap = $("title-wrap");
const copyTitleBtn = $("copy-title");
const genBtn = $("generate");
const statusEl = $("status");
const typeBtn = $("type-btn");
const speedEl = $("speed");
const speedValEl = $("speed-val");
const speedWrap = $("speed-wrap");

// restore saved product text
chrome.storage.local.get(["product"], (r) => {
  if (r.product) productEl.value = r.product;
});
productEl.addEventListener("input", () => {
  chrome.storage.local.set({ product: productEl.value });
});

// tab switching
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    mode = btn.dataset.mode;
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    commentField.hidden = mode !== "comment";
    commentPromoWrap.hidden = mode !== "comment";
  });
});

function setStatus(msg, isError = false) {
  if (!msg) { statusEl.hidden = true; return; }
  statusEl.hidden = false;
  statusEl.textContent = msg;
  statusEl.classList.toggle("error", isError);
}

// build the full messages array for the chat completion, branching on mode
function buildMessages() {
  const product = productEl.value.trim();
  const hook = HOOK_INSTRUCTIONS[hookEl.value] || HOOK_INSTRUCTIONS.auto;
  const stealth = stealthEl.checked ? STEALTH_RULES : "";

  // plain comment reply — genuine, no product, no promo
  if (mode === "comment" && !commentPromoEl.checked) {
    const comment = commentEl.value.trim();
    return [
      { role: "system", content: REPLY_PROMPT },
      {
        role: "user",
        content: `reply to this reddit comment in a genuine casual human voice. just react to it, no promotion, no product, no links.

the comment i'm replying to:
"""${comment}"""`,
      },
    ];
  }

  // promo comment reply — weave the story in softly
  if (mode === "comment") {
    const comment = commentEl.value.trim();
    return [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: FEWSHOT_USER },
      { role: "assistant", content: FEWSHOT_ASSISTANT },
      {
        role: "user",
        content: `i'm replying to a comment in a thread. reply in the storytelling hook style, weaving in my story naturally. ${hook}${stealth}

the comment i'm replying to:
"""${comment}"""

my product / context:
"""${product}"""`,
      },
    ];
  }

  // fresh hook post
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: FEWSHOT_USER },
    { role: "assistant", content: FEWSHOT_ASSISTANT },
    {
      role: "user",
      content: `write a fresh hook post in the storytelling style. ${hook}${stealth}

my product / what to write about:
"""${product}"""`,
    },
  ];
}

function clean(text) {
  // strip any leftover reasoning tags just in case
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

// split a "TITLE: ...\n\n<body>" response into { title, body }
function parseOutput(text) {
  const m = text.match(/^\s*TITLE:\s*(.+?)\s*\n([\s\S]*)$/i);
  if (m) return { title: m[1].trim(), body: m[2].trim() };
  return { title: "", body: text };
}

genBtn.addEventListener("click", async () => {
  const product = productEl.value.trim();
  const plainReply = mode === "comment" && !commentPromoEl.checked;

  // plain replies don't need a product; everything else does
  if (!plainReply && !product) {
    setStatus("fill in the product field first", true);
    return;
  }
  if (mode === "comment" && !commentEl.value.trim()) {
    setStatus("paste the comment you're replying to", true);
    return;
  }

  genBtn.disabled = true;
  setStatus("writing...");
  outputWrap.hidden = true;
  copyBtn.hidden = true;
  titleWrap.hidden = true;
  copyTitleBtn.hidden = true;
  speedWrap.hidden = true;
  typeBtn.hidden = true;

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
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`api ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    const text = clean(data?.choices?.[0]?.message?.content || "");
    if (!text) throw new Error("empty response from model");

    const { title, body } = parseOutput(text);

    if (title) {
      titleEl.value = title;
      titleWrap.hidden = false;
      copyTitleBtn.hidden = false;
    }

    outputEl.value = body;
    outputWrap.hidden = false;
    copyBtn.hidden = false;
    speedWrap.hidden = false;
    typeBtn.hidden = false;
    setStatus("");
  } catch (err) {
    setStatus(err.message || String(err), true);
  } finally {
    genBtn.disabled = false;
  }
});

copyBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText(outputEl.value);
  copyBtn.textContent = "copied";
  setTimeout(() => (copyBtn.textContent = "copy post"), 1200);
});

copyTitleBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText(titleEl.value);
  copyTitleBtn.textContent = "copied";
  setTimeout(() => (copyTitleBtn.textContent = "copy title"), 1200);
});

speedEl.addEventListener("input", () => {
  speedValEl.textContent = speedEl.value;
});

typeBtn.addEventListener("click", async () => {
  const text = outputEl.value;
  if (!text) return;

  typeBtn.disabled = true;
  setStatus("typing into reddit...");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !/^https:\/\/([a-z0-9-]+\.)?reddit\.com\//i.test(tab.url || "")) {
      throw new Error("open a reddit tab and click into the comment/post box first");
    }

    const res = await chrome.tabs.sendMessage(tab.id, {
      type: "TYPE_TEXT",
      text,
      delayMs: Number(speedEl.value),
    });

    if (!res || !res.ok) throw new Error(res?.error || "couldn't reach the page — reload the reddit tab");
    setStatus("done — typed into the box ✓");
  } catch (err) {
    setStatus(err.message || String(err), true);
  } finally {
    typeBtn.disabled = false;
  }
});
