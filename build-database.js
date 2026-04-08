const fs = require('fs');

const csvText = fs.readFileSync('data/etymology.csv', 'utf-8');
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

// Expanded relationship types
const validRelTypes = [
  'etymologically_related',
  'borrowed_from',
  'derived',
  'compound_of',
  'inherited_from',
  'has_derived_form',
  'has_affix',           // ← NEW: catches plucky, procedural
  'has_prefix_with_root', // ← NEW: catches tactful
  'has_suffix'           // ← NEW: catches more affixed words
];

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

let processed = 0;
let skipped = 0;

for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  
  const parts = line.split(',');
  if (parts.length < 6) {
    skipped++;
    continue;
  }
  
  const [termId, lang, term, relType, relatedTermId, relatedLang, relatedTerm] = parts;
  
  // Only English words
  if (lang !== 'English') {
    skipped++;
    continue;
  }
  
  // Check if valid relationship type
  const hasValidRelType = validRelTypes.some(type => relType.includes(type));
  if (!hasValidRelType) {
    skipped++;
    continue;
  }

  // Skip if no related language (but this is less critical now)
  if (!relatedLang || relatedLang.trim() === '') {
    skipped++;
    continue;
  }
  
  const word = term.toLowerCase().trim();
  
  // More permissive regex: allow letters, hyphens, apostrophes
  // But still exclude numbers and most special characters
  if (!/^[a-z'-]+$/.test(word)) {
    skipped++;
    continue;
  }
  
  // Skip very short words (likely noise)
  if (word.length < 2) {
    skipped++;
    continue;
  }
  
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
fs.writeFileSync('data/words.json', JSON.stringify(words, null, 2));

console.log(`✓ Processed ${processed} unique words into words.json`);
console.log(`  Total words in output: ${words.length}`);
console.log(`  Skipped entries: ${skipped}`);