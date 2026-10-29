// Sample profile: IMDb title pages.
//
// EXPERIMENTAL: the extraction below targets IMDb's pre-2024 layout. Re-verify
// against the current site before relying on it.
//
// IMDb's scrape spans several page sections, so `extract` is a function (the
// escape hatch) porting the original version's scraping verbatim.

var TG = globalThis.TG; // var, not const: content scripts share one global lexical scope

const countryConversion = { USA: "United States", UK: "United Kingdom" };

// v1 genre whitelist; unknown genres are console.error'd and dropped.
const imdbGenres = [
  "Action",
  "Animation",
  "Biography",
  "Comedy",
  "Crime",
  "Adventure",
  "Documentary",
  "Drama",
  "Family",
  "Fantasy",
  "Film Noir",
  "History",
  "Horror",
  "Music",
  "Musical",
  "Mystery",
  "Romance",
  "Sci-Fi",
  "Short Film",
  "Sport",
  "Superhero",
  "Thriller",
  "War",
  "Western",
  "Game Show",
  "News",
  "Reality-TV",
  "Talk Show",
  "Talk-Show",
  "Reality TV",
  "Short",
  "Sports",
];

function collectGenre(existing, genre) {
  if (!imdbGenres.includes(genre)) {
    console.error(`${genre} should be added to the genre list!`);
    return existing;
  }
  if (existing) {
    return existing.includes(genre) ? existing : [...existing, genre];
  }
  return [genre];
}

// v1 helpers, ported.
function formatImdbTitle(title, type) {
  const temp = title.replace(/– \)|–\d{4}\)|\)/, "").split(/[\s]{1,}\(/);
  const [t, year] = temp;
  return ["the", year, type, t].join(" ");
}

function formatReleaseDate(datelocale) {
  const [date, locale] = datelocale.replace(")", "").split(/\s{1}\(/);
  const converted = countryConversion.hasOwnProperty(locale)
    ? countryConversion[locale]
    : locale;
  return `in ${converted} on ${date}`;
}

function formatRunTime(time) {
  if (time.match(/minutes|minute|hour|hours/)) {
    if (
      time.match(/1 hours|1 minutes/) &&
      !time.match(/\d{2,} hours|\d{2,} minutes/)
    ) {
      return time.replace("1 hours", "1 hour").replace("1 minutes", "1 minute");
    }
    return time;
  }
  let temp = time;
  if (time.match(/1h\s{0,}/) && !time.match(/\d{2,}h\s{0,}/)) {
    temp = temp.replace("h", " hour");
  } else {
    temp = temp.replace("h", " hours");
  }
  if (time.match(/1min\s{0,}/) && !time.match(/\d{2,}min\s{0,}/)) {
    temp = temp.replace("min", " minute");
  } else {
    temp = temp.replace("min", " minutes");
  }
  return temp;
}

function formatLocation(location, isRunning) {
  if (isRunning) {
    return location
      .replace("USA", "the United States")
      .replace("UK", "the United Kingdom");
  }
  return location.replace("USA", "United States").replace("UK", "United Kingdom");
}

function walkFrom(page, selector) {
  const start = page.querySelector(selector);
  const out = [];
  if (!start) return out;
  let el = start;
  while (el !== null) {
    out.push(TG.innerLike(el));
    el = el.nextElementSibling;
  }
  return out;
}

TG.profile({
  id: "imdb",
  match: "https://www.imdb.com/title/tt*",
  experimental: true,
  answerJoin: "andJoin", // v1 chain: 2 items "A and B"

  extract: (page, url) => {
    const imdb = {};

    // Plot, Director, Writers, Stars (div.summary_text and siblings)
    const summary = walkFrom(page, "div.summary_text");
    summary.forEach((data, i) => {
      const format = {
        0: `Plot: <DO NOT USE THIS VALUE>`,
        1: data,
        2: data,
        3: data,
      };
      const temp = format[i].split(" | ")[0];
      const [key, value] = temp.split(/:\s{0,}/);
      imdb[key] = key === "Plot" ? [data.split(" See full summary")[0]] : value.split(", ");
    });

    // Title, Rating, Time, Genre, Release (div.title_wrapper)
    const titleWrapper = page.querySelector("div.title_wrapper");
    if (!titleWrapper) {
      throw new Error("Couldn't find the title summary on this page (IMDb layout may have changed).");
    }
    const wrapperData = TG.innerLike(titleWrapper).split(" | ");
    wrapperData.forEach((data, i) => {
      const format = {
        RuntimeHM: `RuntimeHM: ${data
          .replace("h", +data[0] > 1 ? " hours" : " hour")
          .replace("min", " minutes")}:`,
        "Release Date": `Release Date: ${data}`,
        Type: `Type: ${data}`,
      };
      let temp;
      if (i === 0) {
        if (data.match(/\s{1,}TV-/)) {
          const front = data.split(/\s{1,}TV-/)[0];
          if (front.match(/original title/)) {
            const [title, originalTitle] = front.split(/\s{1,}/);
            imdb["Title"] = [title];
            imdb["Original Title"] = [originalTitle];
          } else {
            imdb["Title"] = [front];
          }
        }
        if (data.includes(", ")) {
          const [title, genres] = data.split(/\n/);
          imdb["Title"] = [title];
          genres.split(", ").forEach((genre) => {
            imdb["Genre"] = collectGenre(imdb["Genre"], genre);
          });
        }
        if (data.split(/\s{2}/)[0].includes("Approved")) {
          imdb["Title"] = [data.split(/\s{2,}/)[0].split(/\n/)[0]];
        }
        if (imdbGenres.includes(data.split(/\s{2,}/)[0].split(/\n/)[1])) {
          imdb["Title"] = [data.split(/\s{2,}/)[0].split(/\n/)[0]];
          imdb["Genre"] = [data.split(/\s{2,}/)[0].split(/\n/)[1]];
        }
        if (imdbGenres.includes(data.split(/\s{2,}/)[1])) {
          imdb["Title"] = [data.split(/\s{2,}/)[0]];
          imdb["Genre"] = [data.split(/\s{2,}/)[1]];
        }
        if (data.match(/\(original title\)/)) {
          if (data.match(/\d{1,}h/) || data.match(/\d{1,}min/)) {
            const [title, originalTitle, runtime] = data.split(/\n/);
            imdb["Title"] = [title];
            imdb["Original Title"] = [originalTitle.split(" (")[0]];
            imdb["RuntimeHM"] = [runtime];
          } else if (data.match(/\nUnrated|G$|PG|PG-13|R$|NC-17|Not Rated/)) {
            const [title, originalTitle, rating] = data.split(/\n/);
            imdb["Title"] = [title];
            imdb["Original Title"] = [originalTitle.split(" (")[0]];
            // v1 bug preserved: spreads the no-space key (undefined → no-op).
            imdb["Motion Picture Rating (MPAA)"] = imdb["Motion Picture Rating (MPAA)"]
              ? { ...imdb["Motion Picture Rating(MPAA)"], Short: [rating] }
              : { Short: [rating] };
          }
        } else {
          if (data.match(/\d{1,}h/) || data.match(/\d{1,}min/)) {
            const [title, runtime] = data.split(/\n/);
            imdb["Title"] = [title];
            imdb["RuntimeHM"] = [runtime];
          } else if (data.match(/\nUnrated|G$|PG|PG-13|R$|NC-17|Not Rated/)) {
            const [title, rating] = data.split(/\n/);
            imdb["Title"] = [title];
            imdb["Motion Picture Rating (MPAA)"] = imdb["Motion Picture Rating (MPAA)"]
              ? { ...imdb["Motion Picture Rating(MPAA)"], Short: [rating] }
              : { Short: [rating] };
          }
        }
      } else if (data.match(/\d{1,}h/) || data.match(/\d{1,}min/)) {
        temp = format["RuntimeHM"];
        if (temp.includes("(")) {
          const [title, runtime] = temp.split(/\n/);
          temp = `RuntimeHM: ${runtime}`;
          imdb["Title"] = [title.split(/:\s{0,1}/)[1]];
        }
      } else if (data.includes(",")) {
        data.split(", ").forEach((genre) => {
          imdb["Genre"] = collectGenre(imdb["Genre"], genre);
        });
      } else if (data.match(/\([a-z]{2,}\)/i)) {
        temp = format["Release Date"];
        const year = `${temp.match(/\d{4}/)[0]}`;
        imdb["Type"] = [`Film (${year})`];
      } else if (data.includes("Series")) {
        temp = format["Type"];
      }
      if (temp) {
        const [key, value] = temp.split(/:\s{0,}/);
        if (key && value) imdb[key] = [value];
      }
    });

    // IMDb User Rating (div.ratings_wrapper)
    const ratingsEl = page.querySelector("div.ratings_wrapper");
    if (ratingsEl) {
      const parts = TG.innerLike(ratingsEl).split(/\n/).slice(0, 2);
      const [rating, users] = parts;
      if (rating && users) {
        imdb["Rating"] = {
          "Average Rating": [rating.replace("/", " / ")],
          "No. of Users": [users],
        };
      }
    }

    // MPAA Rating, Expanded Genre, Storyline (#titleStoryLine > h2)
    const storyline = walkFrom(page, "#titleStoryLine > h2");
    storyline.forEach((data, i) => {
      if (data.includes("MPAA")) {
        const [key, value] = data.split(/\n/);
        imdb[key] = imdb[key]
          ? { ...imdb[key], Detailed: [value.split(" | ")[0].replace("Rated ", "")] }
          : { Detailed: [value.split(" | ")[0].replace("Rated ", "")] };
      }
      if (data.includes("Storyline")) {
        imdb["Storyline"] = [storyline[i + 1].split(" Written by")[0]];
      }
      if (data.includes("Genres")) {
        data
          .split(/:\s{0,}/)[1]
          // v1 splits on U+00A0 + "| " (the page's &nbsp;-separated pipes);
          // a plain " | " would leave the list unsplit.
          .split("\u00A0| ")
          .forEach((genre) => {
            imdb["Genre"] = collectGenre(imdb["Genre"], genre);
          });
      }
    });

    // Country, Language, Release Date, Filming Locations, Budget, Gross,
    // Production Co, Runtime, Sound Mix, Color, Aspect Ratio (#titleDetails > h2)
    const details = walkFrom(page, "#titleDetails > h2");
    details.forEach((data) => {
      if (data.includes(":") && !data.includes("Official Sites")) {
        if (data.includes("Aspect Ratio")) {
          imdb["Aspect Ratio"] = [data.split("Aspect Ratio: ")[1]];
        } else if (data.includes("Sound Mix:")) {
          imdb["Sound Mix"] = data.split("Sound Mix: ")[1].split(" | ");
        } else {
          let [key, rawValue] = data.split(/:\s{0,}/);
          let value = [rawValue.split(/ See full summary| See more/)[0]];
          if (/\, | \| /.test(value[0]) && !key.includes("Filming Locations")) {
            value = value[0].split(/, | \| /);
          }
          if (key.includes("Opening Weekend USA")) {
            const [earnings, date] = value;
            value = {
              "Opening Weekend USA Earnings": earnings,
              "Opening Weekend USA Date": date,
            };
          }
          if (key.includes("Runtime")) {
            key = "RuntimeM";
            value[0] = value[0].replace("min", "minutes");
          }
          imdb[key] = value;
        }
      }
    });

    // Source
    const urlMatch = url.match(/https:\/\/www.imdb.com\/title\/tt+\d{1,}/);
    imdb["URL"] = [urlMatch ? urlMatch[0] : url];

    return imdb;
  },

  context: (page, data, url) => {
    const andJoin = TG.getTransform("andJoin");
    if (data["Title"] === undefined) {
      throw new Error("Couldn't find a title on this page (IMDb layout may have changed).");
    }
    const source = andJoin(data["URL"]);
    const fullType = data.hasOwnProperty("Type")
      ? data["Type"]
      : [
          `Film ${(data["Title"][0].match(/\(\d{4}- \)|\(\d{4}\)|\(\d{4}–\d{4}\)/) || [])[0] || ""}`,
        ];
    const type = andJoin(fullType)
      .split(" (")[0]
      .replace("TV", "Television")
      .toLowerCase();
    const title = andJoin(
      type !== "film"
        ? [
            `${data["Title"]} ${andJoin(
              data["Type"][0].match(/\(\d{4}– \)|\(\d{4}\)|\(\d{4}–\d{4}\)/) || ""
            )}`,
          ]
        : data["Title"]
    );
    const possessive = type[type.length - 1] === "s" ? "'" : "'s";
    const fullTitle = formatImdbTitle(title, type);
    const isInProduction =
      !!andJoin(fullType).match(/\(\d{4}–\s\)/) && !String(fullType[0]).includes("Mini");
    return { source, title, type, year: undefined, fullTitle, possessive, isInProduction };
  },

  present: (key, values, ctx) => ctx.isInProduction,

  transforms: {
    locationRunning: (v) => formatLocation(TG.getTransform("andJoin")(v), true),
    locationPlain: (v) => formatLocation(TG.getTransform("andJoin")(v), false),
    runtime: (v) => formatRunTime(TG.getTransform("andJoin")(v)),
    // v1 sourced every row from the URL regex match (no trailing slash),
    // which extract stores in data["URL"]; the engine's ctx.source is the
    // raw page URL, so each field names its source explicitly.
    imdbSource: (data) => TG.getTransform("andJoin")(data["URL"]),
  },

  fields: {
    "Budget": {
      question: "What {{tense:is}} {{fullTitle}}{{possessive}} budget?",
      answer: (value, ctx) => {
        const raw = TG.getTransform("andJoin")(value);
        let budget = raw.includes("estimated")
          ? `an estimated ${raw.split(" (")[0].replace(/EUR/, "€")}`
          : raw.replace(/EUR/, "€");
        if (budget.includes("SEK")) budget = `${budget.replace("SEK", "")} kronor`;
        return `The budget of ${ctx.fullTitle} ${ctx.isPresent ? "is" : "was"} ${budget}.`;
      },
      source: "{{imdbSource:data}}",
    },
    "Country": {
      question: "What is {{fullTitle}}{{possessive}} country of origin?",
      answer: "The country of {{fullTitle}} is {{locationRunning}}.",
      source: "{{imdbSource:data}}",
    },
    "Creator": {
      question: "Who is the creator of {{fullTitle}}?",
      answer: "The creator of {{fullTitle}} is {{answer}}.",
      source: "{{imdbSource:data}}",
    },
    "Creators": {
      // v1 quirk preserved: question missing its "?".
      question: "Who is the creator of {{fullTitle}}",
      answer: "The creators of {{fullTitle}} are {{answer}}.",
      source: "{{imdbSource:data}}",
    },
    "Cumulative Worldwide Gross": {
      // v1 stringifies the raw array here (no oxford join) — preserved.
      question: "How much did {{fullTitle}} gross worldwide?",
      answer: (value, ctx) =>
        `${TG.getTransform("cap")(ctx.fullTitle)} grossed ${value} worldwide.`,
      source: "{{imdbSource:data}}",
    },
    "Director": {
      question: "Who {{tense:directs}} {{fullTitle}}?",
      answer: "{{cap:fullTitle}} {{tense:is}} directed by {{answer}}.",
      source: "{{imdbSource:data}}",
    },
    "Directors": {
      question: "Who {{tense:directs}} {{fullTitle}}?",
      answer: "{{cap:fullTitle}} {{tense:is}} directed by {{answer}}.",
      source: "{{imdbSource:data}}",
    },
    "Filming Locations": {
      question: "Where {{tense:is}} {{fullTitle}} shot?",
      answer: "{{cap:fullTitle}} {{tense:is}} shot in {{locationPlain}}.",
      source: "{{imdbSource:data}}",
    },
    "Genre": {
      question: "What genre is {{fullTitle}}?",
      answer: (value, ctx) =>
        `The ${value.length > 1 ? "genres" : "genre"} of ${ctx.fullTitle} ${
          value.length > 1 ? "are" : "is"
        } ${TG.getTransform("andJoin")(value).toLowerCase()}.`,
      source: "{{imdbSource:data}}",
    },
    "Motion Picture Rating (MPAA)": {
      question: (value, ctx) =>
        ctx.type === "television series"
          ? `What are ${ctx.fullTitle}${ctx.possessive} television parental guidelines?`
          : `What is ${ctx.fullTitle}${ctx.possessive} movie rating?`,
      answer: (value, ctx) =>
        `${TG.getTransform("cap")(ctx.fullTitle)} is rated ${TG.getTransform("andJoin")(
          value.hasOwnProperty("Detailed") ? value.Detailed : value.Short
        )}.`,
      source: "{{imdbSource:data}}",
    },
    "Plot": {
      question: "What is {{fullTitle}}{{possessive}} plot?",
      answer: (value) => TG.getTransform("andJoin")(value).split(/\n/)[0],
      source: "{{imdbSource:data}}",
    },
    "Production Co": {
      question: "What company produced {{fullTitle}}?",
      answer: "{{cap:fullTitle}} was produced by {{answer}}.",
      source: "{{imdbSource:data}}",
    },
    "Rating": {
      question: "What is {{fullTitle}}{{possessive}} IMDb User Rating?",
      answer: (value, ctx) =>
        `${TG.getTransform("andJoin")(value["No. of Users"])} IMDb users have given a weighted average vote of ${TG.getTransform(
          "andJoin"
        )(value["Average Rating"]).replace("/", "out of")} for ${ctx.fullTitle}.`,
      source: "{{imdbSource:data}}/ratings?ref_=tt_ov_rt",
    },
    "Release Date": {
      // Approved fix: v1 hardcoded "2021"; compare release year to now.
      question: (value, ctx) => {
        const relYear = (value[0].match(/\d{4}/) || [])[0];
        const q =
          relYear && Number(relYear) >= new Date().getFullYear() ? "is" : "was";
        return `What ${q} ${ctx.fullTitle}${ctx.possessive} release date?`;
      },
      answer: (value, ctx) => {
        const relYear = (value[0].match(/\d{4}/) || [])[0];
        const a =
          relYear && Number(relYear) >= new Date().getFullYear() ? "will be" : "was";
        return `${TG.getTransform("cap")(ctx.fullTitle)} ${a} released ${formatReleaseDate(
          TG.getTransform("andJoin")(value)
        )}.`;
      },
      source: "{{imdbSource:data}}",
    },
    "RuntimeHM": {
      question: "What is {{fullTitle}}{{possessive}} runtime?",
      answer: "{{cap:fullTitle}}{{possessive}} runtime is {{runtime}}.",
      source: "{{imdbSource:data}}",
    },
    "Stars": {
      question: "Who {{tense:stars}} in {{fullTitle}}?",
      answer: "{{cap:fullTitle}} stars {{answer}}.",
      source: "{{imdbSource:data}}",
    },
    "Writer": {
      question: "Who wrote {{fullTitle}}?",
      answer: "{{cap:fullTitle}} {{tense:is}} written by {{answer}}.",
      source: "{{imdbSource:data}}",
    },
    "Writers": {
      question: "Who wrote {{fullTitle}}?",
      answer: "{{cap:fullTitle}} {{tense:is}} written by {{answer}}.",
      source: "{{imdbSource:data}}",
    },
  },
});
