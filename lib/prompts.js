// Local keyword search + system prompt builder

// ===== Local pre-filter =====

const STOP_WORDS = new Set([
  'i', 'a', 'an', 'the', 'to', 'be', 'is', 'am', 'are', 'was', 'were',
  'for', 'of', 'in', 'on', 'at', 'by', 'it', 'my', 'me', 'we', 'us',
  'do', 'did', 'does', 'want', 'need', 'how', 'what', 'where', 'when',
  'can', 'about', 'with', 'from', 'this', 'that', 'have', 'has', 'had',
  'will', 'would', 'could', 'should', 'there', 'their', 'they', 'them',
  'not', 'but', 'or', 'and', 'if', 'so', 'just', 'get', 'got', 'any',
  'all', 'some', 'up', 'out', 'no', 'yes', 'also', 'very', 'like',
]);

function extractTerms(text) {
  return text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w));
}

// Stem match: checks if term appears as a substring, or if a shared prefix >= 5 chars exists
function termMatches(haystack, term) {
  if (haystack.includes(term)) return true;
  // Prefix stem: "reimbursed" → "reimburse" matches "reimbursement"
  if (term.length >= 5) {
    const stem = term.slice(0, Math.max(5, term.length - 2));
    if (haystack.includes(stem)) return true;
  }
  return false;
}

function scoreResource(resource, queryTerms) {
  const title = (resource.title || '').toLowerCase();
  const desc = (resource.description || '').toLowerCase();
  const section = (resource.section || '').toLowerCase();

  let score = 0;
  for (const term of queryTerms) {
    if (termMatches(title, term))   score += 10;
    if (termMatches(desc, term))    score += 3;
    if (termMatches(section, term)) score += 2;
  }
  return score;
}

function expandTerms(terms) {
  // Use TERM_EXPANSIONS from content-extractor.js if available, otherwise skip
  const expansions = (typeof TERM_EXPANSIONS !== 'undefined') ? TERM_EXPANSIONS : {};
  const expanded = [...terms];
  for (const term of terms) {
    if (expansions[term]) {
      for (const syn of expansions[term]) {
        // Only add single-word synonyms (multi-word won't match via termMatches)
        if (!syn.includes(' ') && !expanded.includes(syn)) {
          expanded.push(syn);
        }
      }
    }
  }
  return expanded;
}

function searchResources(query, resources, maxResults = 30) {
  const rawTerms = extractTerms(query);
  const terms = expandTerms(rawTerms);
  if (terms.length === 0) return resources.slice(0, maxResults);

  const scored = resources.map(r => ({ resource: r, score: scoreResource(r, terms) }));
  scored.sort((a, b) => b.score - a.score);

  const matches = scored.filter(s => s.score > 0);
  const nonMatches = scored.filter(s => s.score === 0);

  // Take top keyword matches + fill remaining slots with unscored for breadth
  const top = matches.slice(0, 25).map(s => s.resource);
  const fill = nonMatches.slice(0, Math.max(5, maxResults - top.length)).map(s => s.resource);

  // Deduplicate by normalized title (same file uploaded in multiple places)
  const deduped = [];
  const seenTitles = new Set();
  for (const r of [...top, ...fill]) {
    const key = (r.title || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (seenTitles.has(key)) continue;
    seenTitles.add(key);
    deduped.push(r);
  }

  return deduped;
}

// ===== System prompt =====

function buildSystemPrompt(candidates, totalCount, contentSnippets) {
  // If contentSnippets are provided and non-empty, build a RAG-aware prompt
  if (contentSnippets && contentSnippets.length > 0) {
    return _buildRAGPrompt(candidates, contentSnippets);
  }

  // Fallback: original resource-list-only format (backward compatible)
  const resourceList = candidates
    .map((r, i) => {
      let line = `${i + 1}. [${r.type.toUpperCase()}] "${r.title}"`;
      if (r.section) line += ` | Section: ${r.section}`;
      if (r.description && r.description !== r.title) line += ` | ${r.description}`;
      line += ` | URL: ${r.url}`;
      return line;
    })
    .join('\n');

  return `You are a Blackboard search tool for Schwarzman Scholars at Tsinghua University.

CANDIDATE RESOURCES:
${resourceList}

Pick the single best match for the student's query. If you're not fully confident, add 1-2 alternatives.

Reply in EXACTLY this format — no other text before or after:

<results>
[
  {"title": "Resource Title", "url": "https://...", "type": "pdf", "section": "Section Name", "reason": "One sentence why"}
]
</results>

RULES:
- First item = best match. Additional items only if uncertain.
- Maximum 3 results total.
- "reason" should describe WHERE on Blackboard this resource is located, using the section info provided (e.g. "Found in Student Life under Community" or "Located in Course Documents for GLBL 501").
- Do NOT write any text outside the <results> tags. No greetings, no explanations, no disclaimers.`;
}

function _buildRAGPrompt(candidates, contentSnippets) {
  // Build numbered source list from content snippets
  const sourcesWithContent = contentSnippets.map((cs, i) => {
    const r = cs.resource;
    const typeLabel = r.type.toUpperCase();
    const snippetText = (cs.snippets || []).join('\n...\n') || cs.content || '(no content extracted)';
    const location = r.url || 'Internal Knowledge Base';
    return `[${i + 1}] "${r.title}" (${typeLabel}) — ${location}\nContent: "${snippetText}"`;
  });

  // Find candidates that are NOT in the content snippets (no content extracted)
  const snippetUrls = new Set(contentSnippets.map(cs => cs.resource.url));
  const additionalResources = candidates.filter(r => !snippetUrls.has(r.url));

  let additionalSection = '';
  if (additionalResources.length > 0) {
    const startIndex = contentSnippets.length + 1;
    const additionalList = additionalResources.map((r, i) => {
      let line = `${startIndex + i}. [${r.type.toUpperCase()}] "${r.title}"`;
      if (r.section) line += ` | Section: ${r.section}`;
      line += ` | ${r.url}`;
      return line;
    }).join('\n');
    additionalSection = `\nADDITIONAL RESOURCES (no content extracted):\n${additionalList}\n`;
  }

  return `You are a Blackboard assistant for Schwarzman Scholars at Tsinghua University.
You answer questions using actual content from Blackboard resources.

SOURCES:
${sourcesWithContent.join('\n\n')}
${additionalSection}
INSTRUCTIONS:
- Be extremely concise. Give the direct answer in 1-2 sentences max. No filler, no preamble, no disclaimers.
- Use bullet points for multiple pieces of info. Never write a paragraph when a list will do.
- Cite sources using [1], [2] notation.
- After your answer, include a <results> block with the most relevant Blackboard resources (ones with URLs).
- Do NOT include "Internal Knowledge Base" sources in the <results> block — those are for answering only, not linking.
- If you cannot answer from the content, say so briefly and still provide the best matching resources.

Reply format:
Your answer text here with [1] citations.

<results>
[{"title": "...", "url": "...", "type": "...", "section": "...", "reason": "Found in [section/folder] under [parent area]"}]
</results>

IMPORTANT: The "reason" field should describe WHERE on Blackboard this resource is located (e.g. "Found in Student Life under Community"), NOT why it's relevant.`;
}

function buildConversationalPrompt(contentSnippets) {
  let sourcesSection = '';

  if (contentSnippets && contentSnippets.length > 0) {
    const sourcesList = contentSnippets.map((cs, i) => {
      const r = cs.resource;
      const typeLabel = r.type.toUpperCase();
      const snippetText = (cs.snippets || []).join('\n...\n') || cs.content || '(no content extracted)';
      const location = r.url || 'Internal Knowledge Base';
      return `[${i + 1}] "${r.title}" (${typeLabel}) — ${location}\nContent: "${snippetText}"`;
    }).join('\n\n');

    sourcesSection = `\nSOURCES:\n${sourcesList}\n`;
  }

  return `You are a Blackboard assistant for Schwarzman Scholars at Tsinghua University.
You help students find information from their Blackboard course materials through conversation.
${sourcesSection}
INSTRUCTIONS:
- Be extremely concise. Give the direct answer in 1-2 sentences max. No filler, no preamble, no disclaimers.
- Use bullet points for multiple pieces of info. Never write a paragraph when a list will do.
- Cite sources using [1], [2] notation.
- After your answer, include a <results> block with the most relevant Blackboard resources (if any sources with URLs were provided).
- Do NOT include "Internal Knowledge Base" sources in the <results> block — those are for answering only, not linking.
- If you cannot answer from the provided content, say so briefly.
- Remember prior messages in the conversation for follow-up questions.

Reply format (when sources are available):
Your answer text here with [1] citations.

<results>
[{"title": "...", "url": "...", "type": "...", "section": "...", "reason": "Found in [section/folder] under [parent area]"}]
</results>

IMPORTANT: The "reason" field should describe WHERE on Blackboard this resource is located (e.g. "Found in Student Life under Community"), NOT why it's relevant.

Reply format (when no sources are available):
Your conversational answer here. No <results> block needed.`;
}

if (typeof window !== 'undefined') {
  window.searchResources = searchResources;
  window.buildSystemPrompt = buildSystemPrompt;
  window.buildConversationalPrompt = buildConversationalPrompt;
}
