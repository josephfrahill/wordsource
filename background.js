import {
  trackMissingWord,
  getMissingWordsCount,
  exportMissingWords,
  clearMissingWords,
} from "./missingWords.js";
import { normaliseApostrophes } from "./utils.js";
import {
  DEBUG,
  CONTRACTION_MAP,
  IRREGULAR_PAST_MAP,
  IRREGULAR_PARTICIPLE_MAP,
} from "./constants/constants.js";

let db;

const DB_VERSION = 1;

const initDB = () => {
  const request = indexedDB.open("EtymologyDB", DB_VERSION);

  request.onupgradeneeded = (e) => {
    const database = e.target.result;
    const oldVersion = e.oldVersion;

    if (DEBUG) {
      console.log(`Upgrading DB from version ${oldVersion} to ${DB_VERSION}`);
    }

    if (!database.objectStoreNames.contains("words")) {
      const store = database.createObjectStore("words", { keyPath: "word" });
      store.createIndex("origin", "origin", { unique: false });
    }

    if (!database.objectStoreNames.contains("missing_words")) {
      const missingStore = database.createObjectStore("missing_words", {
        keyPath: "word",
      });
      missingStore.createIndex("count", "count", { unique: false });
      missingStore.createIndex("firstSeen", "firstSeen", { unique: false });

      if (DEBUG) {
        console.log("Created missing_words store");
      }
    }
  };

  request.onsuccess = async (e) => {
    db = e.target.result;

    if (DEBUG) {
      console.log("Database opened successfully");
    }

    const tx = db.transaction("words", "readonly");
    const store = tx.objectStore("words");
    const countRequest = store.count();

    countRequest.onsuccess = async () => {
      const count = countRequest.result;
      if (DEBUG) {
        console.log(`Database contains ${count} words`);
      }

      if (count === 0) {
        if (DEBUG) {
          console.log("Database is empty, seeding...");
        }

        await seedDatabase();
      }
    };
  };

  request.onerror = (e) => {
    console.error("Database error:", e);
  };
};

async function seedDatabase() {
  try {
    if (DEBUG) {
      console.log("Fetching word data...");
    }

    const response = await fetch(
      chrome.runtime.getURL("data/words-etymology-db.json"),
    );
    const data = await response.json();

    const words = data.words || data;
    const metadata = data.metadata || {};

    if (DEBUG) {
      console.log(`Loaded ${words.length} words from JSON`);
      if (metadata.generatedAt) {
        console.log(`Data generated: ${metadata.generatedAt}`);
      }
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction("words", "readwrite");
      const store = tx.objectStore("words");

      words.forEach((wordData) => {
        store.put(wordData);
      });

      tx.oncomplete = () => {
        if (DEBUG) {
          console.log(
            `✓ Successfully loaded ${words.length} words into database`,
          );
        }

        resolve();
      };

      tx.onerror = (e) => {
        reject(e);
      };
    });
  } catch (error) {
    console.error("Failed to seed database:", error);
  }
}

// ─── DB Readiness ─────────────────────────────────────────────────────────────

function waitForDB(timeout = 5000, interval = 50) {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);
    const start = Date.now();
    const poll = setInterval(() => {
      if (db) {
        clearInterval(poll);
        resolve(db);
      } else if (Date.now() - start > timeout) {
        clearInterval(poll);
        reject(new Error("DB init timed out"));
      }
    }, interval);
  });
}

// ─── IndexedDB Helpers ────────────────────────────────────────────────────────

/**
 * Promisify IndexedDB get operation
 */
function dbGet(key) {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction("words", "readonly");
      const store = tx.objectStore("words");
      const req = store.get(key);
      req.onsuccess = (e) => resolve(e.target.result || null);
      req.onerror = (e) => resolve(null);
      tx.onerror = (e) => resolve(null);
    } catch (e) {
      console.error("dbGet error:", e);
      resolve(null);
    }
  });
}

// ─── Main lookup ──────────────────────────────────────────────────────────────

/**
 * Resolve contractions to their base word via CONTRACTION_MAP
 */
async function resolveContraction(cleanWord) {
  if (!cleanWord.includes("'")) return null;

  const baseWord = CONTRACTION_MAP[cleanWord] || cleanWord.split("'")[0];
  const result = await dbGet(baseWord);

  if (result) {
    return { ...result, word: cleanWord, base_form: baseWord };
  }
  return null;
}

async function handleConstantWord(cleanWord) {
  const constantWord =
    IRREGULAR_PAST_MAP[cleanWord] || IRREGULAR_PARTICIPLE_MAP[cleanWord] || "";

  if (constantWord !== "") {
    const result = await dbGet(constantWord);

    if (result) {
      return { ...result, word: cleanWord, base_form: constantWord };
    }
  }

  return null;
}
/**
 * Try word in various base forms (plurals, tenses, etc.)
 * Returns the first match found, or null
 */
async function tryBaseForm(cleanWord, originalWord) {
  const attempts = [];

  // Possessive 's
  if (cleanWord.endsWith("'s")) {
    attempts.push(cleanWord.slice(0, -2));
  } else if (cleanWord.endsWith("s") && cleanWord.length > 2) {
    attempts.push(cleanWord.slice(0, -1));
  }

  // -ly adverbs
  if (cleanWord.endsWith("ly")) {
    attempts.push(cleanWord.slice(0, -2));
    attempts.push(cleanWord.slice(0, -2) + "le");
  }

  // Past tense -ed
  if (cleanWord.endsWith("ed")) {
    attempts.push(cleanWord.slice(0, -1));
    attempts.push(cleanWord.slice(0, -2));
    if (cleanWord.length > 3) {
      const lastTwo = cleanWord.slice(-4, -2);
      if (lastTwo[0] === lastTwo[1]) attempts.push(cleanWord.slice(0, -3));
    }
    if (cleanWord.endsWith("ied")) attempts.push(cleanWord.slice(0, -3) + "y");
  }

  // Present participle -ing
  if (cleanWord.endsWith("ing")) {
    attempts.push(cleanWord.slice(0, -3));
    attempts.push(cleanWord.slice(0, -3) + "e");
    if (cleanWord.length > 4) {
      const lastTwo = cleanWord.slice(-5, -3);
      if (lastTwo[0] === lastTwo[1]) attempts.push(cleanWord.slice(0, -4));
    }
    if (cleanWord.endsWith("ying")) attempts.push(cleanWord.slice(0, -4) + "y");
  }

  // Plural -s/-es
  if (cleanWord.endsWith("s") && !cleanWord.endsWith("ss")) {
    const withoutS = cleanWord.slice(0, -1);
    attempts.push(withoutS);
    if (withoutS.endsWith("er")) attempts.push(withoutS.slice(0, -2));
    if (withoutS.endsWith("or")) attempts.push(withoutS.slice(0, -2));
    if (cleanWord.endsWith("es")) attempts.push(cleanWord.slice(0, -2));
    if (cleanWord.endsWith("ies")) attempts.push(cleanWord.slice(0, -3) + "y");
  }

  // Comparative -er
  if (cleanWord.endsWith("er") && !cleanWord.endsWith("eer")) {
    attempts.push(cleanWord.slice(0, -2));
    if (cleanWord.length > 3) {
      const lastTwo = cleanWord.slice(-4, -2);
      if (lastTwo[0] === lastTwo[1]) attempts.push(cleanWord.slice(0, -3));
    }
  }

  // Agent noun -or
  if (cleanWord.endsWith("or")) {
    attempts.push(cleanWord.slice(0, -2));
  }

  // Superlative -est
  if (cleanWord.endsWith("est")) {
    attempts.push(cleanWord.slice(0, -3));
    if (cleanWord.length > 4) {
      const lastTwo = cleanWord.slice(-5, -3);
      if (lastTwo[0] === lastTwo[1]) attempts.push(cleanWord.slice(0, -4));
    }
  }

  // Try each attempt in order
  for (const baseForm of attempts) {
    let result = await dbGet(baseForm);
    if (result) {
      return { ...result, word: originalWord, base_form: baseForm };
    }
  }

  return null;
}

/**
 * Main word lookup function
 * Returns { word, origin, source_lang, source_word, ... } or { word, error: true }
 */
async function lookupWord(word) {
  // Wait for DB instead of failing immediately
  try {
    await waitForDB();
  } catch {
    return { word, origin: "Database loading...", error: true };
  }

  // Normalize input
  const rawWord = normaliseApostrophes(word.toLowerCase().trim());

  const strippedWord = rawWord
    .replace(/^[^\p{L}-]+/gu, "") // Remove leading non-letters (Unicode-aware)
    .replace(/[^\p{L}-]+$/gu, "") // Remove trailing non-letters
    .replace(/-+$/g, ""); // Strip trailing hyphens

  // For hyphenated compounds, take the first alphabetic part
  const cleanWord = strippedWord.includes("-")
    ? strippedWord.split("-").find((p) => /[a-z]/.test(p)) || strippedWord
    : strippedWord;

  // Strategy 1: Try contraction resolution first
  if (cleanWord.includes("'")) {
    const result = await resolveContraction(cleanWord);
    if (result) return result;
  }

  const constantWordResult = await handleConstantWord(cleanWord);

  if (constantWordResult) return constantWordResult;

  // Strategy 2: Exact match
  let result = await dbGet(cleanWord);
  if (result) return result;

  // Strategy 3: Try base forms (plurals, tenses, etc.)
  result = await tryBaseForm(cleanWord, word);
  if (result) {
    //result = await resolveSourceChain(result, word);
    return result;
  }

  // Not found — track and return error
  if (DEBUG) {
    trackMissingWord(db, cleanWord);
  }

  return { word, origin: "not found", error: true };
}

// ─── Init & message handling ──────────────────────────────────────────────────

initDB();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "lookup") {
    lookupWord(request.word).then((result) => sendResponse(result));
    return true;
  }

  if (request.action === "getMissingCount") {
    getMissingWordsCount(db).then((count) => sendResponse({ count }));
    return true;
  }

  if (request.action === "exportMissingWords") {
    exportMissingWords(db)
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "clearMissingWords") {
    clearMissingWords(db)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "keyboardLookup") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs?.[0]?.id) return;
      chrome.tabs.sendMessage(tabs[0].id, { action: "keyboardLookup" });
    });
  }
});
