'use strict';

const Indexing = (() => {

  const LIVE_STATUSES = new Set(['1H','2H','HT','ET','BT','P','LIVE']);
  const _pinged = new Set();

  function pingMatchPage(fixtureId, statusShort, slug) {
    const id = String(fixtureId);
    if (_pinged.has(id)) return;
    _pinged.add(id);

    const base    = (window.SITE_BASE_URL || window.location.origin).replace(/\/$/, '');
    const path    = slug ? `/mac/${id}-${slug}` : `/mac/${id}`;
    const fullUrl = base + path;

    _pingEdgeFunction(fullUrl);
  }

  async function _pingEdgeFunction(url) {
    const edgeUrl = window.INDEXING_EDGE_URL;
    if (!edgeUrl || edgeUrl.includes('BURAYA')) return;
    try {
      const res  = await fetch(edgeUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ url, type: 'URL_UPDATED' }),
        signal:  AbortSignal.timeout(10000),
      });
      const data = await res.json();
      console.info('[Indexing]', url, data);
    } catch (e) {
      console.warn('[Indexing] hata:', e.message);
    }
  }

  return { pingMatchPage };

})();
