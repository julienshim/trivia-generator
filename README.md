# Trivia Generator

[![test](https://github.com/julienshim/trivia-generator/actions/workflows/ci.yml/badge.svg)](https://github.com/julienshim/trivia-generator/actions/workflows/ci.yml)

A framework for turning structured page data into trivia Q&A. Works in
Chrome and Firefox (Web Extensions, MV3).

Give it a **profile** — a small file that declares which fields a site's
pages contain and how to phrase a question and answer for each one — and
clicking the extension button on a matching page converts the page's data
into Q&A rows (question, answer, source), printed to the DevTools console
as tab-separated values (and copied to your clipboard when the browser
allows — a console line tells you either way), ready to paste into a
spreadsheet.

## How it works

1. **Extract** — the engine pulls the page's structured data using an
   extraction strategy, or a profile-provided function for messier layouts.
2. **Context** — the profile derives the title, media type, year, and tense
   from the page.
3. **Render** — each field the profile lists gets a question and an answer
   built from its recipe (a template, or a small function where a template
   can't express the logic).
4. **Output** — the rows go to the console and the clipboard.

Supporting a new site means writing one new profile file. No engine changes
are needed as long as the site's data fits an existing extraction strategy.

## Sample profiles

| Profile | Status |
|---|---|
| `profiles/wikipedia.js` | Working — film and TV series articles |
| `profiles/imdb.js` | Experimental — its selectors predate IMDb's 2024 redesign |

These profiles are **samples of the profile format**, not the scope of the
project. Any site with structured data can become a profile.

## Install

This is a Manifest V3 Web Extension; it loads in current Chrome and current
Firefox.

### Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.
4. Pin the extension.

### Firefox

1. Open `about:debugging`.
2. Select **This Firefox**.
3. Click **Load Temporary Add-on…** and pick this folder's `manifest.json`.
4. Note: temporary add-ons unload when Firefox restarts — reload it each
   session.

## Usage

1. Visit a page matched by a profile, e.g. a Wikipedia film article.
2. Open DevTools (Cmd+Option+J on Mac, Ctrl+Shift+J elsewhere).
3. Click the extension icon.
4. Read the Q&A rows in the console. The line below them says whether the
   clipboard copy succeeded.

## Writing a profile

Copy `profiles/wikipedia.js` — it is the canonical example — and adapt:

| Key | Meaning |
|---|---|
| `id` | Profile name (for debugging). |
| `match` | URL prefix this profile serves, e.g. `https://example.com/*`. |
| `experimental` | `true` while the profile's selectors are unverified. |
| `extract` | `{ strategy, root, split }` for a known DOM shape, or a function `(page, url) => ({ field: [values] })`. |
| `present` | How to decide present vs past tense: `{ fields, token }`, `{ fields, pattern }`, or a function `(key, values, ctx) => boolean`. |
| `context` | Function `(page, data, url) => ({ title, type, year, fullTitle, possessive })`. Throw a readable error when the page isn't the expected kind. |
| `answerJoin` | Join style for `{{answer}}`: `"join"` (Oxford) or `"andJoin"`. |
| `transforms` | Profile-local named transforms for templates. |
| `fields` | The recipes: per field, a `question` and `answer` (template or function) and an optional `source` template. Only listed fields produce output. |

Templates support `{{fullTitle}}`, `{{type}}`, `{{title}}`, `{{year}}`,
`{{possessive}}`, `{{source}}`, `{{answer}}`, `{{tense:word}}` (`is`,
`stars`, `directs`, `composes`), and `{{name}}` / `{{name:var}}` for
built-in (`cap`, `lower`, `strip`, `join`, `andJoin`) and profile-local
transforms.

## Engine internals

- `engine/transforms.js` — the transform registry and built-ins.
- `engine/templates.js` — the template renderer and tense map.
- `engine/extractor.js` — the extraction strategies (`infobox`,
  `detailRows`). A genuinely new DOM shape is the one case where a new
  strategy belongs here.
- `engine/content.js` — the message listener and pipeline.

## Development

```
npm install
npm test
```

Tests run with `node --test`. `test/fixtures/` holds recorded page HTML and
`test/golden/` holds the exact output this project's original version
produced on those pages — the end-to-end tests assert the current profiles
match them byte for byte.

## Why

Trivia questions for a media annotation workflow used to be written by
hand; this project was the tool that automated that step. Publishing it as
a framework (engine + profiles) keeps the reusable part reusable.
