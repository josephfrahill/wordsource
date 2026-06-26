const fs = require("fs");

const langToOrigin = {
  "Old English": { origin: "germanic", priority: 10 },
  "Middle English": { origin: "germanic", priority: 9 },
  English: { origin: "germanic", priority: 8 },
  "Proto-Germanic": { origin: "germanic", priority: 7 },
  German: { origin: "germanic", priority: 6 },
  Dutch: { origin: "germanic", priority: 6 },
  "Old Norse": { origin: "germanic", priority: 6 },

  Latin: { origin: "latinate", priority: 10 },
  "Medieval Latin": { origin: "latinate", priority: 9 },
  "Late Latin": { origin: "latinate", priority: 8 },
  "Ecclesiastical Latin": { origin: "latinate", priority: 7 },
  "New Latin": { origin: "latinate", priority: 7 },
  "Old French": { origin: "latinate", priority: 10 },
  "Middle French": { origin: "latinate", priority: 9 },
  French: { origin: "latinate", priority: 8 },
  Italian: { origin: "latinate", priority: 7 },
  Spanish: { origin: "latinate", priority: 7 },

  "Ancient Greek": { origin: "greek", priority: 10 },
  Greek: { origin: "greek", priority: 9 },

  Arabic: { origin: "arabic", priority: 8 },
  Hebrew: { origin: "hebrew", priority: 8 },
  Sanskrit: { origin: "sanskrit", priority: 8 },
  Persian: { origin: "persian", priority: 8 },
  Hindi: { origin: "hindi", priority: 7 },
  Chinese: { origin: "chinese", priority: 7 },
  Japanese: { origin: "japanese", priority: 7 },
};

const TRAVERSAL_PRIORITY = new Set([
  "has_prefix_with_root",
  "has_suffix_with_root",
  "compound_of",
  "has_affix",
]);

const ETYMOLOGY_RELATIONS = new Set([
  "borrowed_from",
  "derived_from",
  "learned_borrowing_from",
  "calque_of",
  "inherited_from",
  "etymologically_related_to",
  "unadapted_borrowing_from",
]);

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const csvText = fs.readFileSync("../data/etymology.csv", "utf8");
const lines = csvText.split("\n");

const wordRelations = new Map();

for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();

  if (!line) continue;

  const parts = line.split(",");

  if (parts.length < 7) continue;

  let [termId, lang, term, relType, relatedTermId, relatedLang, relatedTerm] =
    parts;

  if (lang !== "English") continue;
  if (!term) continue;
  if (!relatedTerm) continue;

  let word = term.toLowerCase().trim();

  if (!word) continue;

  let phrase = "";
  if (word.includes(" ")) {
    phrase = word;
    let pieces = word.split(" ");
    word = pieces[0];
  }

  if (!wordRelations.has(word)) {
    wordRelations.set(word, []);
  }

  wordRelations.get(word).push({
    relType,
    relatedLang,
    relatedTerm: relatedTerm.toLowerCase().trim(),
    phrase,
  });
}

const cache = new Map();

function resolveOrigin(word, visited = new Set()) {
  word = word.toLowerCase();

  if (cache.has(word)) {
    return cache.get(word);
  }

  if (visited.has(word)) {
    return null;
  }

  visited.add(word);

  const relations = wordRelations.get(word);
  if (!relations) {
    return null;
  }

  // FIRST: Look for real etymology
  let bestEtymology = null;
  for (const relation of relations) {
    const { relType, relatedLang, relatedTerm, phrase } = relation;

    if (!ETYMOLOGY_RELATIONS.has(relType)) {
      // console.log(relType);
      continue;
    }

    if (relType === "inherited_from" && relatedLang === "English") {
      console.log(`Inheritied from recent English: ${word}`);
      continue;
    }

    if (
      relType === "inherited_from" &&
      (relatedLang === "English" ||
        relatedLang === "Middle English" ||
        relatedLang === "Old English")
    ) {
      // treat as traversal, unhonest problem
    }

    let langInfo = langToOrigin[relatedLang];

    if (!langInfo) {
      langInfo = { priority: 5, origin: "other" };
    }

    let source_word = relatedTerm;

    if (phrase) {
      source_word = phrase;
    }

    if (!source_word) {
      //console.log(`Null source word: ${word}`);
      continue;
    }

    if (!bestEtymology || langInfo.priority > bestEtymology.priority) {
      bestEtymology = {
        origin: capitalize(langInfo.origin),
        source_lang: relatedLang,
        source_word: source_word,
        rel_type: relType,
        priority: langInfo.priority,
      };
    }
  }

  if (bestEtymology) {
    cache.set(word, bestEtymology);
    return bestEtymology;
  }

  //
  // SECOND: Traverse backwards
  //
  for (const relation of relations) {
    const { relType, relatedTerm } = relation;

    if (!TRAVERSAL_PRIORITY.has(relType)) {
      continue;
    }

    const result = resolveOrigin(relatedTerm, new Set(visited));

    if (result) {
      cache.set(word, result);
      return result;
    }
  }

  return null;
}

const words = [];

for (const word of wordRelations.keys()) {
  const origin = resolveOrigin(word);

  if (!origin) {
    continue;
  }

  words.push({
    word,
    // phrase: origin.phrase,
    origin: origin.origin,
    source_lang: origin.source_lang,
    source_word: origin.source_word,
    rel_type: origin.rel_type,
    source_url: `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`,
  });
}

const output = {
  metadata: {
    totalWordCount: words.length,
    generatedAt: new Date().toISOString(),
    source: "https://github.com/droher/etymology-db",
    supportedLanguages: ["English"],
  },
  words,
};

fs.writeFileSync(
  "../data/words-etymology-db.json",
  JSON.stringify(output, null, 2),
);

console.log("✓ Done");
console.log("Words:", words.length);
/*
console.log(`\n📊 Skipped breakdown:`);
console.log(`  Not English: ${skippedReasons.notEnglish}`);
console.log(`  No related language: ${skippedReasons.noRelatedLang}`);
console.log(`  Multiple apostrophes: ${skippedReasons.multipleApostrophes}`);
console.log(`  Total skipped: ${skipped}`);
*/
