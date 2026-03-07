// Content Script — DOM scraping on Blackboard pages
(function () {
  // Avoid running multiple times on the same page
  if (window.__blackboardScraperRan) return;
  window.__blackboardScraperRan = true;

  // Detect login page — skip if not authenticated
  if (
    document.querySelector('#loginBox') ||
    document.querySelector('input[name="user_id"]') ||
    document.title.toLowerCase().includes('login')
  ) {
    return;
  }

  const currentUrl = window.location.href;
  const currentTitle = document.title;

  // Get breadcrumb path
  function getBreadcrumb() {
    const crumbs = document.querySelectorAll(
      '#breadcrumbs a, .path-text, .breadcrumb a, #pageTitleBar .path a'
    );
    return Array.from(crumbs)
      .map(el => el.textContent.trim())
      .filter(Boolean)
      .join(' > ');
  }

  // Detect file type from URL or link text
  function detectType(url, text) {
    const lower = (url + ' ' + text).toLowerCase();
    if (/\.pdf($|\?)/.test(lower)) return 'pdf';
    if (/\.(docx?|xlsx?|pptx?)($|\?)/.test(lower)) return 'document';
    if (/\.(zip|rar|7z|tar)($|\?)/.test(lower)) return 'archive';
    if (/\.(mp4|avi|mov|webm)($|\?)/.test(lower)) return 'video';
    if (/\.(mp3|wav|ogg)($|\?)/.test(lower)) return 'audio';
    if (/\.(png|jpe?g|gif|svg|bmp)($|\?)/.test(lower)) return 'image';
    if (/announcement/.test(lower)) return 'announcement';
    if (/course/.test(lower) && /id/.test(lower)) return 'course';
    return 'link';
  }

  // Get nearby text as description
  function getNearbyText(el) {
    // Try: next sibling text, parent's text content, title/aria-label
    const title = el.getAttribute('title') || el.getAttribute('aria-label') || '';
    if (title) return title.slice(0, 200);

    const parent = el.closest('li, div, td, .item, .contentListItem');
    if (parent) {
      const text = parent.textContent
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200);
      // Don't return if it's just the link text
      const linkText = el.textContent.trim();
      if (text.length > linkText.length + 10) {
        return text;
      }
    }
    return '';
  }

  // Get section heading for context
  function getSection(el) {
    // Walk up the DOM looking for a heading
    let node = el.parentElement;
    for (let i = 0; i < 10 && node; i++) {
      const heading = node.querySelector('h2, h3, h4, .sectionTitle, .item-title');
      if (heading) {
        const text = heading.textContent.trim();
        if (text && text.length < 100) return text;
      }
      // Check if the node itself has a heading sibling
      const prev = node.previousElementSibling;
      if (
        prev &&
        /^h[2-4]$/i.test(prev.tagName)
      ) {
        return prev.textContent.trim().slice(0, 100);
      }
      node = node.parentElement;
    }
    return getBreadcrumb();
  }

  // Main scraping
  const resources = [];
  const seenUrls = new Set();

  // Scrape all meaningful links
  const links = document.querySelectorAll('a[href]');
  for (const link of links) {
    const href = link.href;

    // Skip non-http, javascript:, mailto:, and empty links
    if (!href || !href.startsWith('http') || href === currentUrl) continue;

    // Skip navigation/UI links
    const text = link.textContent.trim();
    if (!text || text.length < 2) continue;
    if (/^(log\s?out|sign\s?out|help|skip|#)$/i.test(text)) continue;

    // Skip external links (not Blackboard)
    try {
      const u = new URL(href);
      if (u.hostname !== 'lms.sc.tsinghua.edu.cn') continue;
    } catch {
      continue;
    }

    // Dedup by URL within this page
    if (seenUrls.has(href)) continue;
    seenUrls.add(href);

    const type = detectType(href, text);
    const description = getNearbyText(link);
    const section = getSection(link);

    resources.push({
      title: text.slice(0, 200),
      url: href,
      type,
      description,
      section,
      source_page: currentUrl
    });
  }

  // Also scrape any embedded content items (Blackboard-specific)
  const contentItems = document.querySelectorAll(
    '.contentListItem, .liItem, .read, .unread'
  );
  for (const item of contentItems) {
    const link = item.querySelector('a[href]');
    if (!link || seenUrls.has(link.href)) continue;

    const href = link.href;
    if (!href.startsWith('http')) continue;

    seenUrls.add(href);
    const text = link.textContent.trim();
    const details = item.querySelector('.details, .contextItemDetailsHeaders');
    const description = details
      ? details.textContent.replace(/\s+/g, ' ').trim().slice(0, 200)
      : getNearbyText(link);

    resources.push({
      title: text.slice(0, 200) || 'Untitled',
      url: href,
      type: detectType(href, text),
      description,
      section: getSection(link),
      source_page: currentUrl
    });
  }

  // Send results to service worker
  if (resources.length > 0) {
    chrome.runtime.sendMessage(
      { type: 'SCRAPE_RESULT', resources },
      response => {
        if (chrome.runtime.lastError) {
          console.log('[Blackboard Search] Error sending scrape results:', chrome.runtime.lastError.message);
        } else {
          console.log(`[Blackboard Search] Indexed ${response?.total || 0} total resources (+${response?.added || 0} new)`);
        }
      }
    );
  }
})();
