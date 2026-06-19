const fs = require("fs");

// Multiple etymological relationships may exist for a word.
// Higher-priority source languages (e.g. Latin over French)
// replace lower-priority matches.
const langToOrigin = {
  // Germanic
  "Old English": { origin: "germanic", priority: 10 },
  "Middle English": { origin: "germanic", priority: 9 },
  English: { origin: "germanic", priority: 8 },
  "Proto-Germanic": { origin: "germanic", priority: 7 },
  German: { origin: "germanic", priority: 6 },
  Dutch: { origin: "germanic", priority: 6 },
  "Old Norse": { origin: "germanic", priority: 6 },
  Swedish: { origin: "germanic", priority: 5 },
  Danish: { origin: "germanic", priority: 5 },
  Norwegian: { origin: "germanic", priority: 5 },
  Icelandic: { origin: "germanic", priority: 5 },
  Gothic: { origin: "germanic", priority: 5 },

  // Latinate (Romance)
  Latin: { origin: "latinate", priority: 10 },
  "Old French": { origin: "latinate", priority: 10 },
  "Middle French": { origin: "latinate", priority: 9 },
  French: { origin: "latinate", priority: 8 },
  Italian: { origin: "latinate", priority: 7 },
  Spanish: { origin: "latinate", priority: 7 },
  Portuguese: { origin: "latinate", priority: 7 },
  Romanian: { origin: "latinate", priority: 7 },
  Catalan: { origin: "latinate", priority: 7 },

  // Greek
  "Ancient Greek": { origin: "greek", priority: 10 },
  Greek: { origin: "greek", priority: 9 },

  // Other
  Arabic: { origin: "arabic", priority: 8 },
  Hebrew: { origin: "hebrew", priority: 8 },
  Sanskrit: { origin: "sanskrit", priority: 8 },
  Persian: { origin: "persian", priority: 8 },
  "Proto-Indo-European": { origin: "proto-indo-european", priority: 3 },
  Hindi: { origin: "hindi", priority: 7 },
  Chinese: { origin: "chinese", priority: 7 },
  Japanese: { origin: "japanese", priority: 7 },
};

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const wordMap = new Map();
const csvText = fs.readFileSync("../data/etymology.csv", "utf-8");
const lines = csvText.split("\n");

// Only filter out obvious noise
// const affixPattern = /^-[a-z]|^[a-z]+-$|^-[a-z]+-$/; // Starts/ends with hyphen
const tooManyApostrophes = /.*'.*'.*/; // Multiple apostrophes (corrupted data)

let processed = 0;
let skipped = 0;
let skippedReasons = {
  notEnglish: 0,
  noRelatedLang: 0,
  noRelatedTerm: 0,
  emptyWord: 0,
  // isAffix: 0,
  multipleApostrophes: 0,
  hasSuffix: 0,
};

for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;

  const parts = line.split(",");
  if (parts.length < 7) {
    skipped++;
    skippedReasons.emptyWord++;
    continue;
  }

  let [
    termId,
    lang,
    term,
    relType,
    relatedTermId,
    relatedLang,
    relatedTerm,
    position,
  ] = parts;

  if (lang !== "English") {
    skipped++;
    skippedReasons.notEnglish++;
    continue;
  }

  if (term.startsWith('"')) {
    continue;
  }

  if (!relatedLang || relatedLang.trim() === "") {
    skipped++;
    skippedReasons.noRelatedLang++;
    continue;
  }

  if (
    !relatedTerm ||
    relatedTerm.trim() === "" ||
    relatedTerm.trim() === "," ||
    relatedTerm.trim() === '"'
  ) {
    skipped++;
    skippedReasons.noRelatedTerm++;
    continue;
  }

  if (relType === "has_suffix" || relType == "doublet_with") {
    skipped++;
    skippedReasons.hasSuffix++;
    continue;
  }

  if (relatedTerm.startsWith('"')) {
    relatedTerm = relatedTerm.split('"')[1];
  }

  const word = term.toLowerCase().trim();

  // Skip empty words
  if (!word) {
    skipped++;
    skippedReasons.emptyWord++;
    continue;
  }

  /*
  // Skip affixes that start or end with hyphens
  if (affixPattern.test(word)) {
    skipped++;
    skippedReasons.isAffix++;
    continue;
  }
  */

  // Skip words with multiple apostrophes (corrupted data)
  if (tooManyApostrophes.test(word)) {
    skipped++;
    skippedReasons.multipleApostrophes++;
    continue;
  }

  if (word.includes(" ")) {
    continue;
  }

  const originInfo = langToOrigin[relatedLang];
  const origin = originInfo ? originInfo.origin : "other";
  const priority = originInfo ? originInfo.priority : 1;

  if (wordMap.has(word)) {
    const existing = wordMap.get(word);
    const existingLangInfo = langToOrigin[existing.source_lang] || {
      priority: 0,
    };

    if (
      relType !== "has_prefix_with_root" &&
      relType !== "has_affix" &&
      priority > existingLangInfo.priority
    ) {
      existing.origin = capitalize(origin);
      existing.source_lang = relatedLang;
      existing.source_word = relatedTerm;
      existing.rel_type = relType;

      continue;
    }

    if (priority === existingLangInfo.priority) {
      if (existing.rel_type === "derived_from") {
        continue;
      }

      if (relType === "derived_from") {
        existing.origin = capitalize(origin);
        existing.source_lang = relatedLang;
        existing.source_word = relatedTerm;
        existing.rel_type = relType;

        continue;
      }

      if (relType === "has_prefix_with_root") {
        delete existing.origin;
        delete existing.source_lang;
        existing.source_word = relatedTerm;
        existing.rel_type = relType;

        continue;
      }

      if (relType === "has_affix") {
        delete existing.origin;
        delete existing.source_lang;
        existing.source_word = `${existing.source_word},${relatedTerm}`;
        existing.rel_type = relType;

        continue;
      }
    }
  } else {
    let includeSourceLangData = true;
    if (
      (relType === "inherited_from" ||
        relType === "has_prefix_with_root" ||
        relType === "has_affix") &&
      relatedLang === "English"
    ) {
      includeSourceLangData = false;
    }

    const entry = {
      word: word,
      source_word: relatedTerm,
      source_url: `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`,
      rel_type: relType,
    };

    if (includeSourceLangData) {
      entry.origin = capitalize(origin);
      entry.source_lang = relatedLang;
    }

    wordMap.set(word, entry);

    processed++;
  }
}

const words = Array.from(wordMap.values());

const output = {
  metadata: {
    totalWordCount: words.length,
    supportedLanguages: ["English"],
    source: "https://github.com/droher/etymology-db",
    generatedAt: new Date().toISOString(),
  },
  words,
};

fs.writeFileSync(
  "../data/words-etymology-db.json",
  JSON.stringify(output, null, 2),
);

console.log(`✓ Processed ${processed} unique words into words.json`);
console.log(`  Total words in output: ${words.length}`);
console.log(`\n📊 Skipped breakdown:`);
console.log(`  Not English: ${skippedReasons.notEnglish}`);
console.log(`  No related language: ${skippedReasons.noRelatedLang}`);
console.log(`  Multiple apostrophes: ${skippedReasons.multipleApostrophes}`);
console.log(`  Total skipped: ${skipped}`);
