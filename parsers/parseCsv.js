const fs = require('fs');

// ─── Config ──────────────────────────────────────────────────────────────────

const INPUT_FILE  = process.argv[2] || 'data/conceptnet_etymology.csv';
const OUTPUT_FILE = process.argv[3] || 'data/words_conceptnet.json';

// ─── Language → origin mapping (same as etymwn script) ───────────────────────

const langToOrigin = {
  // Germanic
  'en':   { label: 'Old English',     origin: 'germanic',           priority: 8  },
  'ang':  { label: 'Old English',     origin: 'germanic',           priority: 10 },
  'enm':  { label: 'Middle English',  origin: 'germanic',           priority: 9  },
  'gem':  { label: 'Proto-Germanic',  origin: 'germanic',           priority: 7  },
  'gmh':  { label: 'Middle High German', origin: 'germanic',        priority: 6  },
  'goh':  { label: 'Old High German', origin: 'germanic',           priority: 6  },
  'de':   { label: 'German',          origin: 'germanic',           priority: 6  },
  'nl':   { label: 'Dutch',           origin: 'germanic',           priority: 6  },
  'non':  { label: 'Old Norse',       origin: 'germanic',           priority: 6  },
  'sv':   { label: 'Swedish',         origin: 'germanic',           priority: 5  },
  'da':   { label: 'Danish',          origin: 'germanic',           priority: 5  },
  'no':   { label: 'Norwegian',       origin: 'germanic',           priority: 5  },
  'is':   { label: 'Icelandic',       origin: 'germanic',           priority: 5  },
  'got':  { label: 'Gothic',          origin: 'germanic',           priority: 5  },
  'fy':   { label: 'Frisian',         origin: 'germanic',           priority: 5  },
  'af':   { label: 'Afrikaans',       origin: 'germanic',           priority: 4  },

  // Latinate / Romance
  'la':   { label: 'Latin',           origin: 'latinate',           priority: 10 },
  'fro':  { label: 'Old French',      origin: 'latinate',           priority: 9  },
  'frm':  { label: 'Middle French',   origin: 'latinate',           priority: 8  },
  'fr':   { label: 'French',          origin: 'latinate',           priority: 7  },
  'it':   { label: 'Italian',         origin: 'latinate',           priority: 7  },
  'es':   { label: 'Spanish',         origin: 'latinate',           priority: 7  },
  'pt':   { label: 'Portuguese',      origin: 'latinate',           priority: 7  },
  'ro':   { label: 'Romanian',        origin: 'latinate',           priority: 6  },
  'ca':   { label: 'Catalan',         origin: 'latinate',           priority: 6  },
  'oc':   { label: 'Occitan',         origin: 'latinate',           priority: 6  },
  'roa':  { label: 'Romance',         origin: 'latinate',           priority: 5  },
  'roa-opt': { label: 'Old Portuguese', origin: 'latinate',         priority: 7  },

  // Greek
  'grc':  { label: 'Ancient Greek',   origin: 'greek',              priority: 10 },
  'el':   { label: 'Greek',           origin: 'greek',              priority: 9  },

  // Other named origins
  'ar':   { label: 'Arabic',          origin: 'arabic',             priority: 8  },
  'he':   { label: 'Hebrew',          origin: 'hebrew',             priority: 8  },
  'sa':   { label: 'Sanskrit',        origin: 'sanskrit',           priority: 8  },
  'fa':   { label: 'Persian',         origin: 'persian',            priority: 8  },
  'hi':   { label: 'Hindi',           origin: 'hindi',              priority: 7  },
  'zh':   { label: 'Chinese',         origin: 'chinese',            priority: 7  },
  'ja':   { label: 'Japanese',        origin: 'japanese',           priority: 7  },
  'tr':   { label: 'Turkish',         origin: 'turkish',            priority: 7  },
  'ru':   { label: 'Russian',         origin: 'slavic',             priority: 6  },
  'pl':   { label: 'Polish',          origin: 'slavic',             priority: 6  },
  'cs':   { label: 'Czech',           origin: 'slavic',             priority: 6  },
  'orv':  { label: 'Old Russian',     origin: 'slavic',             priority: 6  },
  'sla':  { label: 'Proto-Slavic',    origin: 'slavic',             priority: 5  },
  'cel':  { label: 'Celtic',          origin: 'celtic',             priority: 6  },
  'ga':   { label: 'Irish',           origin: 'celtic',             priority: 6  },
  'cy':   { label: 'Welsh',           origin: 'celtic',             priority: 6  },
  'sga':  { label: 'Old Irish',       origin: 'celtic',             priority: 7  },
  'ine':  { label: 'Proto-Indo-European', origin: 'proto-indo-european', priority: 3 },
  'ine-pro': { label: 'Proto-Indo-European', origin: 'proto-indo-european', priority: 3 },
};

// ─── Relation type filter ─────────────────────────────────────────────────────
// ConceptNet uses PascalCase relation names; keep only etymology-relevant ones.

const validRelTypes = new Set([
  'EtymologicallyDerivedFrom',
  'EtymologicallyRelatedTo',
  'DerivedFrom',             // occasionally present
]);

// Weight threshold — ConceptNet rows with weight < 0.5 are usually weak/noisy
const MIN_WEIGHT = 0.5;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Parse the language-direction column, e.g. "en --> fr" or "mul --> en".
 * Returns { sourceLang, targetLang } as ISO codes.
 */
function parseLangDir(langDir) {
  const match = langDir.match(/^(\S+)\s*-->\s*(\S+)$/);
  if (!match) return null;
  return { sourceLang: match[1].trim(), targetLang: match[2].trim() };
}

/**
 * Extract a plain term from a ConceptNet URI like "/c/en/word_of_god" → "word of god"
 * or just return the raw cell value if it's already a plain word.
 */
function extractTerm(raw) {
  if (!raw) return '';
  raw = raw.trim();
  // Strip URI prefix
  const uriMatch = raw.match(/\/c\/[a-z_-]+\/([^/]+)/);
  if (uriMatch) return uriMatch[1].replace(/_/g, ' ');
  return raw;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const csvText = fs.readFileSync(INPUT_FILE, 'utf-8');
const lines   = csvText.split('\n');
const wordMap = new Map();

let processed = 0;
let skipped   = 0;

// Detect whether first line is a header
const firstLine = lines[0].trim();
const hasHeader = isNaN(firstLine.split(',')[0]);
const startIdx  = hasHeader ? 1 : 0;

for (let i = startIdx; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;

  // Split carefully — ConceptNet CSVs sometimes quote fields
  const parts = line.split(',');
  if (parts.length < 5) { skipped++; continue; }

  // Column mapping from the screenshot:
  // 0: numeric id/score  1: term  2: related_term  3: lang_direction  4: relation_type  5: weight  6: source_url  7+: concept_uris
  const [_id, rawTerm, rawRelatedTerm, langDir, relType, rawWeight] = parts;

  // ── Filter: relation type
  const rel = (relType || '').trim();
  if (!validRelTypes.has(rel)) { skipped++; continue; }

  // ── Filter: weight
  const weight = parseFloat(rawWeight);
  if (!isNaN(weight) && weight < MIN_WEIGHT) { skipped++; continue; }

  // ── Filter: language direction — we only want English source words
  const langs = parseLangDir((langDir || '').trim());
  if (!langs) { skipped++; continue; }

  const { sourceLang, targetLang } = langs;

  // Source must be English (or mul which ConceptNet uses for multilingual entries)
  if (sourceLang !== 'en' && sourceLang !== 'mul') { skipped++; continue; }

  // The target language is the *origin* language we care about
  // Skip if target is also plain English (en → en tells us nothing about etymology)
  if (targetLang === 'en' || targetLang === 'mul') { skipped++; continue; }

  const originInfo = langToOrigin[targetLang];
  const origin     = originInfo ? originInfo.origin : 'other';
  const priority   = originInfo ? originInfo.priority : 1;
  const sourceLangLabel = originInfo ? originInfo.label : capitalize(targetLang);

  // ── Term cleanup
  const word = extractTerm(rawTerm).toLowerCase().trim();

  if (!word || !/^[a-z'-]+$/.test(word)) { skipped++; continue; }
  if (word.length < 2)                   { skipped++; continue; }

  const relatedWord = extractTerm(rawRelatedTerm).toLowerCase().trim();

  // ── Dedup / priority logic (same as etymwn script)
  if (wordMap.has(word)) {
    const existing = wordMap.get(word);
    const existingLangInfo = Object.values(langToOrigin).find(l => l.label === existing.source_lang);
    const existingPriority = existingLangInfo ? existingLangInfo.priority : 0;

    if (priority > existingPriority) {
      existing.origin      = capitalize(origin);
      existing.source_lang = sourceLangLabel;
      existing.source_word = relatedWord;
      existing.rel_type    = rel;
    }
  } else {
    wordMap.set(word, {
      word,
      origin:      capitalize(origin),
      source_lang: sourceLangLabel,
      source_word: relatedWord,
      source_url:  'https://conceptnet.io',
      rel_type:    rel,
    });
    processed++;
  }
}

const words = Array.from(wordMap.values());
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(words, null, 2));

console.log(`✓ Processed ${processed} unique words into ${OUTPUT_FILE}`);
console.log(`  Total words in output: ${words.length}`);
console.log(`  Skipped entries: ${skipped}`);