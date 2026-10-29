const { test } = require("node:test");
const assert = require("node:assert");
const { JSDOM } = require("jsdom");

function loadExtractor() {
  delete globalThis.TG;
  for (const f of Object.keys(require.cache)) {
    if (f.includes("/engine/")) delete require.cache[f];
  }
  require("../engine/transforms.js");
  require("../engine/extractor.js");
  return globalThis.TG;
}

function pageOf(html) {
  return new JSDOM(html).window.document;
}

const WIKI_TABLE = `
<table class="infobox">
  <tbody>
    <tr><th class="infobox-label">Director</th><td class="infobox-data">Christopher Nolan</td></tr>
    <tr><th class="infobox-label">Starring</th><td class="infobox-data"><a>Leonardo DiCaprio</a><br><a>Cillian Murphy</a></td></tr>
    <tr><th class="infobox-label">Budget (2010)</th><td class="infobox-data">$160 million [1]</td></tr>
    <tr><th class="infobox-label">Based on</th><td class="infobox-data">A 1999 novel by Frank Herbert</td></tr>
    <tr><th colspan="2">People</th></tr>
  </tbody>
</table>`;

test("infobox extracts two-cell rows in document order", () => {
  const TG = loadExtractor();
  const data = TG.extractWith("infobox", pageOf(WIKI_TABLE), {
    root: ".infobox",
    split: "\n",
    unsplitKeys: ["Based on"],
  });
  assert.deepStrictEqual(data["Director"], ["Christopher Nolan"]);
  assert.deepStrictEqual(data["Starring"], ["Leonardo DiCaprio", "Cillian Murphy"]);
  assert.strictEqual(data["Based on"], "A 1999 novel by Frank Herbert");
  assert.ok(!("People" in data));
});

test("infobox keeps digit-parenthetical keys and leaves citation-removal gaps", () => {
  const TG = loadExtractor();
  const data = TG.extractWith("infobox", pageOf(WIKI_TABLE), {
    root: ".infobox",
    split: "\n",
    unsplitKeys: ["Based on"],
  });
  // "(2010)" has digits, so v1's key cleaner leaves it alone.
  assert.deepStrictEqual(data["Budget (2010)"], ["$160 million "]);
});

test("infobox throws a readable error when the root is missing", () => {
  const TG = loadExtractor();
  assert.throws(
    () => TG.extractWith("infobox", pageOf("<p>nothing</p>"), { root: ".infobox", split: "\n" }),
    /Couldn't find the \.infobox on this page\./
  );
});

test("detailRows extracts two-cell rows split on the given delimiter", () => {
  const TG = loadExtractor();
  const data = TG.extractWith(
    "detailRows",
    pageOf(`
    <div id="facts">
      <table>
        <tr><td>Genre</td><td>Drama | Thriller</td></tr>
        <tr><td>Color</td><td>Color</td></tr>
      </table>
    </div>`),
    { root: "#facts", split: " | " }
  );
  assert.deepStrictEqual(data["Genre"], ["Drama", "Thriller"]);
  assert.deepStrictEqual(data["Color"], ["Color"]);
});

test("unknown strategy throws", () => {
  const TG = loadExtractor();
  assert.throws(
    () => TG.extractWith("nope", pageOf("<p>x</p>"), {}),
    /Unknown extraction strategy: nope/
  );
});
