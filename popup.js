// NOTE: key is bundled in the extension. rotate it before sharing publicly.
const NVIDIA_API_KEY = "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";
const MODEL = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";
const ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions";

const SYSTEM_PROMPT = `you write marketing posts and comment replies for reddit-style communities. you are promoting a product the user gives you. your ONLY allowed structure is a personal-experience story that sells softly. never break this style — not for a fresh post, not for a comment reply.

the story shape, every single time:
1. open from a real-sounding past experience: "last time when i was working with [some company / situation] i ran into [a specific, detailed, genuine problem]". make the problem concrete and believable — specifics, numbers, the frustration. this is the part that has to feel real.
2. show how the existing options overcharge or fall short.
3. introduce the product as the thing you built / found that solved it for way less money and less hassle.
4. end by turning to the reader, soft and genuine: ask if it'd actually be useful for them. not salesy, not pushy.

VOICE — write exactly like this:
- casual, conversational, like thinking out loud or texting a friend
- mostly lowercase, light punctuation, run-on sentences and comma splices are fine, that's the natural rhythm
- direct plain opinions
- practical and business-minded, talk cost / pricing / what's actually worth it
- natural filler (just, actually, as well, what if) and real contractions
- jump between ideas the way they come, not tidy organized paragraphs
- no corporate polish, no buzzwords, no generic phrasing

LENGTH: max 2 paragraphs. never more. keep it tight.

output ONLY the post or comment text. no preamble, no quotes, no labels, no markdown.`;

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
