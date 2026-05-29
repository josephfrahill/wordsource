export function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function removeDiacritics(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Normalise curly/smart apostrophes to straight so contraction map keys match
export function normaliseApostrophes(str) {
  return str.replace(/[\u2018\u2019\u02bc]/g, "'");
}