// Index merge, dedup, and normalize utilities

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

function exportIndex(resources) {
  const blob = new Blob([JSON.stringify(resources, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `blackboard-index-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

if (typeof window !== 'undefined') {
  window.normalizeUrl = normalizeUrl;
  window.exportIndex = exportIndex;
}
