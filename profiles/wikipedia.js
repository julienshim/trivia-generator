// Sample profile: Wikipedia film/TV articles.
//
// A profile declares everything site-specific: where to extract data
// (extract), how to decide tense (present), how to derive context
// (context), and which fields become questions and how to phrase them
// (fields). Copy this file to start a new profile.

var TG = globalThis.TG; // var, not const: content scripts share one global lexical scope

// --- Local helpers: site-quirky logic templates can't express ----------

// v1 revealMediaType: media type from the intro paragraph, with the
// category list as the television/film tie-breaker.
function revealMediaType(p, page) {
  const pLow = p.toLowerCase();
  const catlinks = page.querySelector("#catlinks");
  const catText = catlinks ? catlinks.textContent : "";
  if (pLow.includes("anime") || pLow.includes("manga")) return "anime";
  if (
    pLow.includes("television series") ||
    ((pLow.includes("television") ||
      pLow.includes("drama") ||
      catText.includes("television")) &&
      !catText.includes("film"))
  ) {
    return "television series";
  }
  if (pLow.includes("film")) return "film";
  return undefined;
}

// v1 formatTitle: "TV" -> "television"; disambiguation suffixes like
// "(2021 film)" are flipped to the front ("2021 film Dune").
function formatTitle(t) {
  const normal = t.includes("TV") ? t.replace("TV", "television") : t;
  let flipped;
  if (t.includes("(")) {
    const parts = t
      .replace("TV", "television")
      .replace(/[())]/g, " ")
      .trim()
      .split(/[\s]{2,}/);
    const [head, tail] = parts;
    flipped = [tail, head].join(" ");
  }
  return { normal, flipped };
}

// v1 splitBy: groups "book by author" lines whose author list continues.
function splitBy(array) {
  const temp = [];
  let n = 0;
  for (let i = 0; i < array.length; i++) {
    temp[n] = temp[n] ? temp[n] + `\n${array[i]}` : array[i];
    if (array[i + 2] && array[i + 2].includes("by ")) n += 1;
  }
  return temp.map((item) => {
    const [book, author] = item.split("by ");
    return [book.trim(), TG.getTransform("andJoin")(author.trim().split(/\n/))].join(" by ");
  });
}

// v1 "Based on" formatting; the infobox strategy keeps the cell unsplit.
function formatBasedOn(value) {
  if (value.includes("by")) {
    if (value.split(/\s/).filter((x) => x.includes("by")).length > 1) {
      return splitBy(value.split(/\n/));
    }
    const [book, author] = value.split(/by |by/);
    return [
      [book.trim(), TG.getTransform("andJoin")(author.trim().split(/\n/))].join(" by "),
    ];
  }
  return [value];
}

// --- Profile ------------------------------------------------------------

TG.profile({
  id: "wikipedia",
  match: "https://en.wikipedia.org/wiki/*",
  experimental: false,
  answerJoin: "join", // v1 chainAnswer: 2 items "A, and B"

  extract: (page, url) => {
    const data = {};

    // Rotten Tomatoes: v1 scrapes this from the article body, not the
    // infobox, and inserts it BEFORE the infobox keys — goldens depend on
    // that row order, so it must be inserted first.
    const stripped = [...page.querySelectorAll("p")].map((p) =>
      TG.getTransform("strip")(p.textContent.trim())
    );
    const rt = stripped.find((c) => c.includes("Rotten Tomatoes"));
    if (rt) {
      data["Rotten Tomatoes"] = [
        `${rt.split(". ").find((x) => x.includes("Rotten Tomatoes"))}.`,
      ];
    }

    Object.assign(
      data,
      TG.extractWith("infobox", page, {
        root: ".infobox",
        split: "\n",
        unsplitKeys: ["Based on"],
      })
    );

    // "Based on" stays a single string through extraction; format it now.
    if (Object.prototype.hasOwnProperty.call(data, "Based on")) {
      data["Based on"] = formatBasedOn(data["Based on"]);
    }
    return data;
  },

  context: (page, data, url) => {
    const infobox = page.querySelector(".infobox");
    const intro = infobox
      ? infobox.nextElementSibling
      : page.querySelector("div.mw-parser-output > p:nth-child(2)");
    if (!intro) throw new Error("This doesn't look like a film/TV article.");

    const type = revealMediaType(intro.textContent, page);
    if (!type) throw new Error("This doesn't look like a film/TV article.");

    const heading = page.querySelector("#firstHeading");
    if (!heading) throw new Error("This doesn't look like a film/TV article.");
    const { normal, flipped } = formatTitle(heading.textContent);
    const title = flipped ? flipped : normal;

    const catlinks = page.querySelector("#catlinks");
    const yearMatch = catlinks ? catlinks.textContent.match(/\d{4,}/) : null;
    const year = yearMatch ? yearMatch[0] : undefined;

    const possessive = title[title.length - 1] === "s" ? "'" : "'s";
    const fullTitle = `the ${
      normal.match(/\(\d{4}/) ? "" : year ? year + " " : ""
    }${flipped ? "" : type} ${title}`.replace("  ", " ");

    return { title, type, year, fullTitle, possessive };
  },

  // v1 per-field tense: films are always past; otherwise "Original
  // release"/"Original run" containing "present" decides; the field's own
  // value is the fallback.
  present: (key, values, ctx) => {
    if (ctx.type === "film") return false;
    const d = ctx.data;
    if (d["Original release"]) {
      return d["Original release"].join(" ").toLowerCase().includes("present");
    }
    if (d["Original run"]) {
      return d["Original run"].join(" ").toLowerCase().includes("present");
    }
    return values.join(" ").toLowerCase().includes("present");
  },

  transforms: {
    budgetValue: (arr) => TG.getTransform("strip")(TG.getTransform("join")(arr)),
    episodeCount: (arr) => TG.getTransform("join")(arr).replace(" (List of episodes)", ""),
    // v1 inconsistency preserved: lowercase "(list of episodes)" here,
    // capital "(List of episodes)" for the "Episodes" field.
    episodeCountLower: (arr) => TG.getTransform("join")(arr).replace(" (list of episodes)", ""),
  },

  fields: {
    "Audio format": {
      question: "What audio format is {{fullTitle}} in?",
      answer: "The audio format for {{fullTitle}} is {{answer}}.",
    },
    "Based on": {
      question: "What {{tense:is}} {{fullTitle}} based on?",
      answer: "{{cap:fullTitle}} {{tense:is}} based on {{answer}}.",
    },
    "Box office": {
      question: "How much did {{fullTitle}} make at the box office?",
      answer: "{{cap:fullTitle}} grossed {{answer}} at the box office.",
    },
    "Budget": {
      question: "What {{tense:is}} {{fullTitle}}{{possessive}} budget?",
      answer: "The budget of {{fullTitle}} {{tense:is}} {{budgetValue}}.",
    },
    "Cinematography": {
      question: "Who {{tense:is}} {{fullTitle}}{{possessive}} cinematography by?",
      answer: "The cinematography for {{fullTitle}} {{tense:is}} by {{answer}}.",
    },
    "Composer": {
      question: "Who {{tense:composes}} {{fullTitle}}{{possessive}} music?",
      answer: "{{cap:fullTitle}}{{possessive}} music {{tense:is}} composed by {{answer}}.",
    },
    "Country": {
      question: "What country is {{fullTitle}} from?",
      answer: "The country of {{fullTitle}} is {{answer}}.",
    },
    "Country of origin": {
      question: "What is {{fullTitle}}{{possessive}} country of origin?",
      answer: "{{cap:fullTitle}}{{possessive}} country of origin is {{answer}}.",
    },
    "Created by": {
      question: "Who {{tense:is}} {{fullTitle}} created by?",
      answer: "{{cap:fullTitle}} {{tense:is}} created by {{answer}}.",
    },
    "Directed by": {
      question: "Who {{tense:directs}} {{fullTitle}}?",
      answer: "{{cap:fullTitle}} {{tense:is}} directed by {{answer}}.",
    },
    "Distributed by": {
      question: "What company was {{fullTitle}} distributed by?",
      answer: "{{cap:fullTitle}} {{tense:is}} distributed by {{answer}}.",
    },
    "Distributor": {
      // v1 quirk preserved: no space in "for{{fullTitle}}".
      question: "Who was {{fullTitle}}{{possessive}} distributor?",
      answer: "The distributor for{{fullTitle}} is {{answer}}.",
    },
    "Edited by": {
      question: "Who edited {{fullTitle}}?",
      answer: "{{cap:fullTitle}} {{tense:is}} edited by {{answer}}.",
    },
    "Editor": {
      question: "Who {{tense:is}} the editor for {{fullTitle}}?",
      answer: "The editor for {{fullTitle}} {{tense:is}} {{answer}}.",
    },
    "Episodes": {
      question: "How many episodes does {{fullTitle}} have?",
      answer: "{{cap:fullTitle}} has {{episodeCount}} episodes.",
    },
    "Executive producer": {
      question: "Who {{tense:is}} the executive producer for {{fullTitle}}?",
      answer: "The executive producer for {{fullTitle}} {{tense:is}} {{answer}}.",
    },
    "Followed by": {
      question: "What was {{fullTitle}} followed by?",
      answer: "{{cap:fullTitle}} was followed by {{answer}}.",
    },
    "Genre": {
      question: "What is {{fullTitle}}{{possessive}} genre?",
      answer: (value, ctx) =>
        `The ${value.length > 1 ? "genres" : "genre"} of ${ctx.fullTitle} ${
          value.length > 1 ? "are" : "is"
        } ${TG.getTransform("join")(value.map((x) => x.toLowerCase()))}.`,
    },
    "Language": {
      question: "What language is {{fullTitle}} in?",
      answer: "The language of {{fullTitle}} is {{answer}}.",
    },
    "Music by": {
      question: "Who {{tense:is}} {{fullTitle}}{{possessive}} music by?",
      answer: "The music for {{fullTitle}} {{tense:is}} by {{answer}}.",
    },
    "Narrated by": {
      question: "Who {{tense:is}} {{fullTitle}} narrated by?",
      answer: "{{cap:fullTitle}} was narrated by {{answer}}.",
    },
    "No. of episodes": {
      question: "How many episodes does {{fullTitle}} have?",
      answer: "The number of episodes for {{fullTitle}} is {{episodeCountLower}}.",
    },
    "No. of seasons": {
      question: "How many seasons does {{fullTitle}} have?",
      answer: "The number of seasons for {{fullTitle}} is {{answer}}.",
    },
    "No. of series": {
      question: "How many series did {{fullTitle}} run for?",
      answer: "The number of series for {{fullTitle}} is {{answer}}.",
    },
    "Opening theme": {
      question: "What is {{fullTitle}}{{possessive}} opening theme?",
      answer: "The opening theme for {{fullTitle}} is {{answer}}.",
    },
    "Original language": {
      question: "What language is {{fullTitle}}?",
      answer: "The language of {{fullTitle}} is {{answer}}.",
    },
    "Original network": {
      question: "What network was {{fullTitle}} on?",
      answer: "{{cap:fullTitle}} was on {{answer}}.",
    },
    "Original release": {
      question: "When was {{fullTitle}} released?",
      answer: (value, ctx) =>
        `${TG.getTransform("cap")(ctx.fullTitle)} was released ${
          ctx.isPresent
            ? value.join(" ").replace("–", " to the ")
            : value.join(" ").replace("–", " to ")
        }.`,
    },
    "Original run": {
      question: "When was {{fullTitle}}{{possessive}} original run?",
      answer: (value, ctx) =>
        `The original run of ${ctx.fullTitle} was from ${
          ctx.isPresent
            ? value.join(" ").replace("–", " to the ")
            : value.join(" ").replace("–", " to ")
        }.`,
    },
    "Preceded by": {
      question: "What was {{fullTitle}} preceded by?",
      answer: "{{cap:fullTitle}} was preceded by {{answer}}.",
    },
    "Picture format": {
      question: "What is {{fullTitle}}{{possessive}} picture format?",
      answer: "The picture format for {{fullTitle}} is {{answer}}.",
    },
    "Presented by": {
      question: "Who {{tense:is}} {{fullTitle}} presented by?",
      answer: "{{cap:fullTitle}} {{tense:is}} presented by {{answer}}.",
    },
    "Produced by": {
      question: "Who produced {{fullTitle}}?",
      answer: "{{cap:fullTitle}} {{tense:is}} produced by {{answer}}.",
    },
    "Producer": {
      question: "Who produced {{fullTitle}}?",
      answer: "{{cap:fullTitle}} {{tense:is}} produced by {{answer}}.",
    },
    "Production companies": {
      question: "What company produced {{fullTitle}}?",
      answer: "{{cap:fullTitle}} {{tense:is}} produced by {{answer}}.",
    },
    "Production company": {
      question: "What company produced {{fullTitle}}?",
      answer: "{{cap:fullTitle}} {{tense:is}} produced by {{answer}}.",
    },
    "Production location": {
      question: "Where was {{fullTitle}} produced?",
      answer: "{{cap:fullTitle}} {{tense:is}} produced in {{answer}}.",
    },
    "Related shows": {
      // v1 grammar quirk preserved.
      question: "What show are related to {{fullTitle}}?",
      answer: "{{cap:fullTitle}} is related to the {{answer}}.",
    },
    "Release date": {
      question: "When was {{fullTitle}} released?",
      answer: "{{cap:fullTitle}} was released on {{answer}}.",
    },
    "Rotten Tomatoes": {
      question: "What is {{fullTitle}}{{possessive}} Rotten Tomatoes score?",
      answer: (value, ctx) =>
        TG.getTransform("join")(value)
          .replace("/", " out of ")
          .replace("The film", TG.getTransform("cap")(ctx.fullTitle))
          .replace("the film", ctx.fullTitle)
          .replace(" it ", ` ${ctx.fullTitle} `),
    },
    "Running time": {
      question: "What is {{fullTitle}}{{possessive}} running time?",
      answer: "The running time of {{fullTitle}} is {{answer}}.",
    },
    "Screenplay by": {
      question: "Who was {{fullTitle}}{{possessive}} screenplay by?",
      answer: "The screenplay for {{fullTitle}} was by {{answer}}.",
    },
    "Starring": {
      question: "Who starred in {{fullTitle}}?",
      answer: "{{cap:fullTitle}} stars {{answer}}.",
    },
    "Story by": {
      question: "Who was {{fullTitle}}{{possessive}} story by?",
      answer: "The story for {{fullTitle}} was by {{answer}}.",
    },
    "Studio": {
      question: "What studio worked on {{fullTitle}}?",
      answer: "{{cap:fullTitle}} was animated by {{answer}}.",
    },
    "Theme music composer": {
      // v1 bug fixed: this case no longer falls through to "Voices of".
      question: "Who composed {{fullTitle}}{{possessive}} theme music?",
      answer: "The theme music for {{fullTitle}} was composed by {{answer}}.",
    },
    "Voices of": {
      question: "Whose voices did {{fullTitle}} feature?",
      answer: "{{cap:fullTitle}} featured the voices of {{answer}}.",
    },
    "Written by": {
      question: "Who wrote {{fullTitle}}?",
      answer: "{{cap:fullTitle}} {{tense:is}} written by {{answer}}.",
    },
  },
});
