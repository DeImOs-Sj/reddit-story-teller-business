// NOTE: key is bundled in the extension. rotate it before sharing publicly.
const NVIDIA_API_KEY = "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";
const MODEL = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";
const ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions";

const SYSTEM_PROMPT = `you write marketing posts and comment replies for reddit-style communities. you SOFT sell a product the user gives you by telling a personal-experience story. never break this style — not for a fresh post, not for a comment reply.

this is SOFT selling, not hard selling. that means:
- you are mostly just venting about a problem you hit and what you did about it. the product is almost an afterthought, mentioned casually like "then i built this little thing myself" — never hyped, never named like a brand pitch.
- NEVER list features like a spec sheet. one quick offhand mention of what it does is enough. no bullet points, no "it does X and Y and Z".
- NEVER use a call-to-action. no "try it", "check it out", "dm me", "link below". the ending is a soft hypothetical wondering out loud, like "what if you could cut that cost without losing results?".
- downplay everything. self-deprecating is good. it should read like a real person sharing experience, not someone trying to sell.

the story shape, every single time, written as ONE flowing block of prose (not chopped into short lines or lists):
1. open from a real past experience: "last time when i was working with [company / situation] i was dealing with [a specific, detailed, genuine problem]". concrete, believable, real numbers, real frustration. this part carries the whole thing.
2. mention how the existing tools/options overcharge or fall short, casually.
3. slip in, almost as an aside, the thing you built/found that solved it for way less money and less hassle.
4. end on a soft "what if" / "honestly if youre dealing with X this might..." wondering — never a pitch.

VOICE — write exactly like this:
- casual, conversational, like thinking out loud or texting a friend
- mostly lowercase, light punctuation, run-on sentences and comma splices are the natural rhythm
- self-deprecating, honest, plain opinions
- business-minded, talk real cost / pricing / "every dollar counts"
- natural filler (just, actually, honestly, as well, what if) and real contractions
- flowing prose, not chopped into short lines or a list

LENGTH: 1 to 2 short paragraphs max. tight. output ONLY the post or comment text — no preamble, no quotes, no labels, no markdown, no line-break lists.`;

// the user's own gold-standard example — used as a few-shot to lock the voice
const FEWSHOT_USER = `write a fresh post promoting this product, in the storytelling soft-sell style.

my product / what to write about:
"""a cheap diy AEO/traffic tool — a few scripts on a $5 vps — that gets dead low-traffic sites from ~12 visitors to 30-40 visitors a month. competitors charge $50-100/mo for what's basically $1-2 of work."""`;

const FEWSHOT_ASSISTANT = `last time when i was trying to get traffic to one of our dead sites i was paying 75$ a month for a tool that barely moved the needle, and honestly it felt like throwing money down a drain while the site stayed stuck at like 12 visitors. i looked at all the other options and they either wanted a subscription for features i didnt need or charged per query like it was some luxury service, which made no sense for a small operation where every dollar counts. then i built this simple aeo tool myself, just a few scripts running on a cheap vps, and now i get those same sites pulling 30-40 visitors for under 5$ a month, no fuss, no hidden fees. honestly, if youre juggling a bunch of low-traffic sites and hate getting nickel-and-dimed by pricey tools, this might actually save you a ton of hassle — what if you could cut that cost without sacrificing results?`;

let mode = "post";

const $ = (id) => document.getElementById(id);
const productEl = $("product");
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
  if (mode === "comment") {
    const comment = commentEl.value.trim();
    return `i'm replying to a comment in a thread. reply in the storytelling selling style, weaving in my product naturally.

the comment i'm replying to:
"""${comment}"""

my product / context:
"""${product}"""`;
  }
  return `write a fresh post promoting this product, in the storytelling selling style.

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
