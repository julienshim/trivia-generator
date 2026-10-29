const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { installDom, loadEngine } = require("./helpers/dom.js");

async function run(profileFile, fixture, url) {
  const html = fs.readFileSync(path.join(__dirname, "fixtures", fixture), "utf8");
  installDom(html, url);
  const TG = loadEngine(profileFile);
  return TG.run(url);
}

function golden(name) {
  return fs.readFileSync(path.join(__dirname, "golden", name), "utf8").trim();
}

test("wikipedia film profile matches v1 golden", async () => {
  const out = await run(
    "wikipedia.js",
    "wikipedia-film.html",
    "https://en.wikipedia.org/wiki/Inception"
  );
  assert.strictEqual(out, golden("wikipedia-film.txt"));
});

test("wikipedia tv series profile matches v1 golden", async () => {
  const out = await run(
    "wikipedia.js",
    "wikipedia-tvseries.html",
    "https://en.wikipedia.org/wiki/Stranger_Things"
  );
  assert.strictEqual(out, golden("wikipedia-tvseries.txt"));
});

test("imdb film profile matches v1 golden", async () => {
  const out = await run(
    "imdb.js",
    "imdb-film.html",
    "https://www.imdb.com/title/tt1375666/"
  );
  assert.strictEqual(out, golden("imdb-film.txt"));
});
