export function trackMissingWord(db, word) {
  if (!db) {
    return;
  }

  // Don't track very short words, numbers, or obvious noise
  if (!word || word.length < 3) return;
  if (!/^[a-z'-]+$/i.test(word)) return; // allow hyphens too
  // (hyphens filtered out upstream before trackMissingWord is called,
  // but guard here just in case)

  const tx = db.transaction("missing_words", "readwrite");
  const store = tx.objectStore("missing_words");
  const getReq = store.get(word);

  getReq.onsuccess = () => {
    const writeStore = tx.objectStore("missing_words"); // re-use same open tx
    if (getReq.result) {
      const existing = getReq.result;
      existing.count += 1;
      existing.lastSeen = new Date().toISOString();
      writeStore.put(existing);
    } else {
      writeStore.put({
        word,
        count: 1,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
      });
    }
  };
}

export async function getMissingWordsCount(db) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error("DB not ready"));
      return;
    }

    const tx = db.transaction("missing_words", "readonly");
    const store = tx.objectStore("missing_words");
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(0);
  });
}

export async function exportMissingWords(db) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error("DB not ready"));
      return;
    }

    const tx = db.transaction("missing_words", "readonly");
    const store = tx.objectStore("missing_words");
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
      const dataUrl =
        "data:application/json;charset=utf-8," + encodeURIComponent(json);

      chrome.downloads.download(
        { url: dataUrl, filename: "words_missing.json", saveAs: true },
        (downloadId) => {
          if (chrome.runtime.lastError) {
            console.error("Download failed:", chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
          } else {
            resolve({ downloadId, count: words.length });
          }
        },
      );
    };

    req.onerror = () => reject(new Error("Failed to read missing_words store"));
  });
}

export async function clearMissingWords(db) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error("DB not ready"));
      return;
    }

    const tx = db.transaction("missing_words", "readwrite");
    const req = tx.objectStore("missing_words").clear();
    req.onsuccess = () => resolve();
    req.onerror = () =>
      reject(new Error("Failed to clear missing_words store"));
  });
}
