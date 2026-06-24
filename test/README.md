# Test pipeline

All generation logic lives in `../lib.js` (DOM-free), so it can be tested without a browser.

| Command | What it does | Network |
|---------|--------------|---------|
| `npm run check` | `node --check` on lib.js / popup.js / content.js (syntax) | no |
| `npm test` | offline unit tests (`test/lib.test.mjs`) — message routing per mode, length presets, parsing, and the **degeneration detector** | no |
| `npm run test:all` | `check` + `test` (use this in CI) | no |
| `npm run test:eval` | **live end-to-end eval** — actually calls the NVIDIA model for every mode and asserts the output is coherent, grounded (no hallucinated example facts), correctly formatted, and on-length | **yes** |

## What the eval guards against

The two bugs this pipeline exists to catch:

1. **Hallucination** — the model reusing the AEO/$5-vps story example instead of the user's real input. `test/eval.mjs` feeds products unrelated to the example and fails if any example specifics (`AEO`, `vps`, `$5`, `12 visitors`, `75$`) leak.
2. **Garbage / "shitty output"** — this small nano model intermittently spirals into CJK token-soup or repetition loops. `SPW.looksDegenerate()` detects it; the popup (and the eval) **retry up to 3×** on degenerate output. Every eval case asserts the final result is coherent.

## Live eval setup

Key is read from `NVIDIA_API_KEY` env var, falling back to the bundled key. Run:

```bash
NVIDIA_API_KEY=nvapi-... npm run test:eval
```

Exit code is non-zero if any check fails.
