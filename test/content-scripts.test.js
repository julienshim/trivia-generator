const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// In a browser, every file in the manifest's content_scripts list runs as a
// separate classic script sharing ONE global lexical scope: a top-level
// `const` in one file is a redeclaration SyntaxError in the next. require()
// can't see that (each module gets its own scope), so load the real files,
// in manifest order, into a single vm context — the browser's actual shape.
test("manifest content scripts load together in one global scope", () => {
  const root = path.join(__dirname, "..");
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "manifest.json"), "utf8")
  );
  const context = vm.createContext({});
  for (const file of manifest.content_scripts[0].js) {
    vm.runInContext(
      fs.readFileSync(path.join(root, file), "utf8"),
      context,
      { filename: file }
    );
  }
  const TG = context.TG;
  assert.ok(TG, "TG should exist on the shared global after all scripts load");
  assert.strictEqual(typeof TG.renderTemplate, "function");
  assert.strictEqual(typeof TG.extractWith, "function");
  assert.strictEqual(typeof TG.innerLike, "function");
  assert.strictEqual(TG.profiles.length, 2);
});
