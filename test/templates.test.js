const { test } = require("node:test");
const assert = require("node:assert");

function loadTemplates() {
  delete globalThis.TG;
  for (const f of Object.keys(require.cache)) {
    if (f.includes("/engine/")) delete require.cache[f];
  }
  require("../engine/transforms.js");
  require("../engine/templates.js");
  return globalThis.TG;
}

const baseCtx = {
  fullTitle: "the 2010 film Inception",
  type: "film",
  title: "Inception",
  year: "2010",
  possessive: "'s",
  source: "https://en.wikipedia.org/wiki/Inception",
  answer: ["Christopher Nolan"],
  isPresent: false,
  answerJoin: "join",
};

test("plain context variables", () => {
  const TG = loadTemplates();
  assert.strictEqual(
    TG.renderTemplate("About {{fullTitle}}", baseCtx),
    "About the 2010 film Inception"
  );
  assert.strictEqual(
    TG.renderTemplate("Type: {{type}} ({{year}})", baseCtx),
    "Type: film (2010)"
  );
});

test("tense resolution", () => {
  const TG = loadTemplates();
  assert.strictEqual(TG.renderTemplate("It {{tense:is}} great.", baseCtx), "It was great.");
  assert.strictEqual(
    TG.renderTemplate("It {{tense:is}} great.", { ...baseCtx, isPresent: true }),
    "It is great."
  );
  assert.strictEqual(TG.renderTemplate("Who {{tense:directs}} it?", baseCtx), "Who directed it?");
  assert.strictEqual(
    TG.renderTemplate("Who {{tense:composes}} it?", { ...baseCtx, isPresent: true }),
    "Who composes it?"
  );
});

test("{{answer}} uses the context's answerJoin", () => {
  const TG = loadTemplates();
  assert.strictEqual(
    TG.renderTemplate("By {{answer}}.", { ...baseCtx, answer: ["A", "B"] }),
    "By A, and B."
  );
  assert.strictEqual(
    TG.renderTemplate("By {{answer}}.", { ...baseCtx, answer: ["A", "B"], answerJoin: "andJoin" }),
    "By A and B."
  );
});

test("transforms on the field value and on named vars", () => {
  const TG = loadTemplates();
  assert.strictEqual(
    TG.renderTemplate("{{cap:fullTitle}} rule", baseCtx),
    "The 2010 film Inception rule"
  );
  assert.strictEqual(TG.renderTemplate("{{lower:type}} stuff", baseCtx), "film stuff");
  assert.strictEqual(
    TG.renderTemplate("{{cap}} the director", { ...baseCtx, answer: ["nolan"] }),
    "Nolan the director"
  );
});

test("unknown placeholders pass through unchanged", () => {
  const TG = loadTemplates();
  assert.strictEqual(TG.renderTemplate("Hello {{nope}}", baseCtx), "Hello {{nope}}");
});
