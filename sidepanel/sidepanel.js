// Side Panel — Chat UI, LLM integration, RAG, voice input, conversational chat

const chatArea = document.getElementById('chatArea');
const queryInput = document.getElementById('queryInput');
const sendBtn = document.getElementById('sendBtn');
const micBtn = document.getElementById('micBtn');
const refreshBtn = document.getElementById('refreshBtn');
const settingsBtn = document.getElementById('settingsBtn');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const inputWrapper = queryInput.parentElement;

let resources = [];
let settings = null;
let focusCount = 0;
let crawler = null;
let activeClient = null; // track LLM client for abort
let conversationMessages = [];
const contentStore = new ContentStore();
const HINT_SHOW_COUNT = 3;

const ICON_STOP = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
const ICON_SEND = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>';

// ===== Resource ID computation (matches service worker) =====
function computeResourceId(url) {
  let normalized;
  try {
    const u = new URL(url);
    const keepParams = ['course_id', 'content_id', 'mode', 'type'];
    const params = new URLSearchParams();
    for (const key of keepParams) {
      if (u.searchParams.has(key)) params.set(key, u.searchParams.get(key));
    }
    u.search = params.toString();
    u.hash = '';
    normalized = u.toString();
  } catch {
    normalized = url;
  }
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) - hash + normalized.charCodeAt(i)) | 0;
  }
  return 'r_' + Math.abs(hash).toString(36);
}

// ===== Lucide SVG icon helpers =====
const ICONS = {
  fileText: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 13H8"/><path d="M16 17H8"/><path d="M16 13h-2"/></svg>',
  bookOpen: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
  video: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>',
  megaphone: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m3 11 18-5v12L3 13v-2z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>',
  link: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  externalLink: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg>',
  search: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
  messageSquare: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
};

function typeIconSvg(type) {
  switch (type) {
    case 'pdf': case 'document': return ICONS.fileText;
    case 'video': case 'audio': return ICONS.video;
    case 'announcement': return ICONS.megaphone;
    case 'course': return ICONS.bookOpen;
    default: return ICONS.link;
  }
}

function typeLabel(type) {
  const labels = { pdf: 'PDF', document: 'DOC', video: 'VID', audio: 'AUD', image: 'IMG', archive: 'ZIP', announcement: 'ANN', course: 'CRS', link: 'LNK' };
  return labels[type] || 'LNK';
}

const STALE_MS = 60 * 60 * 1000; // 1 hour

// ===== Init =====
async function init() {
  await loadSettings();
  await loadIndex();
  await loadChatHistory();
  updateInputState();
  renderWelcomeOrEmpty();
  setupVoiceRecognition();
  maybeAutoCrawl();
}

// Auto-crawl if index is empty or stale — no user action needed
async function maybeAutoCrawl() {
  const { index_meta = {}, crawl_visited_at = 0 } = await chrome.storage.local.get(['index_meta', 'crawl_visited_at']);
  const indexAge = Date.now() - (index_meta.lastUpdated || 0);
  const cacheAge = Date.now() - crawl_visited_at;

  if (resources.length === 0) {
    startCrawl({ fullRecrawl: true });
  } else if (indexAge > STALE_MS) {
    const cacheStale = cacheAge > 24 * 60 * 60 * 1000;
    startCrawl({ fullRecrawl: cacheStale });
  }
}

// ===== Settings =====
async function loadSettings() {
  const data = await chrome.storage.local.get('settings');
  settings = data.settings || null;
}

// ===== Index =====
async function loadIndex() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_INDEX' });
  resources = response.resources || [];
  const meta = response.meta || {};
  updateHeaderStatus(resources.length, meta.lastUpdated);
}

function updateHeaderStatus(count, lastUpdated) {
  if (count > 0) {
    statusDot.classList.add('active');
    let text = `${count} resource${count !== 1 ? 's' : ''} indexed`;
    if (lastUpdated) text += ` \u00b7 ${timeAgo(lastUpdated)}`;
    statusText.textContent = text;
  } else {
    statusDot.classList.remove('active');
    statusText.textContent = 'No resources indexed';
  }
}

// ===== Input state =====
function updateInputState() {
  const hasKey = settings && settings.apiKey;
  queryInput.disabled = !hasKey;
  sendBtn.disabled = !hasKey;
  if (!hasKey) {
    queryInput.placeholder = 'Set up API key to start searching';
  } else {
    queryInput.placeholder = 'Search your courses...';
  }
}

// ===== Onboarding state =====
function getOnboardingStep() {
  if (!settings || !settings.apiKey) return 1;
  return 2;
}

// ===== Welcome / Empty =====
function renderWelcomeOrEmpty() {
  if (chatArea.querySelector('.message')) return;

  chatArea.innerHTML = '';
  const step = getOnboardingStep();

  const welcome = document.createElement('div');
  welcome.className = 'welcome-screen';

  const iconImg = document.createElement('img');
  iconImg.src = '../icons/icon128.png';
  iconImg.alt = 'B';
  iconImg.className = 'welcome-logo';
  welcome.appendChild(iconImg);

  const h2 = document.createElement('h2');
  h2.textContent = 'Search your Blackboard';
  welcome.appendChild(h2);

  const p = document.createElement('p');
  p.textContent = 'Ask anything about courses, resources, and announcements.';
  welcome.appendChild(p);

  const chips = document.createElement('div');
  chips.className = 'suggestion-chips';
  const suggestions = ['Academic calendar', 'Capstone requirements', 'Mental health resources', 'Reimbursement policy'];
  for (const text of suggestions) {
    const chip = document.createElement('button');
    chip.className = 'suggestion-chip';
    chip.textContent = text;
    chip.disabled = step < 2;
    chip.addEventListener('click', () => {
      queryInput.value = text;
      sendQuery();
    });
    chips.appendChild(chip);
  }
  welcome.appendChild(chips);

  if (step === 1) {
    const card = document.createElement('div');
    card.className = 'onboarding-card';

    const h3 = document.createElement('h3');
    h3.textContent = 'Get started';
    card.appendChild(h3);

    const stepDiv = document.createElement('div');
    stepDiv.className = 'onboarding-step active';

    const indicator = document.createElement('div');
    indicator.className = 'step-indicator';
    indicator.textContent = '1';
    stepDiv.appendChild(indicator);

    const content = document.createElement('div');
    content.className = 'step-content';
    const label = document.createElement('span');
    label.className = 'step-label';
    label.textContent = 'Connect your AI to start searching';
    content.appendChild(label);
    stepDiv.appendChild(content);

    const action = document.createElement('button');
    action.className = 'step-action';
    action.textContent = 'Set up';
    action.addEventListener('click', () => showSettingsPanel());
    stepDiv.appendChild(action);

    card.appendChild(stepDiv);
    welcome.appendChild(card);
  }

  chatArea.appendChild(welcome);
}

function showEmptyState() {
  chatArea.innerHTML = '';
  const empty = document.createElement('div');
  empty.className = 'empty-state';
  empty.innerHTML = ICONS.messageSquare;
  const p = document.createElement('p');
  p.textContent = 'Chat cleared. Ask a new question.';
  empty.appendChild(p);
  chatArea.appendChild(empty);
}

// ===== Time helper =====
function timeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ===== Markdown + Citations =====
function renderMarkdown(text) {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
  html = html.replace(/(?<!\w)\*(.+?)\*(?!\w)/g, '<em>$1</em>');

  // Citation references [1], [2], etc. → styled spans
  html = html.replace(/\[(\d+)\]/g, '<span class="citation" data-ref="$1">[$1]</span>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Blockquotes (lines starting with >)
  html = html.replace(/^&gt;\s?(.+)$/gm, '<blockquote>$1</blockquote>');

  const lines = html.split('\n');
  const result = [];
  let inList = false;

  for (const line of lines) {
    const listMatch = line.match(/^\s*[-*]\s+(.+)/);
    const numberedMatch = line.match(/^\s*\d+[.)]\s+(.+)/);

    if (listMatch || numberedMatch) {
      if (!inList) {
        result.push(listMatch ? '<ul>' : '<ol>');
        inList = listMatch ? 'ul' : 'ol';
      }
      result.push(`<li>${(listMatch || numberedMatch)[1]}</li>`);
    } else {
      if (inList) {
        result.push(inList === 'ul' ? '</ul>' : '</ol>');
        inList = false;
      }
      if (line.trim() === '') {
        result.push('<br>');
      } else {
        result.push(`<p>${line}</p>`);
      }
    }
  }
  if (inList) result.push(inList === 'ul' ? '</ul>' : '</ol>');

  return result.join('');
}

// ===== Messages =====
function addMessage(role, content, cards = null) {
  const welcome = chatArea.querySelector('.welcome-screen');
  if (welcome) welcome.remove();
  const empty = chatArea.querySelector('.empty-state');
  if (empty) empty.remove();

  const div = document.createElement('div');
  div.className = `message ${role}`;

  if (role === 'loading') {
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('span');
      dot.className = 'loading-dot';
      div.appendChild(dot);
    }
    chatArea.appendChild(div);
    chatArea.scrollTop = chatArea.scrollHeight;
    return div;
  }

  if (role === 'error') {
    div.textContent = content;
    chatArea.appendChild(div);
    chatArea.scrollTop = chatArea.scrollHeight;
    return div;
  }

  if (role === 'user') {
    div.textContent = content;
  } else {
    if (content && content.trim()) {
      const textDiv = document.createElement('div');
      textDiv.className = 'text';
      textDiv.innerHTML = renderMarkdown(content);
      div.appendChild(textDiv);
    }

    if (cards && cards.length > 0) {
      const best = cards[0];
      const alts = cards.slice(1);
      const bestIsFile = /\.(pdf|docx?|xlsx?|pptx?|zip|rar|csv|txt)($|\?)/i.test(best.url) ||
                         /bbcswebdav|@X@/i.test(best.url);

      // — Best match section —
      const bestSection = document.createElement('div');
      bestSection.className = 'best-match-section';

      const bestHeading = document.createElement('div');
      bestHeading.className = 'best-match-heading';
      bestHeading.textContent = 'Best match';
      bestSection.appendChild(bestHeading);

      const bestCard = document.createElement('div');
      bestCard.className = 'resource-card best-match';
      bestCard.role = 'button';
      bestCard.tabIndex = 0;
      bestCard.addEventListener('click', () => navigateToResource(best.url, bestIsFile));
      bestCard.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigateToResource(best.url, bestIsFile); }
      });

      const bestIcon = document.createElement('div');
      bestIcon.className = `icon-circle ${best.type || 'link'}`;
      bestIcon.innerHTML = typeIconSvg(best.type);
      bestCard.appendChild(bestIcon);

      const bestInfo = document.createElement('div');
      bestInfo.className = 'info';
      const bestTitle = document.createElement('div');
      bestTitle.className = 'title';
      bestTitle.textContent = best.title;
      bestInfo.appendChild(bestTitle);
      const bestMeta = document.createElement('span');
      bestMeta.className = 'type-badge';
      bestMeta.textContent = typeLabel(best.type);
      bestInfo.appendChild(bestMeta);
      bestCard.appendChild(bestInfo);

      const bestChevron = document.createElement('span');
      bestChevron.className = 'card-action';
      bestChevron.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';
      bestCard.appendChild(bestChevron);
      bestSection.appendChild(bestCard);

      // Description below the card
      if (best.reason) {
        const bestDesc = document.createElement('p');
        bestDesc.className = 'best-match-desc';
        bestDesc.textContent = best.reason;
        bestSection.appendChild(bestDesc);
      }

      div.appendChild(bestSection);

      // — "Search again" button + alternatives —
      const altsWrapper = document.createElement('div');
      altsWrapper.className = 'alternatives-wrapper';

      const findAgainBtn = document.createElement('button');
      findAgainBtn.className = 'find-again-btn';
      findAgainBtn.textContent = 'Not what you need? Search again';

      if (alts.length > 0) {
        // Alternatives already available — just reveal them
        const altsDiv = _buildAltCards(alts);
        altsWrapper.appendChild(findAgainBtn);
        altsWrapper.appendChild(altsDiv);
        findAgainBtn.addEventListener('click', () => {
          altsWrapper.classList.add('expanded');
          findAgainBtn.style.display = 'none';
          chatArea.scrollTop = chatArea.scrollHeight;
        });
      } else {
        // No alternatives — fetch them on click
        altsWrapper.appendChild(findAgainBtn);
        findAgainBtn.addEventListener('click', () => _fetchAlternatives(best, altsWrapper, findAgainBtn));
      }

      div.appendChild(altsWrapper);
    }
  }

  chatArea.appendChild(div);
  chatArea.scrollTop = chatArea.scrollHeight;
  return div;
}

// Build alternative result cards
function _buildAltCards(alts) {
  const altsDiv = document.createElement('div');
  altsDiv.className = 'alternatives-list';

  alts.forEach((card) => {
    const isFile = /\.(pdf|docx?|xlsx?|pptx?|zip|rar|csv|txt)($|\?)/i.test(card.url) ||
                   /bbcswebdav|@X@/i.test(card.url);

    const el = document.createElement('div');
    el.className = 'resource-card';
    el.role = 'button';
    el.tabIndex = 0;
    el.addEventListener('click', () => navigateToResource(card.url, isFile));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigateToResource(card.url, isFile); }
    });

    const iconCircle = document.createElement('div');
    iconCircle.className = `icon-circle ${card.type || 'link'}`;
    iconCircle.innerHTML = typeIconSvg(card.type);
    el.appendChild(iconCircle);

    const infoDiv = document.createElement('div');
    infoDiv.className = 'info';
    const titleDiv = document.createElement('div');
    titleDiv.className = 'title';
    titleDiv.textContent = card.title;
    infoDiv.appendChild(titleDiv);
    const metaBadge = document.createElement('span');
    metaBadge.className = 'type-badge';
    metaBadge.textContent = typeLabel(card.type);
    infoDiv.appendChild(metaBadge);
    el.appendChild(infoDiv);

    const chevron = document.createElement('span');
    chevron.className = 'card-action';
    chevron.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';
    el.appendChild(chevron);

    altsDiv.appendChild(el);
  });

  return altsDiv;
}

// Fetch alternatives via a follow-up LLM call
async function _fetchAlternatives(bestCard, wrapper, btn) {
  btn.textContent = 'Searching...';
  btn.disabled = true;

  try {
    const client = new LLMClient(settings.provider, settings.apiKey, settings.model);

    // Ask the LLM for alternatives, excluding the best match
    const lastUserMsg = conversationMessages.filter(m => m.role === 'user').pop();
    const query = lastUserMsg ? lastUserMsg.content : '';
    const candidates = searchResources(query, resources);

    const candidateList = candidates
      .filter(r => r.title !== bestCard.title)
      .slice(0, 20)
      .map((r, i) => {
        let line = `${i + 1}. [${r.type.toUpperCase()}] "${r.title}"`;
        if (r.section) line += ` | Section: ${r.section}`;
        line += ` | URL: ${r.url}`;
        return line;
      }).join('\n');

    const altPrompt = `You are a Blackboard search tool for Schwarzman Scholars at Tsinghua University.

The student already received "${bestCard.title}" as the best match but it wasn't what they needed.

CANDIDATE RESOURCES:
${candidateList}

Pick 2-3 alternative resources that could answer their query. Reply in EXACTLY this format:

<results>
[{"title": "...", "url": "...", "type": "...", "section": "...", "reason": "Found in [section] under [area]"}]
</results>

RULES:
- Do NOT include "${bestCard.title}" again.
- "reason" should describe WHERE on Blackboard this resource is located.
- Do NOT write any text outside the <results> tags.`;

    const response = await client.query(altPrompt, query);
    const { cards } = parseResponse(response);

    if (cards.length > 0) {
      const altsDiv = _buildAltCards(cards);
      wrapper.appendChild(altsDiv);
      wrapper.classList.add('expanded');
      btn.style.display = 'none';
      chatArea.scrollTop = chatArea.scrollHeight;
    } else {
      btn.textContent = 'No alternatives found';
      btn.disabled = true;
    }
  } catch {
    btn.textContent = 'Not what you need? Search again';
    btn.disabled = false;
  }
}

// ===== Parse LLM response =====
function parseResponse(text) {
  const match = text.match(/<results>\s*([\s\S]*?)\s*<\/results>/);
  let cards = [];
  let displayText = text;

  if (match) {
    displayText = text.replace(/<results>[\s\S]*?<\/results>/, '').trim();
    try {
      const parsed = JSON.parse(match[1]);
      if (Array.isArray(parsed)) {
        const seen = new Set();
        for (const item of parsed) {
          // Skip items without a real Blackboard URL (e.g. knowledge base entries)
          if (!item.url || !item.url.startsWith('http')) continue;
          // Deduplicate by normalized title (same file uploaded in multiple places)
          const key = (item.title || '').toLowerCase().replace(/\s+/g, ' ').trim();
          if (seen.has(key)) continue;
          seen.add(key);
          cards.push({
            title: item.title || 'Untitled',
            url: item.url,
            type: item.type || 'link',
            section: item.section || '',
            reason: item.reason || ''
          });
        }
      }
    } catch { /* ignore parse errors */ }
  }

  return { text: displayText, cards };
}

// ===== Navigate to resource =====
async function navigateToResource(url, isFile) {
  try {
    // Find the active Blackboard tab
    const tabs = await chrome.tabs.query({ url: 'https://lms.sc.tsinghua.edu.cn/*' });
    if (isFile) {
      // Files: open in new tab (they download or open in viewer)
      chrome.tabs.create({ url, active: true });
    } else if (tabs.length > 0) {
      // Navigate the existing Blackboard tab
      chrome.tabs.update(tabs[0].id, { url, active: true });
      chrome.windows.update(tabs[0].windowId, { focused: true });
    } else {
      // No Blackboard tab open — create one
      chrome.tabs.create({ url, active: true });
    }
  } catch {
    // Fallback: open in new tab
    window.open(url, '_blank');
  }
}

// ===== Send query (multi-turn + RAG) =====
async function sendQuery() {
  // If already generating, abort
  if (activeClient) {
    activeClient.abort();
    activeClient = null;
    return;
  }

  const query = queryInput.value.trim();
  if (!query || !settings?.apiKey) return;

  queryInput.value = '';
  queryInput.style.height = 'auto';

  // Toggle send button to stop button
  sendBtn.innerHTML = ICON_STOP;
  sendBtn.classList.add('stop-mode');
  sendBtn.disabled = false;

  addMessage('user', query);
  const loadingEl = addMessage('loading');

  try {
    const client = new LLMClient(settings.provider, settings.apiKey, settings.model);
    activeClient = client;

    // Local pre-filter
    const candidates = searchResources(query, resources);

    // Fetch stored content for top candidates (RAG)
    const topCandidates = candidates.slice(0, 20);
    const candidateIds = topCandidates.map(r => r.id).filter(Boolean);
    const contentMap = candidateIds.length > 0
      ? await contentStore.getBatch(candidateIds)
      : new Map();

    // Build RAG content snippets
    const contentSnippets = getRelevantContent(query, topCandidates, contentMap, 10000);

    // Check static knowledge base for matching entries
    const kbMatches = searchKnowledgeBase(query);
    for (const kb of kbMatches) {
      contentSnippets.push({
        resource: { title: kb.title, url: '', type: 'document' },
        snippets: [kb.content]
      });
    }

    // Build system prompt (uses RAG if content available, falls back to resource list)
    const systemPrompt = contentSnippets.length > 0
      ? buildConversationalPrompt(contentSnippets)
      : buildSystemPrompt(candidates, resources.length, contentSnippets);

    // Add user message to conversation history
    conversationMessages.push({ role: 'user', content: query });

    // Use multi-turn chat
    const response = await client.chat(systemPrompt, conversationMessages);

    // Add assistant response to history
    conversationMessages.push({ role: 'assistant', content: response });

    // Keep conversation history manageable
    if (conversationMessages.length > 20) {
      conversationMessages = conversationMessages.slice(-20);
    }

    const { text, cards } = parseResponse(response);
    loadingEl.remove();
    addMessage('bot', text, cards);

    await saveChatMessage('user', query);
    await saveChatMessage('bot', response);
  } catch (err) {
    loadingEl.remove();
    if (err.name === 'AbortError') {
      addMessage('error', 'Stopped.');
    } else {
      addMessage('error', `Error: ${err.message}`);
    }
  } finally {
    activeClient = null;
    sendBtn.innerHTML = ICON_SEND;
    sendBtn.classList.remove('stop-mode');
    sendBtn.disabled = false;
    queryInput.focus();
  }
}

// ===== Chat history =====
async function saveChatMessage(role, content) {
  const { chat_history = [] } = await chrome.storage.local.get('chat_history');
  chat_history.push({ role, content, timestamp: Date.now() });
  while (chat_history.length > 50) chat_history.shift();
  await chrome.storage.local.set({ chat_history });
}

async function loadChatHistory() {
  const { chat_history = [] } = await chrome.storage.local.get('chat_history');
  if (chat_history.length === 0) return;

  // Rebuild conversation messages for multi-turn
  conversationMessages = [];
  for (const msg of chat_history) {
    if (msg.role === 'user') {
      addMessage('user', msg.content);
      conversationMessages.push({ role: 'user', content: msg.content });
    } else {
      const { text, cards } = parseResponse(msg.content);
      addMessage('bot', text, cards);
      conversationMessages.push({ role: 'assistant', content: msg.content });
    }
  }

  // Keep manageable
  if (conversationMessages.length > 20) {
    conversationMessages = conversationMessages.slice(-20);
  }
}

// ===== Voice Recognition =====
let recognition = null;
let isRecording = false;

function setupVoiceRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    micBtn.style.display = 'none';
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onresult = (event) => {
    const transcript = Array.from(event.results)
      .map(r => r[0].transcript)
      .join('');
    queryInput.value = transcript;

    // Auto-send on final result
    if (event.results[event.results.length - 1].isFinal) {
      stopRecording();
      if (transcript.trim()) sendQuery();
    }
  };

  recognition.onerror = () => stopRecording();
  recognition.onend = () => {
    if (isRecording) stopRecording();
  };
}

function startRecording() {
  if (!recognition) return;
  isRecording = true;
  micBtn.classList.add('recording');
  try { recognition.start(); } catch {}
}

function stopRecording() {
  isRecording = false;
  micBtn.classList.remove('recording');
  if (recognition) {
    try { recognition.stop(); } catch {}
  }
}

// ===== Event listeners =====
sendBtn.addEventListener('click', sendQuery);

micBtn.addEventListener('click', () => {
  if (isRecording) stopRecording();
  else startRecording();
});

queryInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendQuery();
  }
});

queryInput.addEventListener('input', () => {
  queryInput.style.height = 'auto';
  queryInput.style.height = Math.min(queryInput.scrollHeight, 80) + 'px';
});

queryInput.addEventListener('focus', () => {
  focusCount++;
  if (focusCount <= HINT_SHOW_COUNT) {
    inputWrapper.classList.add('show-hint');
    setTimeout(() => inputWrapper.classList.remove('show-hint'), 2500);
  }
});

// ===== Deep crawl =====

const BB = 'https://lms.sc.tsinghua.edu.cn';
const PORTAL_SEEDS = [
  `${BB}/`,
  `${BB}/webapps/portal/execute/tabs/tabAction?tab_tab_group_id=_1_1`,
  `${BB}/webapps/portal/execute/tabs/tabAction?tab_tab_group_id=_2_1`,
  `${BB}/webapps/portal/execute/tabs/tabAction?tab_tab_group_id=_3_1`,
  `${BB}/webapps/portal/execute/tabs/tabAction?tab_tab_group_id=_4_1`,
  `${BB}/webapps/portal/execute/tabs/tabAction?tab_tab_group_id=_5_1`,
  `${BB}/webapps/portal/execute/tabs/tabAction?tab_tab_group_id=_25_1`,
  `${BB}/webapps/portal/execute/tabs/tabAction?tab_tab_group_id=_30_1`,
  `${BB}/webapps/blackboard/execute/announcement?method=search&context=mybb`,
  `${BB}/webapps/portal/execute/tabs/tabAction?tabId=_1_1`,
  `${BB}/webapps/portal/execute/tabs/tabAction?tabId=_2_1`,
  `${BB}/webapps/portal/execute/tabs/tabAction?tabId=_3_1`,
  `${BB}/webapps/portal/execute/tabs/tabAction?tabId=_4_1`,
];

async function startCrawl({ fullRecrawl = false } = {}) {
  if (crawler) return;

  refreshBtn.classList.add('spinning');
  refreshBtn.disabled = true;

  const seeds = [...PORTAL_SEEDS];

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url?.includes('lms.sc.tsinghua.edu.cn')) {
      seeds.push(tab.url);
    }
  } catch {}

  crawler = new BlackboardCrawler({
    maxPages: 5000,
    delayMs: 150,
    flushEvery: 20,
    onProgress: ({ pages, queued, resources: count, done }) => {
      if (done) {
        updateHeaderStatus(count, Date.now());
      } else {
        statusDot.classList.add('active');
        statusText.textContent = `Scanning... ${pages} pages, ${count} resources (${queued} queued)`;
      }
    },
    onFlush: async (batch) => {
      await chrome.runtime.sendMessage({ type: 'SCRAPE_RESULT', resources: batch });
      await loadIndex();
    },
    // RAG: extract content from each crawled HTML page
    onPageHtml: async (pageUrl, html) => {
      const content = extractHtmlContent(html);
      if (content.length > 50) {
        const id = computeResourceId(pageUrl);
        await contentStore.set(id, content);
      }
    }
  });

  try {
    await crawler.crawl(seeds, { fullRecrawl });
    await loadIndex();

    // Post-crawl: extract PDF content for file resources
    extractPdfContentForResources();

    renderWelcomeOrEmpty();
  } catch (err) {
    addMessage('error', `Scan failed: ${err.message}`);
  } finally {
    crawler = null;
    refreshBtn.classList.remove('spinning');
    refreshBtn.disabled = false;
  }
}

// Background PDF content extraction after crawl
async function extractPdfContentForResources() {
  const pdfResources = resources.filter(r =>
    r.type === 'pdf' && r.url && r.id
  );

  // Only extract for resources we don't already have content for
  const ids = pdfResources.map(r => r.id);
  const existing = await contentStore.getBatch(ids);
  const missing = pdfResources.filter(r => !existing.has(r.id));

  // Extract up to 20 PDFs (don't overwhelm)
  const batch = missing.slice(0, 20);
  for (const r of batch) {
    try {
      const content = await extractPdfContent(r.url);
      if (content.length > 50) {
        await contentStore.set(r.id, content);
      }
    } catch {}
    // Small delay between PDF fetches
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}

// Normal click = incremental. Shift+click = full recrawl. Click during crawl = stop.
refreshBtn.addEventListener('click', (e) => {
  if (crawler) {
    crawler.abort();
    statusText.textContent = 'Scan stopped';
  } else {
    startCrawl({ fullRecrawl: e.shiftKey });
  }
});

// ===== Settings panel =====
const settingsPanel = document.getElementById('settingsPanel');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const providerSelect = document.getElementById('provider');
const apiKeyInput = document.getElementById('apiKey');
const modelInput = document.getElementById('model');
const toggleKeyBtn = document.getElementById('toggleKey');
const saveBtn = document.getElementById('saveBtn');
const validateBtn = document.getElementById('validateBtn');
const statusMessageEl = document.getElementById('statusMessage');
const exportBtn = document.getElementById('exportBtn');
const clearIndexBtn = document.getElementById('clearIndexBtn');
const clearChatBtn = document.getElementById('clearChatBtn');
const settingsIndexCount = document.getElementById('settingsIndexCount');
const settingsIndexUpdated = document.getElementById('settingsIndexUpdated');

const setupGuide = document.getElementById('setupGuide');
const standardSettings = document.getElementById('standardSettings');
const setupApiKey = document.getElementById('setupApiKey');
const setupSaveBtn = document.getElementById('setupSaveBtn');
const setupStatus = document.getElementById('setupStatus');
const setupHelpText = document.getElementById('setupHelpText');

const defaultModels = {
  claude: 'claude-sonnet-4-20250514',
  openai: 'gpt-4.1-mini',
  deepseek: 'deepseek-chat'
};

const providerHelp = {
  claude: { placeholder: 'sk-ant-...', link: 'https://console.anthropic.com/settings/keys', label: 'console.anthropic.com' },
  openai: { placeholder: 'sk-...', link: 'https://platform.openai.com/api-keys', label: 'platform.openai.com' },
  deepseek: { placeholder: 'sk-...', link: 'https://platform.deepseek.com/api_keys', label: 'platform.deepseek.com' }
};

let setupProvider = 'claude';

function showSettingsPanel() {
  const hasKey = settings && settings.apiKey;

  if (hasKey) {
    setupGuide.style.display = 'none';
    standardSettings.style.display = 'block';
    providerSelect.value = settings.provider || 'claude';
    apiKeyInput.value = settings.apiKey || '';
    modelInput.value = (settings.model && settings.model !== defaultModels[settings.provider]) ? settings.model : '';
    updateModelPlaceholder();
    updateSettingsIndexInfo();
  } else {
    setupGuide.style.display = 'block';
    standardSettings.style.display = 'none';
    updateSetupHelp();
  }

  settingsPanel.classList.add('open');
}

function hideSettingsPanel() {
  settingsPanel.classList.remove('open');
}

function updateModelPlaceholder() {
  modelInput.placeholder = defaultModels[providerSelect.value] || '';
}

function updateSetupHelp() {
  const info = providerHelp[setupProvider];
  setupApiKey.placeholder = info.placeholder;
  setupHelpText.innerHTML = `Get a key from <a href="${info.link}" target="_blank">${info.label}</a>`;
}

async function updateSettingsIndexInfo() {
  const { resource_index = [], index_meta = {} } = await chrome.storage.local.get(['resource_index', 'index_meta']);
  settingsIndexCount.textContent = resource_index.length;
  if (index_meta.lastUpdated) {
    settingsIndexUpdated.textContent = ` | ${new Date(index_meta.lastUpdated).toLocaleString()}`;
  }
}

function showStatus(el, text, type) {
  el.textContent = text;
  el.className = `status ${type}`;
  el.style.display = 'block';
  el.classList.remove('fade-out');
  if (type === 'success') {
    setTimeout(() => {
      el.classList.add('fade-out');
      setTimeout(() => { el.style.display = 'none'; }, 300);
    }, 2700);
  }
}

// Provider card selection (setup guide)
document.querySelectorAll('.provider-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.provider-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    setupProvider = card.dataset.provider;
    updateSetupHelp();
  });
});

// Setup Save & Test
setupSaveBtn.addEventListener('click', async () => {
  const apiKey = setupApiKey.value.trim();
  if (!apiKey) { showStatus(setupStatus, 'Please enter an API key.', 'error'); return; }

  const provider = setupProvider;
  const model = defaultModels[provider];
  const btnLabel = setupSaveBtn.querySelector('.btn-label');

  setupSaveBtn.disabled = true;
  btnLabel.textContent = 'Testing...';

  try {
    const client = new LLMClient(provider, apiKey, model);
    const result = await client.validate();

    if (result.valid) {
      await chrome.storage.local.set({ settings: { provider, apiKey, model } });
      settings = { provider, apiKey, model };
      showStatus(setupStatus, 'Connected! Settings saved.', 'success');
      btnLabel.textContent = 'Save & Test';
      updateInputState();

      setTimeout(() => {
        setupGuide.style.display = 'none';
        standardSettings.style.display = 'block';
        providerSelect.value = provider;
        apiKeyInput.value = apiKey;
        modelInput.value = '';
        updateModelPlaceholder();
        updateSettingsIndexInfo();
      }, 1000);

      if (!chatArea.querySelector('.message')) {
        renderWelcomeOrEmpty();
      }
      startCrawl();
    } else {
      showStatus(setupStatus, result.message || 'Connection failed. Check your key.', 'error');
      btnLabel.textContent = 'Save & Test';
    }
  } catch (err) {
    showStatus(setupStatus, `Failed: ${err.message}`, 'error');
    btnLabel.textContent = 'Save & Test';
  } finally {
    setupSaveBtn.disabled = false;
  }
});

settingsBtn.addEventListener('click', () => {
  if (settingsPanel.classList.contains('open')) {
    hideSettingsPanel();
  } else {
    showSettingsPanel();
  }
});

closeSettingsBtn.addEventListener('click', hideSettingsPanel);

providerSelect.addEventListener('change', updateModelPlaceholder);

saveBtn.addEventListener('click', async () => {
  const provider = providerSelect.value;
  const apiKey = apiKeyInput.value.trim();
  const model = modelInput.value.trim();
  if (!apiKey) { showStatus(statusMessageEl, 'Please enter an API key.', 'error'); return; }
  await chrome.storage.local.set({
    settings: { provider, apiKey, model: model || defaultModels[provider] }
  });
  settings = { provider, apiKey, model: model || defaultModels[provider] };
  updateInputState();
  showStatus(statusMessageEl, 'Settings saved.', 'success');
});

validateBtn.addEventListener('click', async () => {
  const provider = providerSelect.value;
  const apiKey = apiKeyInput.value.trim();
  const model = modelInput.value.trim() || defaultModels[provider];
  if (!apiKey) { showStatus(statusMessageEl, 'Enter an API key first.', 'error'); return; }
  validateBtn.disabled = true;
  validateBtn.textContent = 'Testing...';
  showStatus(statusMessageEl, 'Connecting...', 'info');
  try {
    const client = new LLMClient(provider, apiKey, model);
    const result = await client.validate();
    showStatus(statusMessageEl, result.message, result.valid ? 'success' : 'error');
  } catch (err) {
    showStatus(statusMessageEl, `Failed: ${err.message}`, 'error');
  } finally {
    validateBtn.disabled = false;
    validateBtn.textContent = 'Test';
  }
});

toggleKeyBtn.addEventListener('click', () => {
  if (apiKeyInput.type === 'password') {
    apiKeyInput.type = 'text';
    toggleKeyBtn.textContent = 'Hide';
  } else {
    apiKeyInput.type = 'password';
    toggleKeyBtn.textContent = 'Show';
  }
});

exportBtn.addEventListener('click', async () => {
  const { resource_index = [] } = await chrome.storage.local.get('resource_index');
  if (resource_index.length === 0) { showStatus(statusMessageEl, 'No resources to export.', 'error'); return; }
  exportIndex(resource_index);
  showStatus(statusMessageEl, `Exported ${resource_index.length} resources.`, 'success');
});

clearIndexBtn.addEventListener('click', async () => {
  if (!confirm('Clear all indexed resources?')) return;
  await chrome.runtime.sendMessage({ type: 'CLEAR_INDEX' });
  await chrome.storage.local.remove(['crawl_visited', 'crawl_visited_at']);
  await contentStore.clear();
  await loadIndex();
  await updateSettingsIndexInfo();
  showStatus(statusMessageEl, 'Index cleared.', 'success');
});

clearChatBtn.addEventListener('click', async () => {
  if (!confirm('Clear all chat history?')) return;
  await chrome.storage.local.set({ chat_history: [] });
  conversationMessages = [];
  showEmptyState();
  showStatus(statusMessageEl, 'Chat cleared.', 'success');
});

// ===== Storage change listener =====
chrome.storage.onChanged.addListener((changes) => {
  if (changes.settings) {
    settings = changes.settings.newValue;
    updateInputState();
  }
  if (changes.resource_index || changes.index_meta) {
    loadIndex();
  }
});

// ===== Init =====
init();
