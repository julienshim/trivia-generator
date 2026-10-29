// Entry point: message listener + the generic profile pipeline.
// Manifest load order: transforms, templates, extractor, profiles, this.

var TG = (globalThis.TG = globalThis.TG || {}); // var, not const: content scripts share one global lexical scope

TG.matchUrl = (pattern, url) => {
  if (pattern.endsWith("*")) return url.startsWith(pattern.slice(0, -1));
  return url === pattern;
};

function legacyCopy(text) {
  const dummy = document.createElement("textarea");
  document.body.appendChild(dummy);
  dummy.value = text;
  dummy.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(dummy);
  return ok;
}

function copyToClipboard(text) {
  const nav = globalThis.navigator;
  if (nav && nav.clipboard && nav.clipboard.writeText) {
    return nav.clipboard.writeText(text).then(
      () => true,
      () => legacyCopy(text)
    );
  }
  return Promise.resolve(legacyCopy(text));
}

// Declarative present-tense rule. The function form on the profile is the
// escape hatch (used by both sample profiles).
function presentRule(rule, key, values, ctx) {
  const text = (rule.fields || [])
    .map((f) => ctx.data[f])
    .filter((v) => v)
    .map((v) => (Array.isArray(v) ? v.join(" ") : String(v)))
    .join(" ")
    .toLowerCase();
  if (rule.token) return text.includes(rule.token);
  if (rule.pattern) return new RegExp(rule.pattern).test(text);
  return false;
}

TG.run = async (url) => {
  const profile = TG.profiles.find((p) => TG.matchUrl(p.match, url));
  if (!profile) {
    console.log("No profile for this page.");
    return null;
  }
  if (profile.transforms) {
    for (const [name, fn] of Object.entries(profile.transforms)) {
      TG.transform(name, fn);
    }
  }
  let data;
  let ctx;
  try {
    data = profile.extract(document, url);
    ctx = profile.context(document, data, url);
  } catch (e) {
    console.log(e.message);
    return null;
  }
  if (ctx.type === undefined) {
    console.log("This doesn't look like a media article.");
    return null;
  }
  ctx.data = data;
  ctx.source = url;
  ctx.answerJoin = profile.answerJoin || "join";

  // DATA ORDER: v1 iterated the scraped object, and goldens depend on
  // that order.
  const rows = [];
  for (const key of Object.keys(data)) {
    const recipe = profile.fields[key];
    if (!recipe) continue;
    const values = data[key];
    const renderCtx = {
      ...ctx,
      answer: values,
      isPresent:
        typeof profile.present === "function"
          ? profile.present(key, values, ctx)
          : presentRule(profile.present, key, values, ctx),
    };
    const question =
      typeof recipe.question === "function"
        ? recipe.question(values, renderCtx)
        : TG.renderTemplate(recipe.question, renderCtx);
    const answer =
      typeof recipe.answer === "function"
        ? recipe.answer(values, renderCtx)
        : TG.renderTemplate(recipe.answer, renderCtx);
    const source = recipe.source
      ? TG.renderTemplate(recipe.source, renderCtx)
      : ctx.source;
    if (question && answer) rows.push([question, answer, source].join("\t"));
  }

  if (rows.length === 0) {
    console.log("Found the page, but no profile fields matched.");
    return null;
  }

  const output = rows.join("\n");
  console.log(output);
  const copied = await copyToClipboard(output);
  if (copied) console.log("Copied to clipboard!");
  else console.log("Copy failed — select the console output and copy it manually.");
  return output;
};

// browser namespace (Firefox) with chrome fallback (Chrome); neither exists
// in plain node, where the listener is skipped.
const ext = globalThis.browser ?? globalThis.chrome;
if (ext && ext.runtime && ext.runtime.onMessage) {
  ext.runtime.onMessage.addListener((request, sender) => {
    if (sender.id !== ext.runtime.id) return;
    if (!request || request.action !== "generate") return;
    console.clear();
    TG.run(window.location.href).catch((e) =>
      console.log("Trivia Generator failed: " + e.message)
    );
  });
}
