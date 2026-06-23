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

// remember whatever editable the user last clicked into
document.addEventListener(
  "focusin",
  (e) => {
    if (isEditable(e.target)) lastEditable = e.target;
  },
  true
);

// fallback: find a reddit comment/post box if we never saw a focus
function findEditable() {
  if (lastEditable && document.contains(lastEditable)) return lastEditable;
  const sel =
    'textarea, div[contenteditable="true"], [role="textbox"][contenteditable="true"]';
  const candidates = Array.from(document.querySelectorAll(sel)).filter(
    (el) => el.offsetParent !== null // visible
  );
  return candidates[candidates.length - 1] || null;
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

async function typeText(text, delayMs) {
  const el = findEditable();
  if (!el) return { ok: false, error: "no reddit text box found — click into the comment/post box first" };

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
