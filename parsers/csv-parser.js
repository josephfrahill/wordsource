function parseEtymologyCSV(csvText) {
  const lines = csvText.split('\n');
  const wordMap = new Map();
  
  // Language mapping with priority (higher = prefer this)
  const langToOrigin = {
    // Germanic - ordered by preference
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
  
  let parsed = 0;
  let skipReasons = {
    notEnglish: 0,
    notEtymology: 0,
    notSimpleWord: 0,
    unknownLang: 0,
    emptyRelatedLang: 0
  };
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const parts = line.split(',');
    
    if (parts.length < 6) {
      continue;
    }
    
    const termId = parts[0];
    const lang = parts[1];
    const term = parts[2];
    const relType = parts[3];
    const relatedTermId = parts[4];
    const relatedLang = parts[5];
    const relatedTerm = parts[6] || ''; // The actual source word!
    
    // Only process English words
    if (lang !== 'English') {
      skipReasons.notEnglish++;
      continue;
    }
    
    // Only track etymology relationships
    if (!relType.includes('etymologically_related') && 
        !relType.includes('borrowed_from') && 
        !relType.includes('derived')) {
      skipReasons.notEtymology++;
      continue;
    }
    
    // Skip if no related language
    if (!relatedLang || relatedLang.trim() === '') {
      skipReasons.emptyRelatedLang++;
      continue;
    }
    
    const word = term.toLowerCase().trim();
    
    // Skip if not a simple word (only lowercase letters)
    if (!/^[a-z]+$/.test(word)) {
      skipReasons.notSimpleWord++;
      continue;
    }
    
    // Get origin info
    const originInfo = langToOrigin[relatedLang];
    if (!originInfo) {
      skipReasons.unknownLang++;
      // Still track it as 'other'
      if (!wordMap.has(word)) {
        wordMap.set(word, {
          word: word,
          origin: 'Other', // Title case
          source_lang: relatedLang,
          source_word: relatedTerm,
          rel_type: relType,
          source_url: 'https://github.com/clararaubertas/etymwn',
          term_id: termId,
          notes: null
        });
        parsed++;
      }
      continue;
    }
    
    const origin = originInfo.origin;
    const priority = originInfo.priority;
    
    if (wordMap.has(word)) {
      const existing = wordMap.get(word);
      const existingLangInfo = langToOrigin[existing.source_lang] || { priority: 0 };
      
      // Replace if new origin has higher priority (prefer Old English over Proto-Germanic)
      if (priority > existingLangInfo.priority) {
        existing.origin = capitalize(origin);
        existing.source_lang = relatedLang;
        existing.source_word = relatedTerm;
        existing.rel_type = relType;
      }
    } else {
      wordMap.set(word, {
        word: word,
        origin: capitalize(origin), // Title case
        source_lang: relatedLang,
        source_word: relatedTerm, // NEW: the actual source word
        rel_type: relType,
        source_url: 'https://github.com/clararaubertas/etymwn',
        term_id: termId,
        notes: null
      });
      parsed++;
    }
  }
  
  console.log('Skip reasons:', skipReasons);
  console.log(`CSV parsing: ${parsed} words parsed`);
  return Array.from(wordMap.values());
}