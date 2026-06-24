// offline unit tests for lib.js — pure logic, no network, no DOM.
// run: npm test   (node --test test/)
import test from "node:test";
import assert from "node:assert/strict";
import SPW from "../lib.js";

const sysOf = (msgs) => msgs.find((m) => m.role === "system").content;
const lastUser = (msgs) => [...msgs].reverse().find((m) => m.role === "user").content;

// ---------- the anti-hallucination guard ----------
// every system prompt MUST carry the grounding spine. this is the prompt-level
// guarantee that the model is told not to invent facts or copy the example.
test("every mode's system prompt carries the grounding/anti-invention rule", () => {
  const cfgs = [
    { mode: "post", postStyle: "story", product: "x" },
    { mode: "post", postStyle: "hottake", product: "x" },
    { mode: "post", postStyle: "question", product: "x" },
    { mode: "post", postStyle: "update", product: "x" },
    { mode: "comment", comment: "x" },
    { mode: "comment", comment: "x", commentPromo: true, product: "p" },
    { mode: "x", xKind: "reply", tweet: "x" },
    { mode: "x", xKind: "post", idea: "x" },
  ];
  for (const cfg of cfgs) {
    const sys = sysOf(SPW.buildMessages(cfg));
    assert.match(sys, /NEVER invent specific facts/i, `missing grounding for ${JSON.stringify(cfg)}`);
    assert.match(sys, /build the output ONLY from the facts the user gives/i);
  }
});

test("story post tells the model not to reuse the example's specifics", () => {
  const msgs = SPW.buildMessages({ mode: "post", postStyle: "story", product: "a saas thing" });
  // few-shot present: system, user(example), assistant(example), user(real)
  assert.equal(msgs.length, 4);
  assert.equal(msgs[1].role, "user");
  assert.equal(msgs[2].role, "assistant");
  assert.match(msgs[1].content, /STYLE EXAMPLE ONLY/i);
  assert.match(lastUser(msgs), /built entirely from MY product below \(NOT the example\)/i);
  assert.match(lastUser(msgs), /a saas thing/);
});

// ---------- mode routing ----------
test("non-story post styles drop the few-shot and use their own prompt", () => {
  const msgs = SPW.buildMessages({ mode: "post", postStyle: "hottake", product: "1k users no revenue" });
  assert.equal(msgs.length, 2); // system + user, no example turns
  assert.equal(sysOf(msgs), SPW.POST_STYLE_PROMPTS.hottake);
  assert.match(lastUser(msgs), /1k users no revenue/);
});

test("plain reply uses the no-promo prompt and never asks for a product", () => {
  const msgs = SPW.buildMessages({ mode: "comment", comment: "some comment" });
  assert.equal(msgs.length, 2);
  assert.match(sysOf(msgs), /NOT selling or promoting anything/i);
  assert.match(lastUser(msgs), /some comment/);
  assert.doesNotMatch(lastUser(msgs), /my product/i);
});

test("promo reply weaves in product + uses the few-shot", () => {
  const msgs = SPW.buildMessages({ mode: "comment", comment: "c", commentPromo: true, product: "my widget" });
  assert.equal(msgs.length, 4);
  assert.match(lastUser(msgs), /my widget/);
  assert.match(lastUser(msgs), /weaving in MY story/i);
});

test("x reply targets the tweet, no title, x-reply prompt", () => {
  const msgs = SPW.buildMessages({ mode: "x", xKind: "reply", tweet: "hot startup take" });
  assert.equal(msgs.length, 2);
  assert.match(sysOf(msgs), /reply to a tweet\/post on X/i);
  assert.match(lastUser(msgs), /hot startup take/);
});

test("x post builds from the idea brief", () => {
  const msgs = SPW.buildMessages({ mode: "x", xKind: "post", idea: "an app that does Y" });
  assert.equal(msgs.length, 2);
  assert.match(sysOf(msgs), /original X \(twitter\) post from the idea brief/i);
  assert.match(lastUser(msgs), /an app that does Y/);
});

// ---------- overlays ----------
test("tone overlay is injected for replies", () => {
  const msgs = SPW.buildMessages({ mode: "comment", comment: "c", tone: "ragebait" });
  assert.match(lastUser(msgs), /spicy and provocative/i);
});

test("stealth rules only appear when stealth is on", () => {
  const on = SPW.buildMessages({ mode: "post", postStyle: "story", product: "p", stealth: true });
  const off = SPW.buildMessages({ mode: "post", postStyle: "story", product: "p", stealth: false });
  assert.match(lastUser(on), /STEALTH MODE/i);
  assert.doesNotMatch(lastUser(off), /STEALTH MODE/i);
});

// ---------- length presets ----------
test("length presets map to the right max_tokens and inject a length line", () => {
  assert.equal(SPW.buildPayload({ mode: "post", product: "p", length: "short" }).max_tokens, 220);
  assert.equal(SPW.buildPayload({ mode: "post", product: "p", length: "medium" }).max_tokens, 512);
  assert.equal(SPW.buildPayload({ mode: "post", product: "p", length: "long" }).max_tokens, 900);
  assert.equal(SPW.buildPayload({ mode: "post", product: "p", length: "max" }).max_tokens, 2048);
  // unknown / missing falls back to default (medium)
  assert.equal(SPW.buildPayload({ mode: "post", product: "p" }).max_tokens, 512);
  assert.match(lastUser(SPW.buildMessages({ mode: "post", product: "p", length: "short" })), /keep it SHORT/i);
});

test("buildPayload disables thinking and sets the model", () => {
  const p = SPW.buildPayload({ mode: "post", product: "p" });
  assert.equal(p.model, SPW.MODEL);
  assert.equal(p.chat_template_kwargs.enable_thinking, false);
  assert.equal(p.stream, false);
});

// ---------- output parsing ----------
test("parseOutput splits a TITLE line from the body", () => {
  const { title, body } = SPW.parseOutput("TITLE: my title\n\nthe body here");
  assert.equal(title, "my title");
  assert.equal(body, "the body here");
});

test("parseOutput with no title returns the whole text as body", () => {
  const { title, body } = SPW.parseOutput("just a reply, no title");
  assert.equal(title, "");
  assert.equal(body, "just a reply, no title");
});

test("clean strips <think> reasoning blocks", () => {
  assert.equal(SPW.clean("<think>secret reasoning</think>real output"), "real output");
  assert.equal(SPW.clean("  plain  "), "plain");
});

// ---------- degeneration detector (the "shitty output" guard) ----------
test("looksDegenerate flags the real garbage we saw from the model", () => {
  // CJK / symbol soup
  assert.equal(SPW.looksDegenerate("**_表格：- 图片内容：婴儿童洗护理念浴洁容器 12 500 万"), true);
  // repeated n-gram loop
  assert.equal(SPW.looksDegenerate("is the 1st line of the 1st point. is the 1st line of the 1st point. is the 1st line of the 1st point. is the 1st line of the 1st point."), true);
  // low-diversity word salad
  assert.equal(SPW.looksDegenerate("in over on in with and from on in from at on in with from and on in from"), true);
  // empty / too short
  assert.equal(SPW.looksDegenerate('"'), true);
  assert.equal(SPW.looksDegenerate(""), true);
});

test("looksDegenerate passes real, coherent output", () => {
  const good = "so i built this scheduling thing for dentists last month just to solve my own headache with double bookings, threw it together in a weekend, and somehow got 1k users in seven days with zero revenue. is this traction or total delusion? would love to hear if anyone's seen this before.";
  assert.equal(SPW.looksDegenerate(good), false);
  const shortReply = "totally get that feeling, 8 months is a long grind with no clear win. it's way more common than people admit honestly.";
  assert.equal(SPW.looksDegenerate(shortReply), false);
});
