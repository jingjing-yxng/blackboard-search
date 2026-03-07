// Service Worker — Message hub and index storage manager

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Listen for messages from content scripts and side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SCRAPE_RESULT') {
    handleScrapeResult(message.resources).then(result => {
      sendResponse(result);
    });
    return true; // async response
  }

  if (message.type === 'GET_INDEX') {
    getIndex().then(data => {
      sendResponse(data);
    });
    return true;
  }

  if (message.type === 'CLEAR_INDEX') {
    clearIndex().then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'TRIGGER_SCRAPE') {
    triggerScrape(message.tabId).then(result => {
      sendResponse(result);
    });
    return true;
  }

  if (message.type === 'STORE_CONTENT') {
    storeContent(message.resourceId, message.content).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'GET_CONTENT') {
    getContent(message.resourceIds).then(contents => {
      sendResponse({ contents });
    });
    return true;
  }

  if (message.type === 'CLEAR_CONTENT') {
    clearContent().then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
});

// Normalize URL: strip session tokens, keep meaningful params
function normalizeUrl(url) {
  try {
    const u = new URL(url);
    const keepParams = ['course_id', 'content_id', 'mode', 'type'];
    const params = new URLSearchParams();
    for (const key of keepParams) {
      if (u.searchParams.has(key)) {
        params.set(key, u.searchParams.get(key));
      }
    }
    u.search = params.toString();
    u.hash = '';
    return u.toString();
  } catch {
    return url;
  }
}

// Generate a stable ID from normalized URL
function resourceId(url) {
  const normalized = normalizeUrl(url);
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) - hash + normalized.charCodeAt(i)) | 0;
  }
  return 'r_' + Math.abs(hash).toString(36);
}

// Merge scraped resources into index
async function handleScrapeResult(resources) {
  const { resource_index = [] } = await chrome.storage.local.get('resource_index');
  const indexMap = new Map(resource_index.map(r => [r.id, r]));

  let added = 0;
  let updated = 0;

  for (const res of resources) {
    const normalizedUrl = normalizeUrl(res.url);
    const id = resourceId(res.url);
    const existing = indexMap.get(id);

    const entry = {
      id,
      title: res.title || 'Untitled',
      url: normalizedUrl,
      type: res.type || 'link',
      description: (res.description || '').slice(0, 200),
      section: res.section || '',
      source_page: res.source_page || '',
      scraped_at: Date.now()
    };

    if (existing) {
      // Update if we have better data
      if (entry.title !== 'Untitled' || !existing.title) {
        indexMap.set(id, { ...existing, ...entry });
        updated++;
      }
    } else {
      indexMap.set(id, entry);
      added++;
    }
  }

  const newIndex = Array.from(indexMap.values());

  await chrome.storage.local.set({
    resource_index: newIndex,
    index_meta: {
      lastUpdated: Date.now(),
      count: newIndex.length
    }
  });

  return { success: true, added, updated, total: newIndex.length };
}

// Get current index
async function getIndex() {
  const { resource_index = [], index_meta = { lastUpdated: 0, count: 0 } } =
    await chrome.storage.local.get(['resource_index', 'index_meta']);
  return { resources: resource_index, meta: index_meta };
}

// Clear index and content store
async function clearIndex() {
  await chrome.storage.local.set({
    resource_index: [],
    index_meta: { lastUpdated: Date.now(), count: 0 },
    content_store: {}
  });
}

// Store extracted content for a resource
async function storeContent(resourceId, content) {
  const { content_store = {} } = await chrome.storage.local.get('content_store');
  content_store[resourceId] = content;
  await chrome.storage.local.set({ content_store });
}

// Get stored content for multiple resources
async function getContent(resourceIds) {
  const { content_store = {} } = await chrome.storage.local.get('content_store');
  const result = {};
  for (const id of resourceIds) {
    if (content_store[id] !== undefined) {
      result[id] = content_store[id];
    }
  }
  return result;
}

// Clear all stored content
async function clearContent() {
  await chrome.storage.local.set({ content_store: {} });
}

// Trigger scrape on a specific tab
async function triggerScrape(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/scraper.js']
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
