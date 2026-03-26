const fs = require('fs');

const csvText = fs.readFileSync('data/etymology.csv', 'utf-8');
const lines = csvText.split('\n');
const wordMap = new Map();

const langToOrigin = {
  'Old English': { origin: 'germanic', priority: 10 },
  'Middle English': { origin: 'germanic', priority: 9 },
  'English': { origin: 'germanic', priority: 8 },
  'Proto-Germanic': { origin: 'germanic', priority: 7 },
  'German': { origin: 'germanic', priority: 6 },
  'Dutch': { origin: 'germanic', priority: 6 },
  'Old Norse': { origin: 'germanic', priority: 6 },
  
  'Latin': { origin: 'latinate', priority: 10 },
  'Old French': { origin: 'latinate', priority: 9 },
  'Middle French': { origin: 'latinate', priority: 8 },
  'French': { origin: 'latinate', priority: 7 },
  'Italian': { origin: 'latinate', priority: 7 },
  'Spanish': { origin: 'latinate', priority: 7 },
  
  'Ancient Greek': { origin: 'greek', priority: 10 },
  'Greek': { origin: 'greek', priority: 9 },
  
  'Arabic': { origin: 'arabic', priority: 8 },
  'Hebrew': { origin: 'hebrew', priority: 8 },
  'Sanskrit': { origin: 'sanskrit', priority: 8 },
  'Persian': { origin: 'persian', priority: 8 },
};

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  
  const parts = line.split(',');
  if (parts.length < 6) continue;
  
  const [termId, lang, term, relType, relatedTermId, relatedLang, relatedTerm] = parts;
  
  if (lang !== 'English') continue;
  
  if (!relType.includes('etymologically_related') && 
      !relType.includes('borrowed_from') && 
      !relType.includes('derived')) continue;
  
  if (!relatedLang || relatedLang.trim() === '') continue;
  
  const word = term.toLowerCase().trim();
  if (!/^[a-z]+$/.test(word)) continue;
  
  const originInfo = langToOrigin[relatedLang];
  const origin = originInfo ? originInfo.origin : 'other';
  const priority = originInfo ? originInfo.priority : 1;
  
  if (wordMap.has(word)) {
    const existing = wordMap.get(word);
    const existingLangInfo = langToOrigin[existing.source_lang] || { priority: 0 };
    
    if (priority > existingLangInfo.priority) {
      existing.origin = capitalize(origin);
      existing.source_lang = relatedLang;
      existing.source_word = relatedTerm || '';
    }
  } else {
    wordMap.set(word, {
      word: word,
      origin: capitalize(origin),
      source_lang: relatedLang,
      source_word: relatedTerm || '',
      source_url: 'https://github.com/droher/etymology-db'
    });
  }
}

const words = Array.from(wordMap.values());
fs.writeFileSync('data/words.json', JSON.stringify(words, null, 2));
console.log(`✓ Processed ${words.length} words into words.json`);