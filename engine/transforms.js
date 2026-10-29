// Engine transforms: pure string/array helpers usable from templates as
// {{name}} (on the current field's value) or {{name:var}} (on a context
// variable). Profile files register additional local transforms via
// TG.transform().

var TG = (globalThis.TG = globalThis.TG || {}); // var, not const: content scripts share one global lexical scope

// Profile registry lives here (not in content.js) because profiles load
// BEFORE content.js (manifest order: transforms, templates, extractor,
// profiles, content) and call TG.profile at load time.
TG.profiles = [];
TG.profile = (cfg) => {
  TG.profiles.push(cfg);
};

const transforms = {};
TG.transform = (name, fn) => {
  transforms[name] = fn;
};
TG.getTransform = (name) => transforms[name];

// v1 chainAnswer: 2 items "A, and B"; 3+ "A, B, and C". Pure (no splice).
TG.transform("join", (arr) => {
  const a = [...arr];
  if (a.length === 0) return "";
  if (a.length === 1) return `${a[0]}`;
  if (a.length === 2) return `${a[0]}, and ${a[1]}`;
  return `${a.slice(0, -1).join(", ")}, and ${a[a.length - 1]}`;
});

// v1 chainData: 2 items "A and B"; 3+ "A, B, and C". Pure (no splice).
TG.transform("andJoin", (arr) => {
  const a = [...arr];
  if (a.length === 0) return "";
  if (a.length === 1) return `${a[0]}`;
  if (a.length === 2) return `${a[0]} and ${a[1]}`;
  return `${a.slice(0, -1).join(", ")}, and ${a[a.length - 1]}`;
});

TG.transform("cap", (s) => {
  const str = String(s);
  return str.charAt(0).toUpperCase() + str.slice(1);
});

TG.transform("lower", (s) => String(s).toLowerCase());

// v1 handleStrip: removes Wikipedia citation markup ([1], [note 1],
// (<url>)). Ported verbatim, quirks included — see test/transforms.test.js.
TG.transform("strip", (s) => {
  const string = String(s);
  let isWriting = true;
  let isQuoting = false;
  let hasClosed = true;
  let stripped = "";
  let isReferencing = false;

  for (let i = 0; i < string.length; i += 1) {
    const pText = string[i + 1] === "(";

    if (string[i] === "[" && !isQuoting) {
      isWriting = false;
      hasClosed = false;
      isReferencing = true;
    }
    if (pText) {
      isWriting = false;
      hasClosed = false;
    }
    if (string[i] === ")") {
      hasClosed = true;
    }
    if (string[i] === '"') {
      isQuoting = !isQuoting;
    }
    if (string[i] === "]") {
      hasClosed = true;
      if (string[i + 1] !== ":") {
        isReferencing = false;
      }
    }
    if (string[i + 1] === " " && isReferencing) {
      isReferencing = !isReferencing;
    }
    if (
      (string[i].match(/\s/) ||
        string[i] === "," ||
        string[i] === "." ||
        string[i] === "!" ||
        string[i] === ";" ||
        string[i] === ":" ||
        string[i] === '"' ||
        string[i] === "?") &&
      hasClosed &&
      !isReferencing
    ) {
      isWriting = true;
    }
    if (isWriting) {
      stripped += string[i];
    }
  }
  return stripped;
});
