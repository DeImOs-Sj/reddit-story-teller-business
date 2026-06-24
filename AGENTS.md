# Reddit Story Writer

Manifest V3 Chrome extension that generates Reddit **and X (twitter)** marketing content (posts + replies) in a casual, mostly-lowercase, self-deprecating personal-story voice, then types it into the site's editor character-by-character.

## Architecture

| File | Role |
|------|------|
| `manifest.json` | MV3 manifest. Permissions: `storage`, `activeTab`, `scripting`. Host perms: NVIDIA API + `*.reddit.com` + `*.x.com` + `*.twitter.com`. Injects `content.js` on all three (all_frames). |
| `lib.js` | **All generation logic, DOM-free.** UMD module → `window.SPW` in the popup, `require`/`import` in tests. Prompts, `buildMessages(cfg)`, `buildPayload(cfg)`, `parseOutput`, `clean`, `looksDegenerate`, length presets. This is where prompt fixes go. |
| `popup.html` / `styles.css` | Popup UI. Dark theme. Three tabs (post / reply / x), post-style + tone + hook + **answer-length** selects, stealth checkbox, result card with title/body + typing-speed slider. |
| `popup.js` | UI wiring + state only. Gathers a cfg, calls `SPW.buildPayload`, NVIDIA fetch (AbortController), **retry-on-degenerate loop**, `chrome.storage.local` persistence, sends `TYPE_TEXT`. |
| `content.js` | Content script (reddit + x). Finds the editor (pierces open shadow DOM — reddit composer = Lexical contenteditable in `<shreddit-composer>`), types **char-by-char** via `execCommand('insertText')`, newlines via `insertParagraph`. |
| `test/` | `lib.test.mjs` (offline unit, `node:test`), `eval.mjs` (live model eval), `README.md`. See `package.json` scripts. |

## Key facts

- **LLM:** NVIDIA OpenAI-compatible chat completions. Model `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`. `enable_thinking:false` via `chat_template_kwargs`, temp 0.6 / top_p 0.95. **No frequency/presence penalties — they make this nano model degenerate.** Key hardcoded in `popup.js` (personal use — rotate before sharing; extractable from bundle).
- **Modes:** post (topic/product), reply (the comment), **x** (x-kind = reply-to-tweet or post-from-idea). Reddit reply defaults to genuine no-promo; promo opt-in (`#comment-promo`). X-post reuses the product textarea (as idea brief); X-reply reuses the comment textarea (as the tweet).
- **Post styles:** `story` (uses few-shot example), `hottake`, `question`, `update` (these 3 DROP the few-shot and ground on the user's actual input).
- **Anti-hallucination:** `GROUNDING` block is prepended to EVERY system prompt ("only use facts the user gave; never invent; never reuse the example's AEO/vps/$5/etc"). The few-shot is explicitly framed "STYLE EXAMPLE ONLY". This killed the AEO-template-copy bug.
- **Garbage guard:** the model intermittently spirals into CJK soup / repetition loops. `SPW.looksDegenerate()` detects it (non-ascii ratio, unique-word ratio, repeated 3-grams); popup retries up to 3× before showing it.
- **Reply tones:** neutral / supportive / professional / darkhumor / disagree / ragebait (apply to reddit replies + X replies).
- **Answer length:** `short`/`medium`/`long`/`max` → max_tokens 220/512/900/2048, plus an injected length line.
- **Typing:** speed slider = **chars/sec (1 slow … 10 fast)**, default 1 → `1000/cps` ms per char. If content script missing (stale tab), popup auto-injects via `chrome.scripting` then retries.
- **Stealth mode:** strips links/offers to dodge subreddit self-promo auto-mods. Account-level removals (shadowban/new-account/velocity) are NOT fixable in-app.

## Workflow

- Prompt/logic changes go in `lib.js`. Then `npm run test:all` (offline: syntax + unit). `npm run test:eval` hits the live model (the real hallucination/garbage regression guard).
- After any change, reload extension at `chrome://extensions` (↻) AND refresh the reddit/x tab.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **reddit-story-teller-business** (128 symbols, 236 relationships, 11 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/reddit-story-teller-business/context` | Codebase overview, check index freshness |
| `gitnexus://repo/reddit-story-teller-business/clusters` | All functional areas |
| `gitnexus://repo/reddit-story-teller-business/processes` | All execution flows |
| `gitnexus://repo/reddit-story-teller-business/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
