// popup.js — UI wiring + state. all generation logic lives in lib.js (window.SPW).
// NOTE: key is bundled in the extension. rotate it before sharing publicly.
const NVIDIA_API_KEY = "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";

// ---------- dom refs ----------
const $ = (id) => document.getElementById(id);
const el = {
  product: $("product"),
  productLabel: $("product-label"),
  postInputField: $("post-input-field"),
  comment: $("comment"),
  commentLabel: $("comment-label"),
  commentInputField: $("comment-input-field"),
  postctx: $("postctx"),
  postctxLabel: $("postctx-label"),
  postctxField: $("postctx-field"),
  guidance: $("guidance"),
  guidanceField: $("guidance-field"),
  expand: $("expand"),
  commentPromo: $("comment-promo"),
  commentPromoWrap: $("comment-promo-wrap"),
  xKind: $("x-kind"),
  xKindField: $("x-kind-field"),
  tone: $("tone"),
  toneField: $("tone-field"),
  hook: $("hook"),
  hookField: $("hook-field"),
  stealth: $("stealth"),
  stealthWrap: $("stealth-wrap"),
  karma: $("karma"),
  karmaWrap: $("karma-wrap"),
  length: $("length"),
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
  "product", "comment", "postctx", "guidance", "hook", "stealth", "commentPromo",
  "tone", "xKind", "length", "speed", "mode", "result", "karma",
];

function persist() {
  chrome.storage.local.set({
    product: el.product.value,
    comment: el.comment.value,
    postctx: el.postctx.value,
    guidance: el.guidance.value,
    hook: el.hook.value,
    stealth: el.stealth.checked,
    commentPromo: el.commentPromo.checked,
    tone: el.tone.value,
    xKind: el.xKind.value,
    length: el.length.value,
    speed: el.speed.value,
    mode: state.mode,
    result: state.result,
    karma: el.karma.checked,
  });
}

function restore() {
  chrome.storage.local.get(PERSIST_KEYS, (r) => {
    if (r.product) el.product.value = r.product;
    if (r.comment) el.comment.value = r.comment;
    if (r.postctx) el.postctx.value = r.postctx;
    if (r.guidance) el.guidance.value = r.guidance;
    if (r.hook) el.hook.value = r.hook;
    el.stealth.checked = r.stealth ?? true;
    el.commentPromo.checked = r.commentPromo ?? false;
    el.karma.checked = r.karma ?? false;
    if (r.tone) el.tone.value = r.tone;
    if (r.xKind) el.xKind.value = r.xKind;
    if (r.length) el.length.value = r.length;
    if (r.speed) el.speed.value = r.speed;
    state.mode = ["post", "comment", "x"].includes(r.mode) ? r.mode : "post";
    state.result = r.result || null;
    el.speedVal.textContent = el.speed.value;
    autoGrow(el.product);
    autoGrow(el.comment);
    autoGrow(el.postctx);
    autoGrow(el.guidance);
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
  if (kind === "success") statusTimer = setTimeout(() => setStatus(""), 2500);
}

function flashBtn(btn, doneText) {
  const orig = btn.textContent;
  btn.textContent = doneText;
  btn.classList.add("done");
  setTimeout(() => { btn.textContent = orig; btn.classList.remove("done"); }, 1200);
}

// mode predicates
const isPost = () => state.mode === "post";
const isComment = () => state.mode === "comment";
const isX = () => state.mode === "x";
const xPost = () => isX() && el.xKind.value === "post";
const xReply = () => isX() && el.xKind.value === "reply";
const plainReplyMode = () => isComment() && !el.commentPromo.checked;

// gather everything lib.js needs to build the request
function gatherCfg() {
  return {
    mode: state.mode,
    product: el.product.value.trim(),
    comment: el.comment.value.trim(),
    postContext: el.postctx.value.trim(),
    guidance: el.guidance.value.trim(),
    idea: el.product.value.trim(),   // x-post reuses the product box
    tweet: el.comment.value.trim(),  // x-reply reuses the comment box
    postStyle: "story",              // post-style picker removed; reddit posts are always story
    hook: el.hook.value,
    stealth: el.stealth.checked,
    tone: el.tone.value,
    commentPromo: el.commentPromo.checked,
    xKind: el.xKind.value,
    length: el.length.value,
    karma: el.karma.checked,
  };
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
  const style = "story"; // post-style picker removed; reddit posts are always story
  const karma = el.karma.checked;

  // which big input is showing
  el.postInputField.hidden = !(isPost() || xPost());
  el.commentInputField.hidden = !(isComment() || xReply());

  // x-kind always relevant in x mode
  el.xKindField.hidden = !isX();
  // tone applies to any reply (karma or not)
  el.toneField.hidden = !(isComment() || xReply());
  // post-context + your-suggestions boxes: any reply (reddit comment or x reply), karma or not
  el.postctxField.hidden = !(isComment() || xReply());
  el.guidanceField.hidden = !(isComment() || xReply());
  el.postctxLabel.textContent = xReply()
    ? "the original tweet / thread — for context (optional)"
    : "the original post / thread — for context (optional)";
  el.length.parentElement.hidden = false;

  // karma mode hides ALL promo machinery — it's pure value, no selling
  el.hookField.hidden = karma || !((isPost() && style === "story") || (isComment() && el.commentPromo.checked));
  el.commentPromoWrap.hidden = karma || !isComment();
  el.stealthWrap.hidden = karma || !(isPost() || (isComment() && el.commentPromo.checked));

  // labels
  if (isPost()) {
    el.productLabel.textContent = karma
      ? "what's on your mind — your take, story, or question (no product)"
      : (STYLE_LABELS[style] || STYLE_LABELS.story);
  } else if (xPost()) {
    el.productLabel.textContent = karma ? "your topic / thought (no product)" : "your idea brief";
  }

  el.commentLabel.innerHTML = xReply()
    ? "the tweet / comment you're replying to <em class=\"muted\">— optional</em>"
    : "the comment you're replying to <em class=\"muted\">— optional</em>";

  el.bodyLabel.textContent = isComment() || xReply() ? "reply" : "post";
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

// ---------- validation ----------
// returns an error string, or null if ok
function validate() {
  if (isPost() && !el.product.value.trim()) return ["fill in the topic / product field first", el.product];
  if (xPost() && !el.product.value.trim()) return ["write your idea brief first", el.product];
  // comment + post-context are both optional now; just need at least one signal to reply to
  if (isComment() && !el.comment.value.trim() && !el.postctx.value.trim() && !el.guidance.value.trim())
    return ["give me something to reply to — a comment, the post context, or your suggestions", el.comment];
  if (isComment() && !el.karma.checked && el.commentPromo.checked && !el.product.value.trim())
    return ["promo is on — fill in your product/context, or turn it off", el.product];
  if (xReply() && !el.comment.value.trim()) return ["paste the tweet you're replying to", el.comment];
  return null;
}

// ---------- generate ----------
async function generate() {
  if (state.loading) { abortCtrl?.abort(); return; }

  const bad = validate();
  if (bad) { setStatus(bad[0], "error"); bad[1].focus(); return; }

  state.loading = true;
  renderLoading();
  setStatus("writing…", "info");
  abortCtrl = new AbortController();

  const MAX_TRIES = 3; // this small model occasionally spits garbage — retry on degeneration
  const cfg = gatherCfg();

  try {
    let text = "";
    for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
      if (attempt > 1) setStatus(`retrying (bad output)… ${attempt}/${MAX_TRIES}`, "info");

      const res = await fetch(SPW.ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${NVIDIA_API_KEY}`,
        },
        body: JSON.stringify(SPW.buildPayload(cfg)),
        signal: abortCtrl.signal,
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`api ${res.status}: ${body.slice(0, 160)}`);
      }

      const data = await res.json();
      text = SPW.clean(data?.choices?.[0]?.message?.content || "");
      // good output = non-empty, not garbage, and (for posts) actually has a title
      const titleOk = !SPW.expectsTitle(cfg) || !!SPW.parseOutput(text).title;
      if (text && !SPW.looksDegenerate(text) && titleOk) break;
      if (attempt === MAX_TRIES && !text) throw new Error("empty response from model");
    }

    if (!text) throw new Error("empty response from model");
    if (SPW.looksDegenerate(text)) {
      setStatus("model kept returning garbage — hit regenerate to try again", "error");
    } else {
      setStatus("");
    }

    state.result = SPW.parseOutput(text);
    persist();
    renderResult();
    el.result.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (err) {
    setStatus(prettyError(err), err.name === "AbortError" ? "info" : "error");
  } finally {
    state.loading = false;
    abortCtrl = null;
    renderLoading();
  }
}

function prettyError(err) {
  if (err.name === "AbortError") return "cancelled";
  const m = String(err.message || err);
  if (/Failed to fetch|NetworkError/i.test(m)) return "network error — check your connection";
  if (/api 401|api 403/i.test(m)) return "auth failed — the nvidia key was rejected";
  if (/api 429/i.test(m)) return "rate limited — wait a moment and retry";
  return m;
}

// ---------- type into the reddit/x box ----------
// speed slider = characters per second (1 slow .. 10 fast); content types char-by-char.
async function typeIntoBox() {
  const text = el.output.value;
  if (!text || el.typeBtn.disabled) return;

  el.typeBtn.disabled = true;
  setStatus("typing…", "info");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const cps = Math.max(1, Number(el.speed.value) || 1);
    const msg = { type: "TYPE_TEXT", text, delayMs: Math.round(1000 / cps), byChar: true };

    let res;
    try {
      res = await chrome.tabs.sendMessage(tab.id, msg);
    } catch (e) {
      // content script not injected in this tab (extension reloaded, tab not refreshed)
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ["content.js"],
      });
      res = await chrome.tabs.sendMessage(tab.id, msg);
    }
    if (!res || !res.ok) throw new Error(res?.error || "couldn't reach the page — reload the tab and click into the text box");
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

el.karma.addEventListener("change", () => { renderMode(); persist(); });
el.commentPromo.addEventListener("change", () => { renderMode(); persist(); });
el.xKind.addEventListener("change", () => { renderMode(); persist(); });
el.hook.addEventListener("change", persist);
el.stealth.addEventListener("change", persist);
el.tone.addEventListener("change", persist);
el.length.addEventListener("change", persist);

[el.product, el.comment, el.postctx, el.guidance].forEach((t) =>
  t.addEventListener("input", () => { autoGrow(t); persist(); })
);

// open the popup as a full browser tab (popups are capped small by chrome)
el.expand.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("popup.html?tab=1") });
});

el.speed.addEventListener("input", () => {
  el.speedVal.textContent = el.speed.value;
  persist();
});

el.generate.addEventListener("click", generate);
el.regen.addEventListener("click", generate);
el.typeBtn.addEventListener("click", typeIntoBox);
el.copy.addEventListener("click", () => copyToClipboard(el.output.value, el.copy));
el.copyTitle.addEventListener("click", () => copyToClipboard(el.titleOut.value, el.copyTitle));

document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    generate();
  }
});

// when launched in a real tab (?tab=1), go wide instead of the 400px popup bubble
if (new URLSearchParams(location.search).get("tab")) {
  document.body.classList.add("in-tab");
  el.expand.hidden = true;
}

restore();
