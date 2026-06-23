// Content script: types generated text into the reddit comment/post box, word by word.
// Reddit uses a contenteditable rich editor on new reddit and a plain <textarea> on old reddit.
// We track the last-focused editable so it still works after the popup steals focus.

let lastEditable = null;

function isEditable(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT" && /^(text|search|url|email)$/i.test(el.type)) return true;
  if (el.isContentEditable) return true;
  return false;
}

// remember whatever editable the user last clicked into.
// composedPath()[0] gives the REAL target even across shadow-DOM boundaries
// (focusin retargets e.target to the shadow host, e.g. <shreddit-composer>).
document.addEventListener(
  "focusin",
  (e) => {
    const real = (e.composedPath && e.composedPath()[0]) || e.target;
    if (isEditable(real)) lastEditable = real;
  },
  true
);

const isVisible = (el) => el.getClientRects().length > 0;

// recursively collect editables, piercing open shadow roots
function collectEditables(root, out) {
  let nodes;
  try {
    nodes = root.querySelectorAll("*");
  } catch {
    return;
  }
  for (const el of nodes) {
    if (isEditable(el) && isVisible(el)) out.push(el);
    if (el.shadowRoot) collectEditables(el.shadowRoot, out);
  }
}

// is this node still attached to the page (through shadow roots too)?
function isAttached(node) {
  let n = node;
  while (n) {
    if (n === document) return true;
    n = n.parentNode || (n.getRootNode && n.getRootNode().host);
  }
  return false;
}

// find the reddit comment/post box
function findEditable() {
  if (lastEditable && isAttached(lastEditable) && isVisible(lastEditable)) {
    return lastEditable;
  }
  const all = [];
  collectEditables(document, all);
  // prefer the real reddit rich-text editor if present
  const lexical = all.filter(
    (el) =>
      el.getAttribute("data-lexical-editor") === "true" ||
      el.getAttribute("name") === "body" ||
      el.getAttribute("role") === "textbox"
  );
  const pool = lexical.length ? lexical : all;
  return pool[pool.length - 1] || null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// insert one chunk of text using the method that the editor will actually register
function insertChunk(el, chunk) {
  el.focus();
  if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
    // use the native setter so React/Lexical value tracking sees the change
    const proto =
      el.tagName === "TEXTAREA"
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(el, el.value + chunk);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  } else {
    // contenteditable rich editor — execCommand fires the proper beforeinput/input events
    const ok = document.execCommand("insertText", false, chunk);
    if (!ok) {
      // last-resort fallback for editors that block execCommand
      el.dispatchEvent(
        new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          inputType: "insertText",
          data: chunk,
        })
      );
      el.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          inputType: "insertText",
          data: chunk,
        })
      );
    }
  }
}

// put the caret at the end of a contenteditable so we append, not prepend
function caretToEnd(el) {
  try {
    const root = el.getRootNode();
    const sel = root.getSelection ? root.getSelection() : window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {
    /* best effort */
  }
}

async function typeText(text, delayMs) {
  const el = findEditable();
  if (!el) return { ok: false, error: "no reddit text box found — click into the comment/post box first" };

  el.focus();
  if (el.isContentEditable) caretToEnd(el);

  // split into words but keep the trailing spaces so it reads naturally
  const tokens = text.match(/\S+\s*/g) || [text];
  for (const tok of tokens) {
    insertChunk(el, tok);
    await sleep(delayMs);
  }
  return { ok: true };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "TYPE_TEXT") {
    typeText(msg.text, msg.delayMs ?? 45).then(sendResponse);
    return true; // async response
  }
});
