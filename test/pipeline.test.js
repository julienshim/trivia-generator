const { test } = require("node:test");
const assert = require("node:assert");
const { installDom, loadEngine } = require("./helpers/dom.js");

function fakeProfile(over = {}) {
  return Object.assign(
    {
      id: "fake",
      match: "https://example.com/*",
      extract: () => ({ Name: ["Ada Lovelace"] }),
      context: () => ({
        fullTitle: "the 1843 article",
        type: "article",
        title: "article",
        year: "1843",
        possessive: "'s",
      }),
      present: () => false,
      fields: {
        Name: {
          question: "Who is the subject?",
          answer: "The subject is {{answer}}.",
        },
      },
    },
    over
  );
}

// TG.run is async (it awaits the clipboard write), so capture console.log
// across the await and return both the settled value and the captured logs.
async function captureRun(run) {
  const logs = [];
  const orig = console.log;
  console.log = (...a) => logs.push(a.join(" "));
  try {
    return { result: await run(), logs };
  } finally {
    console.log = orig;
  }
}

test("pipeline renders rows in data order, present fields only", async () => {
  installDom();
  const TG = loadEngine();
  TG.profile(
    fakeProfile({
      extract: () => ({ First: ["one"], Second: ["two"] }),
      fields: {
        Second: { question: "Second?", answer: "Second {{answer}}." },
        First: { question: "First?", answer: "First {{answer}}." },
        Missing: { question: "M?", answer: "M." },
      },
    })
  );
  const { result: out } = await captureRun(() => TG.run("https://example.com/page"));
  assert.strictEqual(
    out,
    "First?\tFirst one.\thttps://example.com/page\nSecond?\tSecond two.\thttps://example.com/page"
  );
});

test("no matching profile", async () => {
  installDom();
  const TG = loadEngine();
  TG.profile(fakeProfile());
  const { result, logs } = await captureRun(() => TG.run("https://other.com/page"));
  assert.strictEqual(result, null);
  assert.ok(logs.includes("No profile for this page."));
});

test("zero matched fields", async () => {
  installDom();
  const TG = loadEngine();
  TG.profile(fakeProfile({ fields: { Missing: { question: "q?", answer: "a." } } }));
  const { result, logs } = await captureRun(() => TG.run("https://example.com/page"));
  assert.strictEqual(result, null);
  assert.ok(logs.includes("Found the page, but no profile fields matched."));
});

test("extraction errors surface their message", async () => {
  installDom();
  const TG = loadEngine();
  TG.profile(
    fakeProfile({
      extract: () => {
        throw new Error("Couldn't find the .infobox on this page.");
      },
    })
  );
  const { result, logs } = await captureRun(() => TG.run("https://example.com/page"));
  assert.strictEqual(result, null);
  assert.ok(logs.includes("Couldn't find the .infobox on this page."));
});

test("context errors surface their message", async () => {
  installDom();
  const TG = loadEngine();
  TG.profile(
    fakeProfile({
      context: () => {
        throw new Error("This doesn't look like a film/TV article.");
      },
    })
  );
  const { result, logs } = await captureRun(() => TG.run("https://example.com/page"));
  assert.strictEqual(result, null);
  assert.ok(logs.includes("This doesn't look like a film/TV article."));
});

test("per-field source override", async () => {
  installDom();
  const TG = loadEngine();
  TG.profile(
    fakeProfile({
      fields: {
        Name: {
          question: "Who is the subject?",
          answer: "The subject is {{answer}}.",
          source: "{{source}}/extra",
        },
      },
    })
  );
  const { result: out } = await captureRun(() => TG.run("https://example.com/page"));
  assert.strictEqual(
    out,
    "Who is the subject?\tThe subject is Ada Lovelace.\thttps://example.com/page/extra"
  );
});

test("tense + profile transforms flow through templates", async () => {
  installDom();
  const TG = loadEngine();
  TG.profile(
    fakeProfile({
      present: () => true,
      transforms: { shout: (v) => TG.getTransform("join")(v).toUpperCase() },
      fields: {
        Name: {
          question: "It {{tense:is}} {{shout}}?",
          answer: "It is {{shout}}.",
        },
      },
    })
  );
  const { result: out } = await captureRun(() => TG.run("https://example.com/page"));
  assert.strictEqual(
    out,
    "It is ADA LOVELACE?\tIt is ADA LOVELACE.\thttps://example.com/page"
  );
});

test("clipboard copy is attempted and announced", async () => {
  const dom = installDom();
  const TG = loadEngine();
  TG.profile(fakeProfile());
  let copied = null;
  dom.window.navigator.clipboard = {
    writeText: async (t) => {
      copied = t;
    },
  };
  const { logs } = await captureRun(() => TG.run("https://example.com/page"));
  // TG.run settles only after the clipboard write resolves, so the
  // announcement is already captured by the time we get here.
  assert.strictEqual(copied, logs.find((l) => l.includes("\t")));
  assert.ok(logs.includes("Copied to clipboard!"));
});

test("run rejections log the spec failure line", async () => {
  installDom();
  // A minimal chrome stub so the listener in engine/content.js registers;
  // the test then drives the real listener the way the extension does.
  let listener = null;
  globalThis.chrome = {
    runtime: {
      id: "fake-runtime-id",
      onMessage: {
        addListener: (fn) => {
          listener = fn;
        },
      },
    },
  };
  try {
    const TG = loadEngine();
    assert.ok(listener, "chrome runtime listener should be registered");
    TG.profile(
      fakeProfile({
        // `present` omitted: presentRule reads rule.fields on undefined,
        // which rejects TG.run outside its internal try/catch.
        present: undefined,
      })
    );
    const logs = [];
    const origLog = console.log;
    const origClear = console.clear;
    console.log = (...a) => logs.push(a.join(" "));
    console.clear = () => {};
    try {
      listener({ action: "generate" }, { id: "fake-runtime-id" });
      // The listener fires TG.run as a floating promise; its rejection
      // settles in a microtask, so poll briefly for the failure line.
      await new Promise((r) => setTimeout(r, 10));
    } finally {
      console.log = origLog;
      console.clear = origClear;
    }
    const failed = logs.find((l) => l.startsWith("Trivia Generator failed: "));
    assert.ok(
      failed &&
        failed.includes("Cannot read properties of undefined (reading 'fields')"),
      `expected the spec failure line with the error message, got: ${JSON.stringify(logs)}`
    );
  } finally {
    delete globalThis.chrome;
  }
});

test("listener registers against the browser namespace when present", async () => {
  installDom();
  // browser namespace present, chrome absent: the idiom must take browser.
  let listener = null;
  globalThis.browser = {
    runtime: {
      id: "fake-browser-id",
      onMessage: {
        addListener: (fn) => {
          listener = fn;
        },
      },
    },
  };
  try {
    const TG = loadEngine();
    assert.ok(listener, "listener should register on the browser namespace");
    TG.profile(fakeProfile());
    const logs = [];
    const origLog = console.log;
    const origClear = console.clear;
    console.log = (...a) => logs.push(a.join(" "));
    console.clear = () => {};
    try {
      listener({ action: "generate" }, { id: "fake-browser-id" });
      // The listener fires TG.run as a floating promise; the row log lands
      // in a microtask — poll briefly, same pattern as the chrome-namespace
      // rejection test above.
      await new Promise((r) => setTimeout(r, 10));
    } finally {
      console.log = origLog;
      console.clear = origClear;
    }
    assert.ok(
      logs.find((l) => l.includes("Who is the subject?")),
      `expected the fake profile's row, got: ${JSON.stringify(logs)}`
    );
  } finally {
    delete globalThis.browser;
  }
});
