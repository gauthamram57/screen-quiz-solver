/**
 * ScreenQuizSolver - Question Extraction & Parsing Engine
 * Extracts isolated quiz questions from raw page text and nested DOM structures.
 */

function extractQuestionAlone(pageText) {
  if (!pageText || typeof pageText !== 'string') return '';

  const lines = pageText
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 5);

  let best = '';
  let bestScore = -1;

  for (const line of lines) {
    // Skip general interface and navigation text
    if (/^(Home|Menu|Login|Submit|Next|Previous|Dashboard|Copyright|©)/i.test(line)) continue;
    // Skip timestamp and timer lines
    if (/^\d{1,2}:\d{2}(:\d{2})?/.test(line)) continue;
    if (/Time Remaining|Reset Selection|Save & Next/i.test(line)) continue;

    let score = 0;

    // Strong indicator: question mark
    if (line.endsWith('?')) score += 3;

    // Strong indicator: question prefixes (e.g., Q1:, Question 1:, 1. What)
    if (/^(Q\d+[:.]\s*|Question\s*\d*[:.]\s*|\d+[).]\s+[A-Z])/i.test(line)) score += 2;

    // Penalize metadata lines like "Question 1 of 50"
    if (/Question\s+\d+\s+of\s+\d+/i.test(line)) score -= 2;

    // Interrogative / action words
    if (/\b(what|which|when|where|who|why|how|choose|select|fill|blank|correct|true|false)\b/i.test(line)) score += 2;

    // Fill-in-the-blank blanks
    if (line.includes('_____') || line.includes('___') || /fill in/i.test(line)) score += 3;

    // Reasonable sentence length
    if (line.length >= 20 && line.length <= 300) score += 1;

    // Penalize trailing ellipses or snippets
    if (line.endsWith('...')) score -= 3;
    if (/\.\./.test(line)) score -= 1;

    // Penalize standalone option choices
    if (/^([A-Da-d1-4][).:]\s+.+|Option\s+\d+)/.test(line)) score -= 3;

    if (score > bestScore) {
      bestScore = score;
      best = line;
    }
  }

  // Fallback heuristic if no high-confidence question line scored
  if (!best) {
    best = lines.filter(line => line.length > 15).slice(0, 3).join(' ');
  }

  return best
    .replace(/^(Q\d+[:.]\s*|Question\s*\d*[:.]\s*)/i, '')
    .trim()
    .slice(0, 500);
}

// Module export for Node testing or browser window attachment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { extractQuestionAlone };
} else if (typeof window !== 'undefined') {
  window.extractQuestionAlone = extractQuestionAlone;
}
