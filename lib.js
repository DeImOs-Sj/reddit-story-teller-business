// lib.js — pure generation logic, no DOM, no chrome APIs.
// Loaded as a classic <script> in the popup (exposes window.SPW) and
// imported by the node test pipeline (module.exports). Keep it side-effect free.

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SPW = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------- api config ----------
  const MODEL = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";
  const ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions";

  // ---------- anti-hallucination spine ----------
  // prepended to every system prompt. this is the fix for the "it invents an AEO
  // story / reuses the $5 vps example" behaviour: the model must only use facts the
  // user actually gave, and must never copy the style example's specifics.
  const GROUNDING = `GROUNDING — non-negotiable, overrides everything else:
- build the output ONLY from the facts the user gives you in their input. use their real topic, product, situation, and numbers.
- NEVER invent specific facts the user didn't provide: no made-up company names, dollar amounts, visitor counts, dates, percentages, tools, or events. if a detail isn't in their input, stay vague instead of fabricating one.
- if an EXAMPLE is shown to you, it is ONLY to demonstrate voice and shape. do NOT reuse its topic, its product, its numbers, or its phrases. in particular never mention "AEO", "vps", "$5", "12 visitors", "75$" or anything from an example unless the user themselves brought it up.
- if the user's input is thin, write a shorter, vaguer piece — do not pad it with invented specifics.

`;

  // ---------- reddit: story hook ----------
  const SYSTEM_PROMPT = GROUNDING + `you write HOOK posts and comment replies for reddit-style communities. these are NOT sales posts. you are NOT pitching or selling anything. you tell a genuine personal-experience story and end with a question that baits the community to engage. the product only ever shows up as a casual aside inside your own story — never as something you're offering.

hard rules:
- you are just a person venting about a problem you hit and what you ended up doing about it. the thing you built is mentioned offhand, like "so i ended up hacking together my own little thing" — never hyped, never named like a brand, never described feature-by-feature. one quick casual mention, that's it.
- NEVER sell. NO call-to-action, NO "try it", NO "dm me", NO "link below", NO "check it out". those are banned.
- NEVER include any link, url, website, or @handle. ever. subreddits ban links.
- the ENDING is the hook — a real-sounding question that pulls replies. use the one the user asks for.
- downplay everything. self-deprecating, unsure, genuine. read like a real curious person, never a marketer.

the story shape, ONE flowing block of prose (not chopped lines, not a list):
1. open from the user's real situation: "last time when i was working with / trying to [their situation] i was dealing with [their specific problem]". use THEIR details.
2. mention how existing tools/options overcharge or fall short, casually — only if the user implied it.
3. slip in, almost as an aside, the thing they built/found that fixed it.
4. end on the chosen hook question. a real question, never a pitch.

VOICE:
- casual, like thinking out loud or texting a friend
- mostly lowercase, light punctuation, run-ons and comma splices are the natural rhythm
- self-deprecating, honest, a little unsure
- business-minded, talk real cost when relevant
- natural filler (just, actually, honestly, as well) and real contractions
- flowing prose, not chopped lines or a list

OUTPUT FORMAT (follow exactly):
- for a FRESH POST: line 1 is "TITLE: <short scroll-stopping lowercase title, no clickbait caps>", then a REAL line break (the title must be on its own line), then a blank line, then the post body. the title is one short line — do NOT run it into the body.
- for a COMMENT REPLY: NO title line. just the reply body.
- no quotes, no extra labels, no markdown, no line-break lists.`;

  // style-only few-shot. NOTE the explicit do-not-copy framing in the user turn.
  const FEWSHOT_USER = `[STYLE EXAMPLE ONLY — do not reuse this topic, product, or numbers] here is the VOICE and SHAPE i want, written for a totally different product than mine:

example product: "a cheap diy tool that fixed a problem for way less than the competitors charged."`;

  const FEWSHOT_ASSISTANT = `TITLE: paying way too much to barely move the needle, finally just built my own thing

last time when i was trying to fix this i was paying for a tool that barely did anything, and honestly it felt like throwing money down a drain. i looked at the other options and they either wanted a subscription for features i didnt need or charged per use like it was some luxury service, which made no sense for a small operation where every dollar counts. then i kind of just hacked together my own little thing and now it does the job for almost nothing, no fuss, no hidden fees. honestly ive been wondering if i should clean it up and put it online so other people could use it too — would anyone here actually be interested in something like that, or do you all already have some cheap setup that works?`;

  const HOOK_INSTRUCTIONS = {
    auto: "ending hook: pick whichever fits — ask for cheaper alternatives, or float making it live.",
    alts: "ending hook: ask the room for cheaper alternatives like you're still looking.",
    launch: "ending hook: float making it live and ask if anyone'd be interested.",
  };

  // ---------- reddit: non-story post styles (no few-shot) ----------
  const POST_FOOTER = `
VOICE: casual, mostly lowercase, light punctuation, run-ons and comma splices fine, self-deprecating, honest, plain opinions, real contractions, natural filler used sparingly, flowing prose NOT lists.
HARD BANS: never include any link, url, website, or @handle. never hard-sell or use a call-to-action. no markdown.
OUTPUT (follow exactly): line 1 is "TITLE: <short scroll-stopping lowercase title, no clickbait caps>" on its OWN line, then a blank line, then the body. do not run the title into the body. nothing else — no quotes, no labels, no markdown, no line-break lists.`;

  const POST_STYLE_PROMPTS = {
    hottake:
      GROUNDING +
      `you write a punchy HOT-TAKE reddit post in a real person's casual voice, built from the topic the user gives you. state a clear opinion or pose a provocative question and invite the community to weigh in. NOT hard-selling.
- lead with the take or the question right away, specific to the user's actual situation and numbers.
- if they mention a product/situation, frame it casually as context, not a pitch.
- back the take with a sentence or two of real reasoning.
- end by genuinely asking the community what they think.${POST_FOOTER}`,

    question:
      GROUNDING +
      `you write a sincere QUESTION / ADVICE reddit post in a real person's casual voice, built from what the user gives you. genuinely asking the community — not selling.
- get to the real question fast, grounded in the user's actual situation and numbers.
- give just enough context so the question makes sense, mentioned plainly, never pitched.
- end with the clear question(s) you want answered.${POST_FOOTER}`,

    update:
      GROUNDING +
      `you write a humble BUILD-IN-PUBLIC update reddit post in a real person's casual voice, built from what the user gives you. share progress or a milestone honestly and invite feedback — not a sales pitch.
- center the real numbers/result they give and what actually happened.
- be honest about what's working AND what isn't.
- end by asking the community for feedback or their take.${POST_FOOTER}`,
  };

  const STEALTH_RULES = `

STEALTH MODE — strict subreddit that auto-removes self-promo. these OVERRIDE the hook instruction:
- you are NOT offering, sharing, launching, or recruiting testers for anything. no "test it", "would anyone be interested", "i could put it online", "dm me". all banned — they trip the filter.
- the thing you built stays purely INSIDE your past story as something you already did for yourself. mention it once, plainly, move on.
- no brand name, no product name, no links, no urls, no "@".
- the ENDING must be a genuine ADVICE question to the room about the PROBLEM or METHOD — never about your thing.
- read like a normal person asking for help, zero promo energy.`;

  // ---------- reddit: plain comment reply ----------
  const REPLY_PROMPT = GROUNDING + `you write a genuine reddit comment reply in a real person's casual voice. you are NOT selling or promoting anything. you do NOT have a product. just react like a normal human in the thread.

what to do:
- actually respond to what the comment says — agree or push back, add a thought or a small relevant experience, ask a follow-up, or give a useful honest take. engage with its real content.
- it's fine to be short. a real comment is often 2-4 sentences. don't pad it.

VOICE: casual, mostly lowercase, light punctuation, run-ons fine, self-deprecating, honest, plain opinions, real contractions, natural filler (just, honestly, tbh, ngl) used sparingly, flowing prose not lists.

HARD BANS:
- NEVER mention, hint at, or promote any product, tool, app, service, or thing you built. zero self-promo.
- no links, no urls, no "@", no brand names.
- no title line. output ONLY the reply text — no quotes, no labels, no markdown.`;

  // ---------- x / twitter ----------
  const X_VOICE = `VOICE: casual, mostly lowercase, punchy, light punctuation. sound like a real person, not a brand account. no hashtags spam (one at most, usually zero), no "thread 🧵" theatrics, no emoji unless it genuinely fits. real contractions, plain opinions.`;

  const X_REPLY_PROMPT = GROUNDING + `you write a reply to a tweet/post on X (twitter), in a real person's casual voice. you are reacting to the tweet you're given — agree, push back, add a sharp thought, or ask something. NOT selling.
- keep it tight: one tweet, ideally under ~280 characters. punchy beats long.
- engage with the ACTUAL content of the tweet, don't be generic.
- no links, no @handles you make up, no hashtag spam.
${X_VOICE}
OUTPUT: just the reply text. no title, no quotes, no labels, no markdown.`;

  const X_POST_PROMPT = GROUNDING + `you write one original X (twitter) post from the idea brief the user gives you. you're sharing the idea so people stop and engage. NOT a hard sell.
- write a single strong tweet (a couple of sentences). open with something that earns the scroll-stop, built from the user's actual idea.
- ground it entirely in the user's idea — no invented metrics or names.
- end with something that invites replies (a question or a take to argue with), unless that feels forced.
- no link spam, no hashtag spam.
${X_VOICE}
OUTPUT: just the tweet text as plain prose. no numbered points, no "line 1 / point 1" structure, no title, no quotes, no labels, no markdown.`;

  // ---------- tone overlays (replies + x replies) ----------
  const TONE_INSTRUCTIONS = {
    neutral: "",
    supportive:
      "TONE: supportive and warm. validate where they're coming from, be encouraging, add a genuinely helpful thought. empathetic, not fake-positive.",
    professional:
      "TONE: professional and measured. clear, polite, composed. still human, but drop the heavy slang and keep it level-headed and credible.",
    darkhumor:
      "TONE: dark, dry humor. deadpan, a little sarcastic, gallows-humor and self-deprecating jabs welcome — but stay on-topic and never punch down. no slurs, no harassment, no cruelty toward the person.",
    disagree:
      "TONE: respectful disagreement. push back with a real counter-argument, say why you see it differently. firm but not rude — disagree with the idea, not the person.",
    ragebait:
      "TONE: spicy and provocative. take a bold contrarian stance designed to make people argue back. confident, a little smug. stay within bounds: no slurs, no hate, no personal attacks — provoke with opinions, not abuse.",
  };

  // ---------- output length presets ----------
  // max_tokens caps the response; the line is injected so the model actually aims short/long.
  const LENGTH_PRESETS = {
    short: { max_tokens: 220, line: "LENGTH: keep it SHORT — a few sentences / one tight paragraph. no padding." },
    medium: { max_tokens: 512, line: "LENGTH: a normal length — 1 to 2 short paragraphs." },
    long: { max_tokens: 900, line: "LENGTH: you can go longer — up to 2 to 3 paragraphs if it genuinely helps, still tight." },
    max: { max_tokens: 2048, line: "LENGTH: write as much as the content needs, but never pad with filler." },
  };
  const DEFAULT_LENGTH = "medium";

  function lengthFor(key) {
    return LENGTH_PRESETS[key] || LENGTH_PRESETS[DEFAULT_LENGTH];
  }

  // ---------- message building (pure) ----------
  // cfg: { mode, product, comment, idea, tweet, postStyle, hook, stealth,
  //        tone, commentPromo, xKind, length }
  function buildMessages(cfg) {
    cfg = cfg || {};
    const product = (cfg.product || "").trim();
    const comment = (cfg.comment || "").trim();
    const idea = (cfg.idea || "").trim();
    const tweet = (cfg.tweet || "").trim();
    const hook = HOOK_INSTRUCTIONS[cfg.hook] || HOOK_INSTRUCTIONS.auto;
    const stealth = cfg.stealth ? STEALTH_RULES : "";
    const tone = TONE_INSTRUCTIONS[cfg.tone] || "";
    const toneLine = tone ? `\n\n${tone}` : "";
    const lenLine = `\n\n${lengthFor(cfg.length).line}`;

    // ----- X / twitter -----
    if (cfg.mode === "x") {
      if (cfg.xKind === "post") {
        return [
          { role: "system", content: X_POST_PROMPT },
          { role: "user", content: `write an X post from my idea.${toneLine}${lenLine}

my idea brief:
"""${idea}"""` },
        ];
      }
      // default x = reply
      return [
        { role: "system", content: X_REPLY_PROMPT },
        { role: "user", content: `reply to this tweet.${toneLine}${lenLine}

the tweet i'm replying to:
"""${tweet}"""` },
      ];
    }

    // ----- reddit plain reply (no promo) -----
    if (cfg.mode === "comment" && !cfg.commentPromo) {
      return [
        { role: "system", content: REPLY_PROMPT },
        { role: "user", content: `reply to this reddit comment in a genuine casual human voice. just react, no promotion, no product, no links.${toneLine}${lenLine}

the comment i'm replying to:
"""${comment}"""` },
      ];
    }

    // ----- reddit promo reply (story style, few-shot) -----
    if (cfg.mode === "comment") {
      return [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: FEWSHOT_USER },
        { role: "assistant", content: FEWSHOT_ASSISTANT },
        { role: "user", content: `i'm replying to a comment in a thread. reply in the storytelling hook style, weaving in MY story (below), not the example's. ${hook}${stealth}${toneLine}${lenLine}

the comment i'm replying to:
"""${comment}"""

my product / context:
"""${product}"""` },
      ];
    }

    // ----- reddit non-story post styles (no few-shot) -----
    const style = cfg.postStyle;
    if (style && style !== "story" && POST_STYLE_PROMPTS[style]) {
      const label = style === "hottake" ? "hot-take" : style;
      return [
        { role: "system", content: POST_STYLE_PROMPTS[style] },
        { role: "user", content: `write a ${label} reddit post from this.${stealth}${lenLine}

my topic / situation / numbers:
"""${product}"""` },
      ];
    }

    // ----- reddit story post (few-shot) -----
    return [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: FEWSHOT_USER },
      { role: "assistant", content: FEWSHOT_ASSISTANT },
      { role: "user", content: `write a fresh hook post in the storytelling style, built entirely from MY product below (NOT the example). ${hook}${stealth}${lenLine}

my product / what to write about:
"""${product}"""` },
    ];
  }

  // payload for the chat completions endpoint.
  // NOTE: this small nano model degenerates badly with frequency/presence penalties
  // (it spirals into token-soup / CJK garbage), so we keep plain sampling and instead
  // detect garbage after the fact (looksDegenerate) and retry — see the popup.
  function buildPayload(cfg) {
    return {
      model: MODEL,
      messages: buildMessages(cfg),
      temperature: 0.6,
      top_p: 0.95,
      max_tokens: lengthFor(cfg && cfg.length).max_tokens,
      stream: false,
      chat_template_kwargs: { enable_thinking: false },
    };
  }

  // ---------- degeneration / garbage detector ----------
  // this small model intermittently produces garbage: CJK token-soup, repeated
  // n-grams ("is the 1st line of the 1st point..."), or low-diversity word salad.
  // returns true when the text looks broken, so callers can retry.
  function looksDegenerate(text) {
    const t = clean(text);
    if (t.length < 15) return true;

    const nonSpace = t.replace(/\s/g, "");
    // a lot of non-ascii (model drifted into CJK / symbol garbage)
    const nonAscii = (nonSpace.match(/[^\x00-\x7F]/g) || []).length;
    if (nonSpace.length && nonAscii / nonSpace.length > 0.15) return true;

    const words = t.toLowerCase().match(/[a-z0-9']+/g) || [];
    if (words.length >= 12) {
      // word salad: too few unique words for the length
      const uniqueRatio = new Set(words).size / words.length;
      if (uniqueRatio < 0.45) return true;

      // a repeated 3-gram is a dead giveaway of a repetition loop
      const grams = {};
      for (let i = 0; i + 2 < words.length; i++) {
        const g = words[i] + " " + words[i + 1] + " " + words[i + 2];
        grams[g] = (grams[g] || 0) + 1;
        if (grams[g] >= 4) return true;
      }
    }
    return false;
  }

  // ---------- output parsing ----------
  function clean(text) {
    return String(text || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  }

  function parseOutput(text) {
    const m = String(text || "").match(/^\s*TITLE:\s*(.+?)\s*\n([\s\S]*)$/i);
    if (m) return { title: m[1].trim(), body: m[2].trim() };
    return { title: "", body: String(text || "").trim() };
  }

  return {
    MODEL,
    ENDPOINT,
    HOOK_INSTRUCTIONS,
    TONE_INSTRUCTIONS,
    POST_STYLE_PROMPTS,
    LENGTH_PRESETS,
    DEFAULT_LENGTH,
    lengthFor,
    buildMessages,
    buildPayload,
    clean,
    parseOutput,
    looksDegenerate,
  };
});
