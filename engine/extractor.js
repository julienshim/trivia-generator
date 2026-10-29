// Extraction strategies. Each returns a flat map { field: string[] } (a
// field may be a single string when the profile needs it unsplit, e.g.
// Wikipedia's "Based on"). A genuinely new DOM shape = a new strategy here.

var TG = (globalThis.TG = globalThis.TG || {}); // var, not const: content scripts share one global lexical scope

// innerText approximation that works in both the page and jsdom: block-level
// elements introduce line breaks, inline whitespace runs collapse to single
// spaces, <br> becomes a newline, script/style contribute no text, lines are
// trimmed, blank lines dropped. The v1 golden baselines in test/golden/
// were captured with an identical implementation of this algorithm.
// (A plain textContent-based approximation breaks imdb parsing:
// the old IMDb layout puts each `Key:` label in an inline <h4 class="inline">
// whose source-newline separators must render as spaces, not line breaks.)
const BLOCK_TAGS = new Set([
  "address", "article", "aside", "blockquote", "details", "dd", "div",
  "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form",
  "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main",
  "nav", "ol", "p", "pre", "section", "summary", "table", "tbody",
  "td", "tfoot", "th", "thead", "tr", "ul",
]);

TG.innerLike = (el) => {
  const parts = [];
  const walk = (node) => {
    if (node.nodeType === 3) {
      parts.push(node.nodeValue);
    } else if (node.nodeType === 1) {
      const tag = node.tagName.toLowerCase();
      if (tag === "script" || tag === "style") return;
      if (tag === "br") {
        parts.push("\u0000");
        return;
      }
      const inline = !BLOCK_TAGS.has(tag) || node.classList.contains("inline");
      if (!inline) parts.push("\u0000");
      node.childNodes.forEach(walk);
      if (!inline) parts.push("\u0000");
    }
  };
  walk(el);
  return parts
    .join("")
    .replace(/[ \t\r\n\f\v]+/g, " ")
    .replace(/\u0000/g, "\n")
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s !== "")
    .join("\n");
};

function infobox(page, { root, split, unsplitKeys = [] }) {
  const first = page.querySelector(`${root} > tbody > tr:nth-child(1)`);
  if (!first) throw new Error(`Couldn't find the ${root} on this page.`);
  const data = {};
  let el = first;
  while (el !== null) {
    if (el.childElementCount === 2) {
      const key = TG.innerLike(el.children[0])
        .replace(/\(([a-z ]){1,}\)/gi, "")
        .replace(/\s+/g, " ")
        .trim();
      const value = TG.innerLike(el.children[1]).replace(/\[\d{1,3}\]/gi, "");
      data[key] = unsplitKeys.includes(key) ? value : value.split(split);
    }
    el = el.nextElementSibling;
  }
  return data;
}

function detailRows(page, { root, split = " | " }) {
  const rootEl = page.querySelector(root);
  if (!rootEl) throw new Error(`Couldn't find ${root} on this page.`);
  const data = {};
  rootEl.querySelectorAll("tr").forEach((row) => {
    if (row.childElementCount === 2) {
      const key = row.children[0].textContent.replace(/\s+/g, " ").trim();
      const value = row.children[1].textContent.replace(/\s+/g, " ").trim();
      data[key] = value.split(split);
    }
  });
  return data;
}

TG.extractWith = (strategy, page, opts) => {
  const strategies = { infobox, detailRows };
  const fn = strategies[strategy];
  if (!fn) throw new Error(`Unknown extraction strategy: ${strategy}`);
  return fn(page, opts);
};
