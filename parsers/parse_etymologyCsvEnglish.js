const fs = require('fs');

const csvText = fs.readFileSync('../data/etymology.csv', 'utf-8');
const lines = csvText.split('\n');
const wordMap = new Map();

const langToOrigin = {
  // Germanic
  'Old English': { origin: 'germanic', priority: 10 },
  'Middle English': { origin: 'germanic', priority: 9 },
  'English': { origin: 'germanic', priority: 8 },
  'Proto-Germanic': { origin: 'germanic', priority: 7 },
  'German': { origin: 'germanic', priority: 6 },
  'Dutch': { origin: 'germanic', priority: 6 },
  'Old Norse': { origin: 'germanic', priority: 6 },
  'Swedish': { origin: 'germanic', priority: 5 },
  'Danish': { origin: 'germanic', priority: 5 },
  'Norwegian': { origin: 'germanic', priority: 5 },
  'Icelandic': { origin: 'germanic', priority: 5 },
  'Gothic': { origin: 'germanic', priority: 5 },
  
  // Latinate (Romance)
  'Latin': { origin: 'latinate', priority: 10 },
  'Old French': { origin: 'latinate', priority: 9 },
  'Middle French': { origin: 'latinate', priority: 8 },
  'French': { origin: 'latinate', priority: 7 },
  'Italian': { origin: 'latinate', priority: 7 },
  'Spanish': { origin: 'latinate', priority: 7 },
  'Portuguese': { origin: 'latinate', priority: 7 },
  'Romanian': { origin: 'latinate', priority: 7 },
  'Catalan': { origin: 'latinate', priority: 7 },
  
  // Greek
  'Ancient Greek': { origin: 'greek', priority: 10 },
  'Greek': { origin: 'greek', priority: 9 },
  
  // Other
  'Arabic': { origin: 'arabic', priority: 8 },
  'Hebrew': { origin: 'hebrew', priority: 8 },
  'Sanskrit': { origin: 'sanskrit', priority: 8 },
  'Persian': { origin: 'persian', priority: 8 },
  'Proto-Indo-European': { origin: 'proto-indo-european', priority: 3 },
  'Hindi': { origin: 'hindi', priority: 7 },
  'Chinese': { origin: 'chinese', priority: 7 },
  'Japanese': { origin: 'japanese', priority: 7 },
};

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Only filter out obvious noise
const affixPattern = /^-[a-z]|^[a-z]+-$|^-[a-z]+-$/; // Starts/ends with hyphen
const tooManyApostrophes = /.*'.*'.*/; // Multiple apostrophes (corrupted data)

let processed = 0;
let skipped = 0;
let skippedReasons = {
  notEnglish: 0,
  noRelatedLang: 0,
  emptyWord: 0,
  tooShort: 0,
  isAffix: 0,
  multipleApostrophes: 0,
};

for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  
  const parts = line.split(',');
  if (parts.length < 6) {
    skipped++;
    skippedReasons.emptyWord++;
    continue;
  }
  
  const [termId, lang, term, relType, relatedTermId, relatedLang, relatedTerm] = parts;
  
  // Only English words
  if (lang !== 'English') {
    skipped++;
    skippedReasons.notEnglish++;
    continue;
  }

  // Skip if no related language (can't determine origin)
  if (!relatedLang || relatedLang.trim() === '') {
    skipped++;
    skippedReasons.noRelatedLang++;
    continue;
  }
  
  const word = term.toLowerCase().trim();
  
  // Skip empty words
  if (!word) {
    skipped++;
    skippedReasons.emptyWord++;
    continue;
  }
  
  // Skip affixes that start or end with hyphens
  if (affixPattern.test(word)) {
    skipped++;
    skippedReasons.isAffix++;
    continue;
  }
  
  // Skip words with multiple apostrophes (corrupted data)
  if (tooManyApostrophes.test(word)) {
    skipped++;
    skippedReasons.multipleApostrophes++;
    continue;
  }
  
  // Skip empty or whitespace-only words
  // Allow single letters like 'a', 'i' which are valid English words
  if (word.length < 1) {
    skipped++;
    skippedReasons.tooShort++;
    continue;
  }
  
  // Calculate origin and priority BEFORE using them
  const originInfo = langToOrigin[relatedLang];
  const origin = originInfo ? originInfo.origin : 'other';
  const priority = originInfo ? originInfo.priority : 1;
  
  if (wordMap.has(word)) {
    const existing = wordMap.get(word);
    const existingLangInfo = langToOrigin[existing.source_lang] || { priority: 0 };
    
    // Replace if new origin has higher priority
    if (priority > existingLangInfo.priority) {
      existing.origin = capitalize(origin);
      existing.source_lang = relatedLang;
      existing.source_word = relatedTerm || '';
      existing.rel_type = relType;
    }
  } else {
    wordMap.set(word, {
      word: word,
      origin: capitalize(origin),
      source_lang: relatedLang,
      source_word: relatedTerm || '',
      source_url: 'https://github.com/droher/etymology-db',
      rel_type: relType
    });
    processed++;
  }
}

const words = Array.from(wordMap.values());

// Create output with metadata
const output = {
  metadata: {
    totalWordCount: words.length,
    supportedLanguages: ['English'],
    source: 'https://github.com/droher/etymology-db',
    generatedAt: new Date().toISOString()
  },
  words: words
};

fs.writeFileSync('../data/words.json', JSON.stringify(output, null, 2));

console.log(`✓ Processed ${processed} unique words into words.json`);
console.log(`  Total words in output: ${words.length}`);
console.log(`\n📊 Skipped breakdown:`);
console.log(`  Not English: ${skippedReasons.notEnglish}`);
console.log(`  No related language: ${skippedReasons.noRelatedLang}`);
console.log(`  Is affix: ${skippedReasons.isAffix}`);
console.log(`  Multiple apostrophes: ${skippedReasons.multipleApostrophes}`);
console.log(`  Too short: ${skippedReasons.tooShort}`);
console.log(`  Total skipped: ${skipped}`);