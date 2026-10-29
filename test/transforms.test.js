const { test } = require("node:test");
const assert = require("node:assert");

function loadTransforms() {
  delete globalThis.TG;
  delete require.cache[require.resolve("../engine/transforms.js")];
  require("../engine/transforms.js");
  return globalThis.TG;
}

test("cap capitalizes the first letter", () => {
  const TG = loadTransforms();
  assert.strictEqual(TG.getTransform("cap")("the matrix"), "The matrix");
  assert.strictEqual(TG.getTransform("cap")("Inception"), "Inception");
});

test("lower lowercases", () => {
  const TG = loadTransforms();
  assert.strictEqual(TG.getTransform("lower")("ACTION"), "action");
});

test("join has v1 chainAnswer semantics (Oxford)", () => {
  const TG = loadTransforms();
  const join = TG.getTransform("join");
  assert.strictEqual(join([]), "");
  assert.strictEqual(join(["A"]), "A");
  assert.strictEqual(join(["A", "B"]), "A, and B");
  assert.strictEqual(join(["A", "B", "C"]), "A, B, and C");
});

test("andJoin has v1 chainData semantics", () => {
  const TG = loadTransforms();
  const andJoin = TG.getTransform("andJoin");
  assert.strictEqual(andJoin([]), "");
  assert.strictEqual(andJoin(["A"]), "A");
  assert.strictEqual(andJoin(["A", "B"]), "A and B");
  assert.strictEqual(andJoin(["A", "B", "C"]), "A, B, and C");
});

test("joins do not mutate their input (v1 used splice)", () => {
  const TG = loadTransforms();
  const input = ["A", "B", "C"];
  TG.getTransform("join")(input);
  TG.getTransform("andJoin")(input);
  assert.deepStrictEqual(input, ["A", "B", "C"]);
});

test("strip has v1 handleStrip semantics (quirks included)", () => {
  const TG = loadTransforms();
  const strip = TG.getTransform("strip");
  assert.strictEqual(
    strip("Inception was filmed on location [12]."),
    "Inception was filmed on location ."
  );
  assert.strictEqual(
    strip("The budget was $160 million [1] [2]."),
    "The budget was $160 million  ."
  );
  assert.strictEqual(
    strip("No citations here at all."),
    "No citations here at all."
  );
  assert.strictEqual(
    strip("See [note 1] for details."),
    "See  for details."
  );
  assert.strictEqual(
    strip('Quoted "text" [4] more'),
    'Quoted "text"  more'
  );
});

test("registry: transforms can be added at runtime", () => {
  const TG = loadTransforms();
  TG.transform("shout", (s) => String(s).toUpperCase());
  assert.strictEqual(TG.getTransform("shout")("hi"), "HI");
});
