/**
 * Content Extractor for Blackboard Search RAG
 *
 * Extracts text content from HTML pages and PDFs for retrieval-augmented generation.
 * Runs in the Chrome extension's side panel context.
 */

// ---------------------------------------------------------------------------
// HTML Content Extraction
// ---------------------------------------------------------------------------

function extractHtmlContent(html, maxChars = 2000) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Remove non-content elements
    const removeSelectors = ['script', 'style', 'nav', 'header', 'footer', 'aside'];
    for (const sel of removeSelectors) {
      doc.querySelectorAll(sel).forEach(el => el.remove());
    }

    // Try to locate the main content area
    const contentSelectors = [
      '#content',
      '#contentPanel',
      '.contentBox',
      '.vtbegenerated',
      'main',
      'article',
    ];

    let root = null;
    for (const sel of contentSelectors) {
      root = doc.querySelector(sel);
      if (root) break;
    }
    if (!root) {
      root = doc.body || doc.documentElement;
    }

    // Extract and clean text
    let text = (root.textContent || '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n\n').trim();

    return text.slice(0, maxChars);
  } catch (err) {
    console.warn('[content-extractor] extractHtmlContent error:', err);
    return '';
  }
}

// ---------------------------------------------------------------------------
// PDF Content Extraction
// ---------------------------------------------------------------------------

async function extractPdfContent(url, maxPages = 5) {
  try {
    if (typeof pdfjsLib === 'undefined') {
      console.warn('[content-extractor] pdfjsLib not available');
      return '';
    }

    // Ensure worker source is configured
    pdfjsLib.GlobalWorkerOptions.workerSrc = '../lib/pdf.worker.min.js';

    // Fetch PDF with Blackboard session cookies
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) {
      console.warn('[content-extractor] PDF fetch failed:', response.status);
      return '';
    }

    const arrayBuffer = await response.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const numPages = Math.min(pdf.numPages, maxPages);
    const pageTexts = [];

    for (let i = 1; i <= numPages; i++) {
      try {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        pageTexts.push(pageText);
      } catch (pageErr) {
        console.warn(`[content-extractor] Error extracting page ${i}:`, pageErr);
      }
    }

    const fullText = pageTexts.join('\n\n');
    return fullText.slice(0, 3000);
  } catch (err) {
    console.warn('[content-extractor] extractPdfContent error:', err);
    return '';
  }
}

// ---------------------------------------------------------------------------
// Content Store Manager
// ---------------------------------------------------------------------------

class ContentStore {
  constructor() {
    this._storageKey = 'content_store';
  }

  async _load() {
    try {
      const result = await chrome.storage.local.get(this._storageKey);
      return result[this._storageKey] || {};
    } catch (err) {
      console.warn('[ContentStore] load error:', err);
      return {};
    }
  }

  async _save(store) {
    try {
      await chrome.storage.local.set({ [this._storageKey]: store });
    } catch (err) {
      console.warn('[ContentStore] save error:', err);
    }
  }

  async get(resourceId) {
    const store = await this._load();
    return store[resourceId] || null;
  }

  async set(resourceId, content) {
    if (!content) return;
    const store = await this._load();
    store[resourceId] = content;
    await this._save(store);
  }

  async getBatch(resourceIds) {
    const store = await this._load();
    const map = new Map();
    for (const id of resourceIds) {
      if (store[id]) {
        map.set(id, store[id]);
      }
    }
    return map;
  }

  async clear() {
    await this._save({});
  }

  async getStats() {
    const store = await this._load();
    const entries = Object.values(store);
    return {
      count: entries.length,
      totalChars: entries.reduce((sum, text) => sum + text.length, 0),
    };
  }
}

// ---------------------------------------------------------------------------
// Relevant Content Retrieval
// ---------------------------------------------------------------------------

// Semantic synonym expansions for search — shared between keyword pre-filter and content scoring.
// Each key expands the query so we match related terms in resource titles/content.
const TERM_EXPANSIONS = {
  // Clothing / dress code
  'wear': ['dress', 'attire', 'outfit', 'clothing', 'formal', 'casual', 'dress code', 'costume'],
  'dress': ['wear', 'attire', 'outfit', 'clothing', 'formal', 'casual', 'dress code'],
  'outfit': ['wear', 'dress', 'attire', 'clothing', 'formal', 'casual'],
  'attire': ['wear', 'dress', 'outfit', 'clothing', 'formal', 'casual', 'dress code'],

  // Food / dining
  'food': ['meal', 'catering', 'lunch', 'dinner', 'snack', 'eat', 'restaurant', 'dining'],
  'eat': ['food', 'meal', 'catering', 'lunch', 'dinner', 'restaurant', 'dining'],
  'meal': ['food', 'catering', 'lunch', 'dinner', 'dining', 'restaurant'],
  'lunch': ['food', 'meal', 'dinner', 'dining', 'catering'],
  'dinner': ['food', 'meal', 'lunch', 'dining', 'catering'],
  'boba': ['bubble tea', 'drink', 'beverage', 'tea', 'coffee'],
  'drink': ['beverage', 'water', 'coffee', 'tea', 'alcohol', 'juice', 'boba'],

  // Money / budget / reimbursement
  'money': ['budget', 'reimburse', 'cost', 'expense', 'fund', 'pay', 'price', 'fee'],
  'pay': ['reimburse', 'budget', 'cost', 'expense', 'fund', 'money', 'payment', 'fee'],
  'cost': ['price', 'fee', 'budget', 'expense', 'money', 'pay'],
  'fee': ['cost', 'price', 'tuition', 'payment', 'charge'],
  'buy': ['purchase', 'order', 'shop', 'procurement'],
  'purchase': ['buy', 'order', 'procurement', 'reimburse'],

  // Academics
  'grade': ['grading', 'score', 'mark', 'assessment', 'evaluation', 'rubric', 'gpa'],
  'homework': ['assignment', 'reading', 'coursework', 'problem set', 'exercise', 'task'],
  'assignment': ['homework', 'reading', 'coursework', 'task', 'paper', 'essay'],
  'test': ['exam', 'midterm', 'final', 'quiz', 'assessment', 'evaluation'],
  'exam': ['test', 'midterm', 'final', 'quiz', 'assessment'],
  'syllabus': ['curriculum', 'course outline', 'reading list', 'schedule', 'plan'],
  'reading': ['syllabus', 'assignment', 'book', 'article', 'text', 'material'],
  'capstone': ['thesis', 'project', 'final project', 'dissertation', 'research'],
  'thesis': ['capstone', 'dissertation', 'research', 'paper', 'project'],
  'teacher': ['professor', 'instructor', 'lecturer', 'faculty', 'prof'],
  'professor': ['teacher', 'instructor', 'lecturer', 'faculty', 'prof'],
  'class': ['course', 'lecture', 'seminar', 'session', 'module'],
  'course': ['class', 'lecture', 'seminar', 'module', 'subject'],

  // Schedule / time
  'schedule': ['calendar', 'date', 'time', 'timeline', 'agenda', 'timetable'],
  'calendar': ['schedule', 'date', 'timeline', 'agenda', 'timetable', 'term'],
  'deadline': ['due', 'date', 'submit', 'submission', 'cutoff'],
  'late': ['deadline', 'overdue', 'extension', 'penalty', 'delay'],

  // Applications / forms
  'apply': ['application', 'deadline', 'submit', 'form', 'register', 'sign up', 'enroll'],
  'register': ['apply', 'sign up', 'enroll', 'form', 'registration'],
  'submit': ['application', 'deadline', 'form', 'upload', 'send', 'turn in'],

  // Health / wellness
  'sick': ['health', 'medical', 'doctor', 'hospital', 'clinic', 'illness', 'absence'],
  'health': ['medical', 'doctor', 'hospital', 'clinic', 'wellness', 'insurance', 'sick'],
  'doctor': ['health', 'medical', 'hospital', 'clinic', 'appointment'],
  'mental': ['counseling', 'therapy', 'wellness', 'health', 'stress', 'anxiety'],
  'counseling': ['mental', 'therapy', 'wellness', 'support', 'psychologist'],

  // Housing / living
  'room': ['housing', 'dorm', 'accommodation', 'residence', 'dormitory', 'apartment'],
  'housing': ['room', 'dorm', 'accommodation', 'residence', 'dormitory', 'apartment'],
  'dorm': ['room', 'housing', 'accommodation', 'residence', 'dormitory'],
  'roommate': ['housing', 'dorm', 'room', 'living'],
  'laundry': ['wash', 'clean', 'clothes', 'machine'],

  // Travel / transportation
  'travel': ['trip', 'excursion', 'outing', 'tour', 'transport', 'bus', 'train', 'flight'],
  'trip': ['travel', 'excursion', 'outing', 'tour'],
  'bus': ['transport', 'shuttle', 'didi', 'taxi', 'ride'],
  'taxi': ['didi', 'ride', 'transport', 'bus', 'uber'],
  'flight': ['travel', 'airline', 'airport', 'plane', 'ticket', 'booking'],

  // Technology / campus services
  'wifi': ['internet', 'network', 'connect', 'vpn', 'online'],
  'internet': ['wifi', 'network', 'vpn', 'online', 'connection'],
  'print': ['printer', 'printing', 'copy', 'scan'],
  'computer': ['laptop', 'pc', 'lab', 'device'],
  'phone': ['mobile', 'sim', 'data', 'cell', 'number', 'wechat'],
  'sim': ['phone', 'mobile', 'data', 'cell', 'number'],

  // Finance / banking
  'bank': ['account', 'financial', 'atm', 'wechat pay', 'alipay', 'boc', 'transfer'],
  'alipay': ['wechat pay', 'payment', 'bank', 'transfer', 'mobile pay'],

  // People / contacts
  'contact': ['email', 'phone', 'reach', 'office', 'staff', 'who'],
  'mentor': ['advisor', 'counselor', 'guidance', 'coach', 'mentorship'],
  'advisor': ['mentor', 'counselor', 'guidance', 'coach'],

  // Campus / facilities
  'gym': ['fitness', 'workout', 'exercise', 'sport', 'recreation'],
  'library': ['study', 'book', 'reserve', 'reading room', 'resource'],
  'mail': ['package', 'delivery', 'shipping', 'post', 'parcel'],
  'package': ['mail', 'delivery', 'shipping', 'post', 'parcel'],

  // Visa / immigration
  'visa': ['immigration', 'passport', 'permit', 'stay', 'residence permit', 'psa'],
  'passport': ['visa', 'immigration', 'id', 'document', 'travel document'],

  // Events
  'event': ['activity', 'program', 'gathering', 'ceremony', 'conference', 'workshop'],
  'party': ['event', 'celebration', 'gathering', 'social'],
  'ceremony': ['event', 'graduation', 'commencement', 'opening'],
  'conference': ['event', 'workshop', 'seminar', 'symposium', 'summit'],

  // Policies / rules
  'rule': ['policy', 'regulation', 'guideline', 'requirement', 'code of conduct'],
  'policy': ['rule', 'regulation', 'guideline', 'requirement', 'code of conduct'],
  'permission': ['approval', 'allow', 'authorize', 'consent', 'request'],
};

function getRelevantContent(query, resources, contentMap, maxTotalChars = 6000) {
  try {
    // Tokenise the query into lowercase terms (remove very short words)
    const baseTerms = query
      .toLowerCase()
      .split(/\W+/)
      .filter(t => t.length > 1);

    if (baseTerms.length === 0) return [];

    // Expand query terms with semantic synonyms
    const queryTerms = [...baseTerms];
    for (const term of baseTerms) {
      if (TERM_EXPANSIONS[term]) {
        for (const expansion of TERM_EXPANSIONS[term]) {
          if (!queryTerms.includes(expansion)) queryTerms.push(expansion);
        }
      }
    }

    const results = [];
    let totalChars = 0;

    for (const resource of resources) {
      const id = resource.id || resource.resourceId;
      const content = contentMap.get(id);
      if (!content) continue;

      // Split content into paragraphs
      const paragraphs = content
        .split(/\n\n|\n/)
        .map(p => p.trim())
        .filter(p => p.length > 20); // skip very short fragments

      if (paragraphs.length === 0) continue;

      // Score each paragraph by query-term overlap
      const scored = paragraphs.map(para => {
        const lower = para.toLowerCase();
        let score = 0;
        for (const term of queryTerms) {
          if (lower.includes(term)) score++;
        }
        return { text: para, score };
      });

      // Sort descending by score, take top 5
      scored.sort((a, b) => b.score - a.score);
      const topSnippets = scored.slice(0, 5).filter(s => s.score > 0);

      // If no paragraph matched any query term, still include the first paragraph
      // as general context, but rank it lower
      const snippets =
        topSnippets.length > 0
          ? topSnippets.map(s => s.text)
          : [paragraphs[0]];

      const snippetText = snippets.join('\n');

      // Respect the total character budget
      if (totalChars + snippetText.length > maxTotalChars) {
        const remaining = maxTotalChars - totalChars;
        if (remaining > 100) {
          results.push({
            resource,
            content,
            snippets: [snippetText.slice(0, remaining)],
          });
          totalChars += remaining;
        }
        break;
      }

      totalChars += snippetText.length;
      results.push({ resource, content, snippets });
    }

    // Sort: resources whose snippets matched query terms come first
    results.sort((a, b) => {
      const aMatch = a.snippets.some(s => {
        const lower = s.toLowerCase();
        return queryTerms.some(t => lower.includes(t));
      });
      const bMatch = b.snippets.some(s => {
        const lower = s.toLowerCase();
        return queryTerms.some(t => lower.includes(t));
      });
      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return 1;
      return 0;
    });

    return results;
  } catch (err) {
    console.warn('[content-extractor] getRelevantContent error:', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Export for browser
// ---------------------------------------------------------------------------

if (typeof window !== 'undefined') {
  window.extractHtmlContent = extractHtmlContent;
  window.extractPdfContent = extractPdfContent;
  window.ContentStore = ContentStore;
  window.getRelevantContent = getRelevantContent;
}
