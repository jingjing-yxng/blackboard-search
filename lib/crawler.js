// Deep crawler — exhaustively fetches every Blackboard page reachable from the portal

class BlackboardCrawler {
  constructor({ onProgress, onFlush, onPageHtml, maxPages = 5000, delayMs = 150, flushEvery = 20 }) {
    this.onProgress = onProgress || (() => {});
    this.onFlush = onFlush || (() => {});
    this.onPageHtml = onPageHtml || null;
    this.maxPages = maxPages;
    this.delayMs = delayMs;
    this.flushEvery = flushEvery;
    this.visited = new Set();
    this.queue = [];
    this.resources = [];
    this.unflushed = [];
    this.seenResourceUrls = new Set();
    this.aborted = false;
    this.host = 'lms.sc.tsinghua.edu.cn';
  }

  abort() { this.aborted = true; }

  // Load visited URLs from previous crawls so we skip already-seen pages
  async loadCache() {
    try {
      const { crawl_visited = [] } = await chrome.storage.local.get('crawl_visited');
      for (const url of crawl_visited) this.visited.add(url);
    } catch {}
  }

  async saveCache() {
    try {
      await chrome.storage.local.set({
        crawl_visited: Array.from(this.visited),
        crawl_visited_at: Date.now()
      });
    } catch {}
  }

  async crawl(seedUrls, { fullRecrawl = false } = {}) {
    if (!fullRecrawl) {
      await this.loadCache();
    }

    // Always seed the provided URLs even if visited before
    for (const url of seedUrls) {
      const n = this._normalize(url);
      if (n) {
        this.visited.delete(n); // force re-visit seeds
        this.queue.push({ url: n });
      }
    }

    let pages = 0;

    while (this.queue.length > 0 && pages < this.maxPages && !this.aborted) {
      const { url } = this.queue.shift();
      if (this.visited.has(url)) continue;
      this.visited.add(url);

      this.onProgress({ pages, queued: this.queue.length, resources: this.resources.length, done: false });

      try {
        const { html, finalUrl } = await this._fetch(url);

        const normFinal = this._normalize(finalUrl);
        if (normFinal && normFinal !== url && this.visited.has(normFinal)) {
          pages++;
          continue;
        }
        if (normFinal) this.visited.add(normFinal);

        // Notify listener with raw HTML for content extraction (RAG)
        if (this.onPageHtml) {
          try { await this.onPageHtml(finalUrl, html); } catch {}
        }

        const { resources, links } = this._parse(html, finalUrl);

        for (const r of resources) {
          const n = this._normalize(r.url);
          if (n && !this.seenResourceUrls.has(n)) {
            this.seenResourceUrls.add(n);
            r.url = n;
            r.source_page = finalUrl;
            this.resources.push(r);
            this.unflushed.push(r);
          }
        }

        for (const link of links) {
          this._enqueue(link);
        }

        pages++;

        if (this.unflushed.length >= this.flushEvery) {
          await this.onFlush(this.unflushed);
          this.unflushed = [];
        }
      } catch (err) {
        if (err.message === 'Not authenticated') {
          // Skip this URL, keep going
        }
      }

      if (this.delayMs > 0 && this.queue.length > 0 && !this.aborted) {
        await new Promise(r => setTimeout(r, this.delayMs));
      }

      // Save cache periodically (every 50 pages)
      if (pages % 50 === 0) {
        await this.saveCache();
      }
    }

    if (this.unflushed.length > 0) {
      await this.onFlush(this.unflushed);
      this.unflushed = [];
    }

    await this.saveCache();
    this.onProgress({ pages, queued: 0, resources: this.resources.length, done: true });
    return this.resources;
  }

  _enqueue(url) {
    const n = this._normalize(url);
    if (n && !this.visited.has(n)) {
      this.queue.push({ url: n });
    }
  }

  async _fetch(url) {
    const resp = await fetch(url, { credentials: 'include', redirect: 'follow' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('text/html')) throw new Error('Not HTML');
    return { html: await resp.text(), finalUrl: resp.url };
  }

  _parse(html, pageUrl) {
    const doc = new DOMParser().parseFromString(html, 'text/html');

    if (doc.querySelector('#loginBox, input[name="user_id"]') ||
        doc.title?.toLowerCase().includes('login')) {
      throw new Error('Not authenticated');
    }

    const resources = [];
    const links = [];
    const seen = new Set();

    // Page context
    const breadcrumb = Array.from(
      doc.querySelectorAll('#breadcrumbs a, .path-text, .breadcrumb a, #pageTitleBar .path a')
    ).map(el => el.textContent.trim()).filter(Boolean).join(' > ');

    const pageTitle = doc.querySelector(
      '#pageTitleText, .page-title, #pageTitleBar span'
    )?.textContent?.trim() || '';

    const fallbackSection = breadcrumb || pageTitle;

    // 1) Frames and iframes — Blackboard portal often uses framesets
    for (const frame of doc.querySelectorAll('frame[src], iframe[src]')) {
      const src = frame.getAttribute('src');
      if (!src) continue;
      let href;
      try { href = new URL(src, pageUrl).href; } catch { continue; }
      try { if (new URL(href).hostname !== this.host) continue; } catch { continue; }
      links.push(href);
    }

    // 2) All <a> links on the page
    for (const a of doc.querySelectorAll('a[href]')) {
      const raw = a.getAttribute('href');
      if (!raw || raw.startsWith('javascript:') || raw.startsWith('#') || raw.startsWith('mailto:')) continue;

      let href;
      try { href = new URL(raw, pageUrl).href; } catch { continue; }
      try { if (new URL(href).hostname !== this.host) continue; } catch { continue; }

      if (seen.has(href)) continue;
      seen.add(href);

      const text = a.textContent.trim();
      if (!text || text.length < 2) continue;
      if (/^(log\s?out|sign\s?out|help|skip|cancel|close|ok|yes|no)$/i.test(text)) continue;

      const isFile = this._isFile(href);

      resources.push({
        title: text.slice(0, 200),
        url: href,
        type: this._detectType(href, text),
        description: this._descFor(a),
        section: this._sectionFor(a, doc, fallbackSection)
      });

      if (!isFile && this._isCrawlable(href)) {
        links.push(href);
      }
    }

    // 3) Blackboard content list items
    for (const item of doc.querySelectorAll('.contentListItem, .liItem, .read, .unread')) {
      const a = item.querySelector('a[href]');
      if (!a) continue;
      const raw = a.getAttribute('href');
      if (!raw) continue;
      let href;
      try { href = new URL(raw, pageUrl).href; } catch { continue; }
      if (seen.has(href)) continue;
      seen.add(href);

      const text = a.textContent.trim();
      const details = item.querySelector('.details, .contextItemDetailsHeaders, .vtbegenerated');

      resources.push({
        title: text.slice(0, 200) || 'Untitled',
        url: href,
        type: this._detectType(href, text),
        description: details ? details.textContent.replace(/\s+/g, ' ').trim().slice(0, 200) : '',
        section: this._sectionFor(a, doc, fallbackSection)
      });

      if (!this._isFile(href) && this._isCrawlable(href)) {
        links.push(href);
      }
    }

    return { resources, links };
  }

  _normalize(url) {
    try {
      const u = new URL(url);
      if (u.hostname !== this.host) return null;
      u.hash = '';
      for (const p of ['uniqueid', 'timestamp', 'nonce', 'lti_msg', 'lti_errormsg', 'new_loc']) {
        u.searchParams.delete(p);
      }
      return u.toString();
    } catch { return null; }
  }

  _isFile(url) {
    const l = url.toLowerCase();
    return /bbcswebdav|@X@/.test(l) ||
      /\.(pdf|docx?|xlsx?|pptx?|zip|rar|7z|tar|gz|mp4|avi|mov|webm|mp3|wav|ogg|png|jpe?g|gif|svg|bmp|csv|txt)($|\?)/i.test(l);
  }

  _isCrawlable(url) {
    const l = url.toLowerCase();
    if (/logout|logoff|signout/.test(l)) return false;
    if (/\/webapps\/login/.test(l)) return false;
    if (/action=(delete|toggleAvailability|gradeAttempt)|cmd=(delete|remove|grade)/.test(l)) return false;
    if (/\/api\//.test(l)) return false;
    if (/\.json($|\?)/.test(l)) return false;
    if (/\/webapps\/gradebook\//.test(l)) return false;
    if (/do(Action|Upload|Submit|Delete)/.test(l)) return false;
    return true;
  }

  _detectType(url, text) {
    const l = (url + ' ' + text).toLowerCase();
    if (/\.pdf($|\?)/.test(l)) return 'pdf';
    if (/\.(docx?|xlsx?|pptx?)($|\?)/.test(l)) return 'document';
    if (/\.(zip|rar|7z|tar)($|\?)/.test(l)) return 'archive';
    if (/\.(mp4|avi|mov|webm)($|\?)/.test(l)) return 'video';
    if (/\.(mp3|wav|ogg)($|\?)/.test(l)) return 'audio';
    if (/\.(png|jpe?g|gif|svg|bmp)($|\?)/.test(l)) return 'image';
    if (/announcement/.test(l)) return 'announcement';
    if (/course/.test(l) && /id/.test(l)) return 'course';
    return 'link';
  }

  _descFor(el) {
    const t = el.getAttribute('title') || el.getAttribute('aria-label') || '';
    if (t) return t.slice(0, 200);
    const p = el.closest('li, div, td, .item, .contentListItem');
    if (p) {
      const text = p.textContent.replace(/\s+/g, ' ').trim().slice(0, 200);
      if (text.length > el.textContent.trim().length + 10) return text;
    }
    return '';
  }

  _sectionFor(el, doc, fallback) {
    let node = el.parentElement;
    for (let i = 0; i < 10 && node; i++) {
      const h = node.querySelector('h2, h3, h4, .sectionTitle, .item-title');
      if (h) { const t = h.textContent.trim(); if (t && t.length < 100) return t; }
      const prev = node.previousElementSibling;
      if (prev && /^h[2-4]$/i.test(prev.tagName)) return prev.textContent.trim().slice(0, 100);
      node = node.parentElement;
    }
    return fallback;
  }
}

if (typeof window !== 'undefined') {
  window.BlackboardCrawler = BlackboardCrawler;
}
