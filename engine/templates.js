// Template renderer: {{var}}, {{tense:word}}, {{name}}, {{name:var}}.
// Tense pairs are English language logic, not site logic — they live here.

var TG = (globalThis.TG = globalThis.TG || {}); // var, not const: content scripts share one global lexical scope

TG.tenseMap = {
  is: "was",
  stars: "starred",
  directs: "directed",
  composes: "composed",
};

TG.renderTemplate = (template, ctx) =>
  String(template).replace(/\{\{([^{}]+)\}\}/g, (match, expr) => {
    const [name, arg] = expr.split(":");
    if (name === "tense") {
      return ctx.isPresent ? arg : TG.tenseMap[arg] || arg;
    }
    if (name === "answer") {
      return TG.getTransform(ctx.answerJoin || "join")(ctx.answer);
    }
    const fn = TG.getTransform(name);
    if (fn) {
      return fn(arg !== undefined ? ctx[arg] : ctx.answer);
    }
    if (arg === undefined && name in ctx) {
      return String(ctx[name]);
    }
    return match;
  });
