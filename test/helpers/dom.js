// Shared test helpers: jsdom globals + engine loading.
const { JSDOM } = require("jsdom");

function installDom(html = "<!doctype html><html><body></body></html>", url = "https://example.com/page") {
  const dom = new JSDOM(html, { url });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  try {
    Object.defineProperty(globalThis, "navigator", {
      value: dom.window.navigator,
      configurable: true,
    });
  } catch {
    globalThis.navigator = dom.window.navigator;
  }
  // jsdom has neither navigator.clipboard nor document.execCommand, so
  // TG.run's copy step would reject in every test without a stub.
  dom.window.navigator.clipboard = { writeText: async () => {} };
  return dom;
}

function resetEngine() {
  delete globalThis.TG;
  for (const f of Object.keys(require.cache)) {
    if (f.includes("/engine/") || f.includes("/profiles/")) delete require.cache[f];
  }
}

function loadEngine(...profileFiles) {
  resetEngine();
  require("../../engine/transforms.js");
  require("../../engine/templates.js");
  require("../../engine/extractor.js");
  for (const f of profileFiles) require("../../profiles/" + f);
  require("../../engine/content.js");
  return globalThis.TG;
}

module.exports = { installDom, resetEngine, loadEngine };
