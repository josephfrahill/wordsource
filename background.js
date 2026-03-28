// background.js
let db;

const initDB = () => {
  const request = indexedDB.open('EtymologyDB', 2); // Increment version to trigger upgrade

  request.onupgradeneeded = (e) => {
    console.log('Creating database for first time...');
    const database = e.target.result;

    if (!database.objectStoreNames.contains('words')) {
      const store = database.createObjectStore('words', { keyPath: 'word' });
      store.createIndex('origin', 'origin', { unique: false });
    }
  };

  request.onsuccess = async (e) => {
    db = e.target.result;
    console.log('Database opened successfully');

    const tx = db.transaction('words', 'readonly');
    const store = tx.objectStore('words');
    const countRequest = store.count();

    countRequest.onsuccess = async () => {
      const count = countRequest.result;
      console.log(`Database contains ${count} words`);
      
      if (count === 0) {
        console.log('Database is empty, seeding...');
        await seedDatabase();
      }
    };
  };

  request.onerror = (e) => {
    console.error('Database error:', e);
  };
};

async function seedDatabase() {
  try {
    console.log('Fetching word data...');
    const response = await fetch(chrome.runtime.getURL('data/words.json'));
    const words = await response.json();
    
    console.log(`Loaded ${words.length} words from JSON`);

    return new Promise((resolve, reject) => {
      const tx = db.transaction('words', 'readwrite');
      const store = tx.objectStore('words');

      words.forEach(wordData => {
        store.put(wordData);
      });

      tx.oncomplete = () => {
        console.log(`✓ Successfully loaded ${words.length} words into database`);
        resolve();
      };

      tx.onerror = (e) => {
        reject(e);
      };
    });
  } catch (error) {
    console.error('Failed to seed database:', error);
  }
}

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

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

initDB();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'lookup') {
    lookupWord(request.word).then(result => {
      sendResponse(result);
    });
    return true;
  }
});

async function lookupWord(word) {
  return new Promise((resolve) => {
    if (!db) {
      resolve({ word, origin: 'database not ready', error: true });
      return;
    }
    
    const normalizedWord = word.toLowerCase().trim();
    
    const tx = db.transaction('words', 'readonly');
    const store = tx.objectStore('words');
    const request = store.get(normalizedWord);
    
    request.onsuccess = () => {
      if (request.result) {
        resolve(request.result);
      } else {
        // Try to find base form
        tryBaseForm(normalizedWord, store, resolve, word);
      }
    };
    
    request.onerror = (e) => {
      resolve({ word, origin: 'lookup error', error: true });
    };
  });
}

function tryBaseForm(word, store, resolve, originalWord) {
  const attempts = [];
  
  // Past tense/participle: walked -> walk, expelled -> expel
  if (word.endsWith('ed')) {
    attempts.push(word.slice(0, -1));      // disgraced -> disgrace
    attempts.push(word.slice(0, -2));      // helped -> help
    
    // Handle doubled consonants: expelled -> expel, stopped -> stop
    if (word.length > 3) {
      const lastTwo = word.slice(-4, -2);
      if (lastTwo[0] === lastTwo[1]) {  // Double letter before 'ed'
        attempts.push(word.slice(0, -3)); // expelled -> expel
      }
    }
    
    if (word.endsWith('ied')) {
      attempts.push(word.slice(0, -3) + 'y'); // studied -> study
    }
  }
  
  // Present participle: walking -> walk, expelling -> expel
  if (word.endsWith('ing')) {
    attempts.push(word.slice(0, -3));      // helping -> help
    
    // Handle doubled consonants: expelling -> expel
    if (word.length > 4) {
      const lastTwo = word.slice(-5, -3);
      if (lastTwo[0] === lastTwo[1]) {
        attempts.push(word.slice(0, -4)); // expelling -> expel
      }
    }
    
    if (word.endsWith('ying')) {
      attempts.push(word.slice(0, -4) + 'y'); // studying -> study
    }
  }
  
  // Rest stays the same...
  if (word.endsWith('s')) {
    attempts.push(word.slice(0, -1));
    if (word.endsWith('es')) {
      attempts.push(word.slice(0, -2));
    }
    if (word.endsWith('ies')) {
      attempts.push(word.slice(0, -3) + 'y');
    }
  }
  
  if (word.endsWith('er') || word.endsWith('est')) {
    const base = word.endsWith('est') ? word.slice(0, -3) : word.slice(0, -2);
    attempts.push(base);
    attempts.push(base.slice(0, -1));
  }
  
  // Try each potential base form
  tryNextAttempt(0);
  
  function tryNextAttempt(index) {
    if (index >= attempts.length) {
      resolve({ word: originalWord, origin: 'not found', error: true });
      return;
    }
    
    const baseForm = attempts[index];
    const req = store.get(baseForm);
    
    req.onsuccess = () => {
      if (req.result) {
        const result = { ...req.result };
        result.word = originalWord;
        result.base_form = baseForm;
        resolve(result);
      } else {
        tryNextAttempt(index + 1);
      }
    };
    
    req.onerror = () => {
      tryNextAttempt(index + 1);
    };
  }
}

chrome.commands.onCommand.addListener((command) => {
  if (command === "lookup-word") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "lookupSelection"
      });
    });
  }
});