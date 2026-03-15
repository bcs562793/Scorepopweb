/* ═══════════════════════════════════════════════
   SCOREPOP — router.js
   Hash tabanlı SEO dostu URL yönetimi
   Örnek:  scorepop.com.tr/#/canli
           scorepop.com.tr/#/bugun/2026-03-12
           scorepop.com.tr/#/mac/1234567-galatasaray-vs-fenerbahce
           scorepop.com.tr/#/yakin
════════════════════════════════════════════════ */
'use strict';

const Router = (() => {

  /* ── ROTALAR ──────────────────────────────── */
  const ROUTES = {
    live:     /^\/?(?:canli|live)?$/i,
    today:    /^\/?(?:bugun|today)(?:\/(\d{4}-\d{2}-\d{2}))?$/i,
    upcoming: /^\/?(?:yakin|upcoming|yarin)(?:\/(\d{4}-\d{2}-\d{2}))?$/i,
    match:    /^\/?mac\/(\d+)(?:-[^/]+)?$/i,
  };

  /* ── BAŞLAT ────────────────────────────────── */
  let _busy = false;

  function init() {
    // popstate: geri/ileri butonu
    window.addEventListener('popstate', () => {
      if (_busy) return;
      _handle();
    });

    // 404.html'den gelen yönlendirme parametresi
    const redirectPath = _consumeRedirectParam();

    const path = redirectPath || _getPath();
    const isEmpty = !path || path === '/' || path === '';
    if (isEmpty) {
      history.replaceState(null, '', '/canli');
      if (typeof navigate === 'function') navigate('live');
    } else {
      _handle();
    }
  }

  /* 404.html trick: ?p=/mac/123 parametresini al ve URL'e yaz */
  function _consumeRedirectParam() {
    const sp   = new URLSearchParams(window.location.search);
    const path = sp.get('p');
    if (!path) return null;
    // Parametreyi temizle, gerçek URL'e yaz
    sp.delete('p');
    const qs = sp.toString();
    const cleanUrl = path + (qs ? '?' + qs : '');
    history.replaceState(null, '', cleanUrl);
    return path;
  }

  /* ── HASH İŞLE ─────────────────────────────── */
  function _handle() {
    if (_busy) return;
    _busy = true;
    _handleInner();
    setTimeout(() => { _busy = false; }, 100);
  }

  function _handleInner() {
    const path = _getPath();

    /* /mac/ID-slug */
    const mMatch = path.match(ROUTES.match);
    if (mMatch) {
      const id = parseInt(mMatch[1], 10);
      if (!isNaN(id)) {
        if (typeof openDetail === 'function') openDetail(id, false);
        return;
      }
    }

    /* /bugun veya /bugun/2026-03-12 */
    const todayMatch = path.match(ROUTES.today);
    if (todayMatch) {
      if (todayMatch[1]) S.date = todayMatch[1];
      if (typeof navigate === 'function') navigate('today');
      return;
    }

    /* /yakin */
    const upMatch = path.match(ROUTES.upcoming);
    if (upMatch) {
      if (upMatch[1]) S.date = upMatch[1];
      if (typeof navigate === 'function') navigate('upcoming');
      return;
    }

    /* / veya /canli (varsayılan) */
    if (typeof navigate === 'function') navigate('live');
  }

  /* ── URL PUSH ──────────────────────────────── */
  function goLive() {
    _busy = true;
    _pushPath('/canli');
    setTimeout(() => { _busy = false; }, 150);
  }

  function goToday(date) {
    _busy = true;
    _pushPath(date ? `/bugun/${date}` : '/bugun');
    setTimeout(() => { _busy = false; }, 150);
  }

  function goUpcoming(date) {
    _busy = true;
    _pushPath(date ? `/yakin/${date}` : '/yakin');
    setTimeout(() => { _busy = false; }, 150);
  }

  /**
   * Maç detay sayfası URL'i
   * scorepop.com.tr/mac/1234567-galatasaray-vs-fenerbahce
   */
  function goMatch(fixtureId, homeTeam, awayTeam) {
    _busy = true;
    const slug = _makeSlug(homeTeam, awayTeam);
    _pushPath(`/mac/${fixtureId}${slug ? '-' + slug : ''}`);
    setTimeout(() => { _busy = false; }, 150);
  }

  function goBack() {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      goLive();
    }
  }

  /* ── SEO: <title> ve <meta> güncelle ─────── */
  function setPageMeta(title, description) {
    document.title = title
      ? `${title} — ScorePop`
      : 'ScorePop — Canlı Maç Sonuçları';

    let desc = document.querySelector('meta[name="description"]');
    if (!desc) {
      desc = document.createElement('meta');
      desc.name = 'description';
      document.head.appendChild(desc);
    }
    desc.content = description || 'Canlı maç skorları, anlık sonuçlar ve istatistikler.';

    /* Canonical URL */
    let canon = document.querySelector('link[rel="canonical"]');
    if (!canon) {
      canon = document.createElement('link');
      canon.rel = 'canonical';
      document.head.appendChild(canon);
    }
    canon.href = window.location.origin + window.location.pathname;

    /* Open Graph */
    _setOG('og:title',       document.title);
    _setOG('og:description', desc.content);
    _setOG('og:url',         canon.href);
    _setOG('og:type',        'website');
    _setOG('og:site_name',   'ScorePop');
  }

  function setMatchMeta(homeTeam, awayTeam, homeScore, awayScore, league, status, fixtureId) {
    // Skor metni
    const hasScore = homeScore != null && awayScore != null;
    const scoreStr = hasScore ? `${homeScore}-${awayScore}` : 'vs';

    // Durum etiketi
    let stLabel = '';
    if (status === 'live' || status === 'inprogress') stLabel = '🔴 CANLI | ';
    else if (status === 'ht') stLabel = '⏸ Devre Arası | ';

    // <title> ve <meta description>
    const title = `${stLabel}${homeTeam} ${scoreStr} ${awayTeam}`;
    const desc  = `${stLabel}${homeTeam} ${scoreStr} ${awayTeam} canlı skor, dakika dakika anlatım ve istatistikler.${league ? ' (' + league + ')' : ''}`;
    setPageMeta(title, desc);

    // Schema.org SportsEvent JSON-LD — Google bu veriyi anlık skor için kullanır
    _setJsonLD({
      '@context': 'https://schema.org',
      '@type': 'SportsEvent',
      'name': `${homeTeam} - ${awayTeam}`,
      'sport': 'Soccer',
      'description': desc,
      'organizer': { '@type': 'SportsOrganization', 'name': league || 'Football' },
      'homeTeam': { '@type': 'SportsTeam', 'name': homeTeam },
      'awayTeam': { '@type': 'SportsTeam', 'name': awayTeam },
      'url': window.location.href,
      ...(hasScore ? {
        'homeScore': { '@type': 'Integer', 'value': homeScore },
        'awayScore': { '@type': 'Integer', 'value': awayScore },
      } : {}),
      ...(fixtureId ? { 'identifier': String(fixtureId) } : {}),
    });
  }

  function _setJsonLD(data) {
    let el = document.getElementById('sp-jsonld');
    if (!el) {
      el = document.createElement('script');
      el.id   = 'sp-jsonld';
      el.type = 'application/ld+json';
      document.head.appendChild(el);
    }
    try { el.textContent = JSON.stringify(data); } catch(e) {}
  }

  /* ── YARDIMCILAR ──────────────────────────── */
  function _getPath() {
    return window.location.pathname || '/';
  }

  function _pushPath(path) {
    if (window.location.pathname !== path) {
      history.pushState(null, '', path);
    }
  }

  function _makeSlug(...parts) {
    return parts
      .filter(Boolean)
      .join('-vs-')
      .toLowerCase()
      .replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s')
      .replace(/ı/g,'i').replace(/ö/g,'o').replace(/ç/g,'c')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80);
  }

  function _setOG(prop, content) {
    let el = document.querySelector(`meta[property="${prop}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute('property', prop);
      document.head.appendChild(el);
    }
    el.content = content;
  }

  /* ── PUBLIC ────────────────────────────────── */
  return {
    init,
    goLive, goToday, goUpcoming, goMatch, goBack,
    setPageMeta, setMatchMeta, setJsonLD: _setJsonLD,
  };

})();
