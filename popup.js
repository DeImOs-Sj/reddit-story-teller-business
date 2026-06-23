// NOTE: key is bundled in the extension. rotate it before sharing publicly.
const NVIDIA_API_KEY = "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";
const MODEL = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";
const ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions";

const SYSTEM_PROMPT = `you write HOOK posts and comment replies for reddit-style communities. these are NOT sales posts. you are NOT pitching or selling anything. you tell a genuine personal-experience story and end with a question that baits the community to engage. the product only ever shows up as a casual aside inside your own story — never as something you're offering. never break this style — not for a fresh post, not for a comment reply.

hard rules:
- you are just a person venting about a problem you hit and what you ended up doing about it. the thing you built is mentioned offhand, like "so i ended up hacking together my own little thing" — never hyped, never named like a brand, never described feature-by-feature. one quick casual mention, that's it.
- NEVER sell. NO call-to-action, NO "try it", NO "dm me", NO "link below", NO "check it out", NO "would this save you hassle". those are banned.
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

LENGTH: 1 to 2 short paragraphs max. tight. output ONLY the post or comment text — no preamble, no quotes, no labels, no markdown, no line-break lists.`;

// the user's own gold-standard example, re-pointed to a hook ending — few-shot to lock voice
const FEWSHOT_USER = `write a fresh hook post in the storytelling style. ending hook: float making it live (option b).

my product / what to write about:
"""a cheap diy AEO/traffic tool — a few scripts on a $5 vps — that gets dead low-traffic sites from ~12 visitors to 30-40 visitors a month. competitors charge $50-100/mo for what's basically $1-2 of work."""`;

const FEWSHOT_ASSISTANT = `last time when i was trying to get traffic to one of our dead sites i was paying 75$ a month for a tool that barely moved the needle, and honestly it felt like throwing money down a drain while the site stayed stuck at like 12 visitors. i looked at all the other options and they either wanted a subscription for features i didnt need or charged per query like it was some luxury service, which made no sense for a small operation where every dollar counts. then i kind of just hacked together my own thing, a few scripts running on a cheap vps, and now those same sites pull 30-40 visitors for under 5$ a month, no fuss, no hidden fees. honestly ive been wondering if i should clean it up and put it online so other people could use it too — would anyone here actually be interested in something like that, or do you all already have some cheap setup that works?`;

const HOOK_INSTRUCTIONS = {
  auto: "ending hook: pick whichever of the two hooks fits best.",
  alts: "ending hook: ask the room for cheaper alternatives like you're still looking (option a).",
  launch: "ending hook: float making it live and ask if anyone'd be interested (option b).",
};

let mode = "post";

const $ = (id) => document.getElementById(id);
const productEl = $("product");
const hookEl = $("hook");
const commentEl = $("comment");
const commentField = $("comment-field");
const outputEl = $("output");
const outputWrap = $("output-wrap");
const copyBtn = $("copy");
const genBtn = $("generate");
const statusEl = $("status");

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
  });
});

function setStatus(msg, isError = false) {
  if (!msg) { statusEl.hidden = true; return; }
  statusEl.hidden = false;
  statusEl.textContent = msg;
  statusEl.classList.toggle("error", isError);
}

function buildUserMessage() {
  const product = productEl.value.trim();
  const hook = HOOK_INSTRUCTIONS[hookEl.value] || HOOK_INSTRUCTIONS.auto;
  if (mode === "comment") {
    const comment = commentEl.value.trim();
    return `i'm replying to a comment in a thread. reply in the storytelling hook style, weaving in my story naturally. ${hook}

the comment i'm replying to:
"""${comment}"""

my product / context:
"""${product}"""`;
  }
  return `write a fresh hook post in the storytelling style. ${hook}

my product / what to write about:
"""${product}"""`;
}

function clean(text) {
  // strip any leftover reasoning tags just in case
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

genBtn.addEventListener("click", async () => {
  const product = productEl.value.trim();
  if (!product) { setStatus("fill in the product field first", true); return; }
  if (mode === "comment" && !commentEl.value.trim()) {
    setStatus("paste the comment you're replying to", true);
    return;
  }

  genBtn.disabled = true;
  setStatus("writing...");
  outputWrap.hidden = true;
  copyBtn.hidden = true;

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${NVIDIA_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: FEWSHOT_USER },
          { role: "assistant", content: FEWSHOT_ASSISTANT },
          { role: "user", content: buildUserMessage() },
        ],
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

    outputEl.value = text;
    outputWrap.hidden = false;
    copyBtn.hidden = false;
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
  setTimeout(() => (copyBtn.textContent = "copy"), 1200);
});
