const initDB = () => {
  const request = indexedDB.open('EtymologyDB', 1);

  request.onupgradeneeded = (e) => {
    console.log('Creating database for first time...');
    const db = e.target.result;

    if (!db.objectStoreNames.contains('words')) {
      db.createObjectStore('words', { keyPath: 'word' });
    }
  };

  request.onsuccess = async (e) => {
    db = e.target.result;
    console.log('Database opened successfully');

    await seedDatabase(); // 👈 do it here instead

    const tx = db.transaction('words', 'readonly');
    const store = tx.objectStore('words');
    const countRequest = store.count();

    countRequest.onsuccess = () => {
      console.log(`Database contains ${countRequest.result} words`);
    };
  };

  request.onerror = (e) => {
    console.error('Database error:', e);
  };
};

async function seedDatabase() {
  const response = await fetch(chrome.runtime.getURL('data/seed-words.json'));
  const words = await response.json();

  return new Promise((resolve, reject) => {

    const tx = db.transaction('words', 'readwrite');
    const store = tx.objectStore('words');

    words.forEach(wordData => {
      store.put(wordData); // use put to avoid duplicate crashes
    });

    tx.oncomplete = () => {
      console.log(`✓ Loaded ${words.length} words into database`);
      resolve();
    };

    tx.onerror = (e) => {
      console.error('Seeding failed:', e);
      reject(e);
    };
  });
}

initDB();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'lookup') {
    console.log('Looking up word:', request.word);
    lookupWord(request.word).then(result => {
      console.log('Lookup result:', result);
      sendResponse(result);
    });
    return true;
  }
});

async function lookupWord(word) {
  return new Promise((resolve) => {
    if (!db) {
      console.error('Database not initialized!');
      resolve({ word, origin: 'database not ready', error: true });
      return;
    }
    
    const normalizedWord = word.toLowerCase().trim();
    console.log('Searching for:', normalizedWord);
    
    const tx = db.transaction('words', 'readonly');
    const store = tx.objectStore('words');
    const request = store.get(normalizedWord);
    
    request.onsuccess = () => {
      console.log('DB get result:', request.result);
      if (request.result) {
        resolve(request.result);
      } else {
        resolve({ word, origin: 'not found', error: true });
      }
    };
    
    request.onerror = (e) => {
      console.error('DB lookup error:', e);
      resolve({ word, origin: 'lookup error', error: true });
    };
  });
}