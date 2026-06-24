// live end-to-end eval — actually calls the NVIDIA model and asserts the output
// is grounded (no hallucinated example facts), formatted right, and on-length.
// run: npm run test:eval        (needs network; key from env or the bundled one)
//
// this is the regression guard for the "it hallucinates / reuses the AEO story"
// bug: every case feeds a product UNRELATED to the example and fails if the model
// leaks the example's specifics (AEO, vps, $5, 12 visitors, 75$).
import SPW from "../lib.js";

const KEY =
  process.env.NVIDIA_API_KEY ||
  "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";

// phrases from the style example that must NEVER appear unless the user typed them
const LEAK = [/\baeo\b/i, /\bgeo\b/i, /\bvps\b/i, /\$5\b/, /12 visitors/i, /75\$|\$75/];
const LINK = /(https?:\/\/|www\.|\.com\b|\.io\b|@[a-z0-9_]{2,})/i;

// mirror the popup pipeline: retry on degenerate output, up to 3 tries
async function call(cfg) {
  let text = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(SPW.ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify(SPW.buildPayload(cfg)),
    });
    if (!res.ok) throw new Error(`api ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    text = SPW.clean(data?.choices?.[0]?.message?.content || "");
    const titleOk = !SPW.expectsTitle(cfg) || !!SPW.parseOutput(text).title;
    if (text && !SPW.looksDegenerate(text) && titleOk) break;
  }
  return text;
}

// each case: a config + a list of [name, predicate] checks on the raw + parsed output
const CASES = [
  {
    name: "post / hot-take (the bug report case)",
    cfg: { mode: "post", postStyle: "hottake", length: "medium", stealth: true,
      product: "recently built a product related to scheduling for dentists, 1k users in a week but zero revenue. is that good or bad?" },
    checks: [
      ["has TITLE", (raw, p) => !!p.title],
      ["body non-empty", (raw, p) => p.body.length > 40],
      ["no example leak (AEO/vps/$5...)", (raw) => !LEAK.some((r) => r.test(raw))],
      ["mentions the real topic (dentist/scheduling/users)", (raw) => /dentist|schedul|user|revenue/i.test(raw)],
      ["no links/@handles", (raw, p) => !LINK.test(p.body)],
    ],
  },
  {
    name: "post / story hook",
    cfg: { mode: "post", postStyle: "story", hook: "launch", length: "medium", stealth: false,
      product: "a tiny chrome extension that batches your browser tabs into saved groups, free, vs paid tab managers" },
    checks: [
      ["has TITLE", (raw, p) => !!p.title],
      ["no example leak", (raw) => !LEAK.some((r) => r.test(raw))],
      ["grounded in tabs/extension", (raw) => /tab|extension|browser|group/i.test(raw)],
      ["no links", (raw, p) => !LINK.test(p.body)],
    ],
  },
  {
    name: "reply / plain (no promo)",
    cfg: { mode: "comment", length: "short", tone: "supportive",
      comment: "i've been grinding on my startup for 8 months and still no traction, kind of losing motivation tbh" },
    checks: [
      ["no TITLE line", (raw, p) => !p.title],
      ["no product / promo leak", (raw) => !/\bi built\b|\bi made\b|my tool|my app|my product/i.test(raw)],
      ["no links", (raw) => !LINK.test(raw)],
      ["reasonably short", (raw) => raw.length < 700],
    ],
  },
  {
    name: "x / reply",
    cfg: { mode: "x", xKind: "reply", length: "short", tone: "disagree",
      tweet: "hot take: every startup should raise vc money asap, bootstrapping is just romanticized struggle" },
    checks: [
      ["no TITLE", (raw, p) => !p.title],
      ["engages the topic (vc/bootstrap/raise)", (raw) => /vc|bootstrap|raise|fund/i.test(raw)],
      ["tweet-ish length", (raw) => raw.length < 500],
    ],
  },
  {
    name: "x / post from idea",
    cfg: { mode: "x", xKind: "post", length: "short",
      idea: "an idea: a tiny app that turns your voice notes into structured meeting minutes automatically" },
    checks: [
      ["no example leak", (raw) => !LEAK.some((r) => r.test(raw))],
      ["grounded in the idea (voice/notes/meeting)", (raw) => /voice|note|meeting|minute|transcri/i.test(raw)],
      ["not absurdly long", (raw) => raw.length < 900],
    ],
  },
  {
    name: "karma / reddit post (no promo, upvote-first)",
    cfg: { mode: "post", karma: true, length: "medium",
      product: "everyone says hustle culture is dead but i still feel guilty taking a weekend off" },
    checks: [
      ["has TITLE", (raw, p) => !!p.title],
      ["no promo / product leak", (raw) => !/\bi built\b|\bi made\b|my tool|my app|my product|dm me/i.test(raw)],
      ["no links", (raw, p) => !LINK.test(p.body)],
      ["grounded in the topic (hustle/weekend/guilt)", (raw) => /hustle|weekend|guilt|rest|burnout|off/i.test(raw)],
    ],
  },
  {
    name: "karma / x reply (likeable, no promo)",
    cfg: { mode: "x", xKind: "reply", karma: true, length: "short",
      tweet: "unpopular opinion: most productivity apps just make you spend time organizing instead of doing" },
    checks: [
      ["no TITLE", (raw, p) => !p.title],
      ["no promo", (raw) => !/\bi built\b|my app|my tool|dm me/i.test(raw)],
      ["engages topic (productivity/app/organiz)", (raw) => /productiv|app|organiz|tool|doing/i.test(raw)],
      ["tweet-ish length", (raw) => raw.length < 500],
    ],
  },
  {
    name: "length / short stays short",
    cfg: { mode: "post", postStyle: "question", length: "short",
      product: "should i charge monthly or one-time for a small productivity app, no idea what's normal" },
    checks: [
      ["short body", (raw, p) => p.body.length < 600],
      ["no example leak", (raw) => !LEAK.some((r) => r.test(raw))],
    ],
  },
];

let passed = 0, failed = 0;

for (const c of CASES) {
  process.stdout.write(`\n● ${c.name}\n`);
  let raw;
  try {
    raw = await call(c.cfg);
  } catch (e) {
    console.log(`  ✗ API CALL FAILED: ${e.message}`);
    failed += c.checks.length;
    continue;
  }
  const parsed = SPW.parseOutput(raw);
  // universal guard: every case must come back coherent, not garbage
  const allChecks = [["coherent (not degenerate garbage)", (r) => !SPW.looksDegenerate(r)], ...c.checks];
  for (const [label, fn] of allChecks) {
    let ok = false;
    try { ok = !!fn(raw, parsed); } catch { ok = false; }
    if (ok) { passed++; console.log(`  ✓ ${label}`); }
    else { failed++; console.log(`  ✗ ${label}`); }
  }
  console.log(`  ── output ─────────────────────────────`);
  console.log("  " + raw.replace(/\n/g, "\n  "));
}

console.log(`\n${"=".repeat(44)}`);
console.log(`eval: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
