// background.js
let db;

const DB_VERSION = 3; // bumped from 2 to add missing_words store

const initDB = () => {
  const request = indexedDB.open('EtymologyDB', DB_VERSION);

  request.onupgradeneeded = (e) => {
    const database = e.target.result;
    const oldVersion = e.oldVersion;
    console.log(`Upgrading DB from version ${oldVersion} to ${DB_VERSION}`);

    if (!database.objectStoreNames.contains('words')) {
      const store = database.createObjectStore('words', { keyPath: 'word' });
      store.createIndex('origin', 'origin', { unique: false });
    }

    // New in v3
    if (!database.objectStoreNames.contains('missing_words')) {
      const missingStore = database.createObjectStore('missing_words', { keyPath: 'word' });
      missingStore.createIndex('count', 'count', { unique: false });
      missingStore.createIndex('firstSeen', 'firstSeen', { unique: false });
      console.log('Created missing_words store');
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
    const data = await response.json();

    const words = data.words || data;
    const metadata = data.metadata || {};

    console.log(`Loaded ${words.length} words from JSON`);
    if (metadata.generatedAt) {
      console.log(`Data generated: ${metadata.generatedAt}`);
    }

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

// ─── Missing words tracking ───────────────────────────────────────────────────

function trackMissingWord(word) {
  if (!db) return;

  // Don't track very short words, numbers, or obvious noise
  if (!word || word.length < 3) return;
  if (!/^[a-z'-]+$/i.test(word)) return;

  const tx = db.transaction('missing_words', 'readwrite');
  const store = tx.objectStore('missing_words');

  const getReq = store.get(word);
  getReq.onsuccess = () => {
    if (getReq.result) {
      // Already tracked — increment count
      const existing = getReq.result;
      existing.count += 1;
      existing.lastSeen = new Date().toISOString();
      store.put(existing);
    } else {
      // First time seeing this word
      store.put({
        word,
        count: 1,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
      });
    }
  };
}

async function getMissingWordsCount() {
  return new Promise((resolve) => {
    if (!db) { resolve(0); return; }
    const tx = db.transaction('missing_words', 'readonly');
    const store = tx.objectStore('missing_words');
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(0);
  });
}

async function exportMissingWords() {
  return new Promise((resolve, reject) => {
    if (!db) { reject(new Error('DB not ready')); return; }

    const tx = db.transaction('missing_words', 'readonly');
    const store = tx.objectStore('missing_words');
    const req = store.getAll();

    req.onsuccess = () => {
      const words = req.result;

      // Sort by count descending so highest-priority words are at the top
      words.sort((a, b) => b.count - a.count);

      const output = {
        metadata: {
          totalMissingWords: words.length,
          exportedAt: new Date().toISOString(),
        },
        words,
      };

      const json = JSON.stringify(output, null, 2);

      // MV3 service workers don't have URL.createObjectURL — use a data URI instead
      const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);

      console.log(`Exporting ${words.length} missing words...`);

      chrome.downloads.download(
        { url: dataUrl, filename: 'words_missing.json', saveAs: true },
        (downloadId) => {
          if (chrome.runtime.lastError) {
            console.error('Download failed:', chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
          } else {
            console.log(`Download started, id: ${downloadId}`);
            resolve({ downloadId, count: words.length });
          }
        }
      );
    };

    req.onerror = () => reject(new Error('Failed to read missing_words store'));
  });
}

async function clearMissingWords() {
  return new Promise((resolve, reject) => {
    if (!db) { reject(new Error('DB not ready')); return; }
    const tx = db.transaction('missing_words', 'readwrite');
    const req = tx.objectStore('missing_words').clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(new Error('Failed to clear missing_words store'));
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function removeDiacritics(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Normalise curly/smart apostrophes to straight so contraction map keys match
function normaliseApostrophes(str) {
  return str.replace(/[\u2018\u2019\u02bc]/g, "'");
}

// ─── Main lookup ──────────────────────────────────────────────────────────────

const CONTRACTION_MAP = {
  "i'm": "i", "i've": "i", "i'd": "i", "i'll": "i",
  "you're": "you", "you've": "you", "you'd": "you", "you'll": "you",
  "it's": "it", "it've": "it", "it'd": "it", "it'll": "it",
  "we're": "we", "we've": "we", "we'd": "we", "we'll": "we",
  "they're": "they", "they've": "they", "they'd": "they", "they'll": "they",
  "isn't": "is", "aren't": "are", "wasn't": "was", "weren't": "were",
  "haven't": "have", "hasn't": "has", "hadn't": "had",
  "won't": "will", "wouldn't": "would", "wouldn't've": "would",
  "shouldn't": "should", "shouldn't've": "should",
  "couldn't": "could", "couldn't've": "could",
  "don't": "do", "doesn't": "does", "didn't": "did",
  "can't": "can", "shan't": "shall",
};

async function lookupWord(word) {
  return new Promise((resolve) => {
    if (!db) {
      resolve({ word, origin: 'database not ready', error: true });
      return;
    }

    const cleanWord = normaliseApostrophes(word.toLowerCase().trim());
    const normalizedWord = removeDiacritics(cleanWord);

    const tx = db.transaction('words', 'readonly');
    const store = tx.objectStore('words');

    // Contractions: always resolve via base word so tooltip shows the arrow,
    // even when the contraction itself (e.g. "i'm" -> "i") exists in the DB.
    if (cleanWord.includes("'")) {
      const baseWord = CONTRACTION_MAP[cleanWord] || cleanWord.split("'")[0];
      const req = store.get(baseWord);
      req.onsuccess = () => {
        if (req.result) {
          resolve({ ...req.result, word, base_form: baseWord });
        } else {
          doLookup();
        }
      };
      req.onerror = () => doLookup();
      return;
    }

    doLookup();

    function doLookup() {
      const request = store.get(cleanWord);

      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result);
        } else {
          const normalizedRequest = store.get(normalizedWord);
          normalizedRequest.onsuccess = () => {
            if (normalizedRequest.result) {
              resolve(normalizedRequest.result);
            } else {
              tryBaseForm(cleanWord, normalizedWord, store, (result) => {
                if (result.error) {
                  trackMissingWord(cleanWord);
                }
                resolve(result);
              }, word);
            }
          };
          normalizedRequest.onerror = () => {
            tryBaseForm(cleanWord, normalizedWord, store, (result) => {
              if (result.error) {
                trackMissingWord(cleanWord);
              }
              resolve(result);
            }, word);
          };
        }
      };

      request.onerror = () => {
        resolve({ word, origin: 'lookup error', error: true });
      };
    }
  });
}

function tryBaseForm(cleanWord, normalizedWord, store, resolve, originalWord) {
  const attempts = [];


  continueWithSuffixes();

  function continueWithSuffixes() {
    if (cleanWord.endsWith('ly')) {
      attempts.push(cleanWord.slice(0, -2));
      attempts.push(cleanWord.slice(0, -2) + 'le');
    }

    if (cleanWord.endsWith('ed')) {
      attempts.push(cleanWord.slice(0, -1));
      attempts.push(cleanWord.slice(0, -2));
      if (cleanWord.length > 3) {
        const lastTwo = cleanWord.slice(-4, -2);
        if (lastTwo[0] === lastTwo[1]) attempts.push(cleanWord.slice(0, -3));
      }
      if (cleanWord.endsWith('ied')) attempts.push(cleanWord.slice(0, -3) + 'y');
    }

    if (cleanWord.endsWith('ing')) {
      attempts.push(cleanWord.slice(0, -3));
      if (cleanWord.length > 4) {
        const lastTwo = cleanWord.slice(-5, -3);
        if (lastTwo[0] === lastTwo[1]) attempts.push(cleanWord.slice(0, -4));
      }
      if (cleanWord.endsWith('ying')) attempts.push(cleanWord.slice(0, -4) + 'y');
    }

    if (cleanWord.endsWith('s') && !cleanWord.endsWith('ss')) {
      const withoutS = cleanWord.slice(0, -1);
      attempts.push(withoutS);
      if (withoutS.endsWith('er')) attempts.push(withoutS.slice(0, -2));
      if (withoutS.endsWith('or')) attempts.push(withoutS.slice(0, -2));
      if (cleanWord.endsWith('es')) attempts.push(cleanWord.slice(0, -2));
      if (cleanWord.endsWith('ies')) attempts.push(cleanWord.slice(0, -3) + 'y');
    }

    if (cleanWord.endsWith('er') && !cleanWord.endsWith('eer')) {
      attempts.push(cleanWord.slice(0, -2));
      if (cleanWord.length > 3) {
        const lastTwo = cleanWord.slice(-4, -2);
        if (lastTwo[0] === lastTwo[1]) attempts.push(cleanWord.slice(0, -3));
      }
    }

    if (cleanWord.endsWith('or')) attempts.push(cleanWord.slice(0, -2));

    if (cleanWord.endsWith('est')) {
      attempts.push(cleanWord.slice(0, -3));
      if (cleanWord.length > 4) {
        const lastTwo = cleanWord.slice(-5, -3);
        if (lastTwo[0] === lastTwo[1]) attempts.push(cleanWord.slice(0, -4));
      }
    } else if (cleanWord.endsWith('er')) {
      const base = cleanWord.slice(0, -2);
      if (!attempts.includes(base)) {
        attempts.push(base);
        if (cleanWord.length > 3) {
          const lastTwo = cleanWord.slice(-4, -2);
          if (lastTwo[0] === lastTwo[1]) attempts.push(cleanWord.slice(0, -3));
        }
      }
    }

    tryNextAttempt(0);
  }

  function tryNextAttempt(index) {
    if (index >= attempts.length) {
      resolve({ word: originalWord, origin: 'not found', error: true });
      return;
    }

    const baseForm = attempts[index];
    const req = store.get(baseForm);

    req.onsuccess = () => {
      if (req.result) {
        resolve({ ...req.result, word: originalWord, base_form: baseForm });
      } else {
        const normalizedBase = removeDiacritics(baseForm);
        if (normalizedBase !== baseForm) {
          const normalizedReq = store.get(normalizedBase);
          normalizedReq.onsuccess = () => {
            if (normalizedReq.result) {
              resolve({ ...normalizedReq.result, word: originalWord, base_form: normalizedBase });
            } else {
              tryNextAttempt(index + 1);
            }
          };
          normalizedReq.onerror = () => tryNextAttempt(index + 1);
        } else {
          tryNextAttempt(index + 1);
        }
      }
    };

    req.onerror = () => tryNextAttempt(index + 1);
  }
}

// ─── Init & message handling ──────────────────────────────────────────────────

initDB();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'lookup') {
    lookupWord(request.word).then(result => sendResponse(result));
    return true;
  }

  if (request.action === 'getMissingCount') {
    getMissingWordsCount().then(count => sendResponse({ count }));
    return true;
  }

  if (request.action === 'exportMissingWords') {
    exportMissingWords()
      .then(result => sendResponse({ success: true, ...result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'clearMissingWords') {
    clearMissingWords()
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'lookup-word') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'lookupSelection' });
    });
  }
});