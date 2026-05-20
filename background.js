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

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function removeDiacritics(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
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
    
     const normalizedWord = removeDiacritics(word.toLowerCase().trim());
    
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
  
  // Contractions: I'm -> I, it's -> it, isn't -> is not
  if (word.includes("'")) {
    const contractionMap = {
      "i'm": "i",      
      "i've": "i",
      "i'd": "i",
      "i'll": "i",
      "you're": "you",
      "you've": "you",
      "you'd": "you",
      "you'll": "you",
      "it's": "it",  
      "it've": "it",
      "it'd": "it",
      "it'll": "it",
      "we're": "we",
      "we've": "we",
      "we'd": "we",
      "we'll": "we",
      "they're": "they",
      "they've": "they",
      "they'd": "they",
      "they'll": "they",
      "isn't": "is",
      "aren't": "are",
      "wasn't": "was",
      "weren't": "were",
      "haven't": "have",
      "hasn't": "has",
      "hadn't": "had",
      "won't": "will",
      "wouldn't": "would",
      "wouldn't've": "would",
      "shouldn't": "should",
      "shouldn't've": "should",
      "couldn't": "could",
      "couldn't've": "could",      
      "don't": "do",
      "doesn't": "does",
      "didn't": "did",
      "can't": "can",
      "shan't": "shall"
    };
    
    const base = contractionMap[word];
    if (base) {
      attempts.push(base);
    } else {
      // Generic: strip everything after apostrophe
      attempts.push(word.split("'")[0]);
    }
  }
  
  // Generate all possible base forms by removing suffixes
  
  // First, try single suffix removal
  
  // Adverbs: irregularly -> irregular, quickly -> quick
  if (word.endsWith('ly')) {
    attempts.push(word.slice(0, -2));       // quickly -> quick
    attempts.push(word.slice(0, -2) + 'le'); // gently -> gentle
  }
  
  // Past tense/participle: walked -> walk, expelled -> expel
  if (word.endsWith('ed')) {
    attempts.push(word.slice(0, -1));      // disgraced -> disgrace
    attempts.push(word.slice(0, -2));      // helped -> help
    
    // Handle doubled consonants: expelled -> expel, stopped -> stop
    if (word.length > 3) {
      const lastTwo = word.slice(-4, -2);
      if (lastTwo[0] === lastTwo[1]) {
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
  
  // Plurals/third person: reviewers -> reviewer, dogs -> dog
  if (word.endsWith('s') && !word.endsWith('ss')) {  // Don't strip 'glass' -> 'glas'
    const withoutS = word.slice(0, -1);
    attempts.push(withoutS);               // reviewers -> reviewer
    
    // Now try removing -er/-or from that: reviewer -> review
    if (withoutS.endsWith('er')) {
      attempts.push(withoutS.slice(0, -2)); // reviewer -> review
    }
    if (withoutS.endsWith('or')) {
      attempts.push(withoutS.slice(0, -2)); // actor -> act
    }
    
    if (word.endsWith('es')) {
      attempts.push(word.slice(0, -2));    // churches -> church
    }
    
    if (word.endsWith('ies')) {
      attempts.push(word.slice(0, -3) + 'y'); // babies -> baby
    }
  }
  
  // Agent nouns: reviewer -> review, actor -> act
  if (word.endsWith('er') && !word.endsWith('eer')) {  // Don't strip 'peer' -> 'p'
    attempts.push(word.slice(0, -2));      // reviewer -> review
    // Handle doubling: runner -> run
    if (word.length > 3) {
      const lastTwo = word.slice(-4, -2);
      if (lastTwo[0] === lastTwo[1]) {
        attempts.push(word.slice(0, -3)); // runner -> run
      }
    }
  }
  
  if (word.endsWith('or')) {
    attempts.push(word.slice(0, -2));      // actor -> act
  }
  
  // Comparative/superlative: bigger -> big, biggest -> big
  if (word.endsWith('est')) {
    attempts.push(word.slice(0, -3));
    // Handle doubling: biggest -> big
    if (word.length > 4) {
      const lastTwo = word.slice(-5, -3);
      if (lastTwo[0] === lastTwo[1]) {
        attempts.push(word.slice(0, -4));
      }
    }
  } else if (word.endsWith('er')) {
    // Only if not already handled above
    const base = word.slice(0, -2);
    if (!attempts.includes(base)) {
      attempts.push(base);
      // Handle doubling
      if (word.length > 3) {
        const lastTwo = word.slice(-4, -2);
        if (lastTwo[0] === lastTwo[1]) {
          attempts.push(word.slice(0, -3));
        }
      }
    }
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