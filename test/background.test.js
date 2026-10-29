const { test } = require("node:test");
const assert = require("node:assert");

test("out-of-scope click in Firefox stays a clean no-op", async () => {
  // background.js only runs in an extension host; fake the minimal browser
  // surface it touches, load it, and fire the click handler the way the
  // browser would.
  let onClicked = null;
  globalThis.browser = {
    action: {
      onClicked: {
        addListener: (fn) => {
          onClicked = fn;
        },
      },
    },
    tabs: {
      // The page has no content script (non-matched URL): the browser
      // namespace rejects. background.js must swallow that rejection — an
      // unswallowed one fails this run via node's unhandled-rejection
      // handling.
      sendMessage: () => Promise.reject(new Error("Could not establish connection.")),
    },
  };
  try {
    delete require.cache[require.resolve("../background.js")];
    require("../background.js");
    assert.ok(onClicked, "background.js should register an onClicked listener");
    onClicked({ id: 42 });
    // Let the swallowed rejection settle; a clean settle is the assertion.
    await new Promise((r) => setTimeout(r, 10));
  } finally {
    delete globalThis.browser;
  }
});
