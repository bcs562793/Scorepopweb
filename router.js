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
  let _busy = false;   // sonsuz döngü koruması

  function init() {
    window.addEventListener('hashchange', () => {
      if (_busy) return;
      _handle();
    });

    /* Hash yoksa /canli'ye yönlendir, varsayılan sayfa */
    const hash = _getHash();
    const isEmpty = !hash || hash === '/' || hash === '';
    if (isEmpty) {
      /* Hash'i sessizce kur — hashchange tetiklemez */
      history.replaceState(null, '', '#/canli');
      if (typeof navigate === 'function') navigate('live');
    } else {
      _handle();
    }
  }

  /* ── HASH İŞLE ─────────────────────────────── */
  function _handle() {
    if (_busy) return;
    _busy = true;
    _handleInner();
    setTimeout(() => { _busy = false; }, 100);
  }

  function _handleInner() {
    const hash = _getHash();

    /* /mac/ID-slug */
    const mMatch = hash.match(ROUTES.match);
    if (mMatch) {
      const id = parseInt(mMatch[1], 10);
      if (!isNaN(id)) {
        /* Sayfa hangisinden açılmış bilemeyiz → önce live_matches dene */
        if (typeof openDetail === 'function') openDetail(id, false);
        return;
      }
    }

    /* /bugun veya /bugun/2026-03-12 */
    const todayMatch = hash.match(ROUTES.today);
    if (todayMatch) {
      if (todayMatch[1]) S.date = todayMatch[1];
      if (typeof navigate === 'function') navigate('today');
      return;
    }

    /* /yakin */
    const upMatch = hash.match(ROUTES.upcoming);
    if (upMatch) {
      if (upMatch[1]) S.date = upMatch[1];
      if (typeof navigate === 'function') navigate('upcoming');
      return;
    }

    /* / veya /canli (varsayılan) */
    if (typeof navigate === 'function') navigate('live');
  }  // _handleInner sonu

  /* ── URL PUSH ──────────────────────────────── */
  function goLive() {
    _busy = true;
    _setHash('/canli');
    setTimeout(() => { _busy = false; }, 150);
  }

  function goToday(date) {
    _busy = true;
    _setHash(date ? `/bugun/${date}` : '/bugun');
    setTimeout(() => { _busy = false; }, 150);
  }

  function goUpcoming(date) {
    _busy = true;
    _setHash(date ? `/yakin/${date}` : '/yakin');
    setTimeout(() => { _busy = false; }, 150);
  }

  /**
   * Maç detay sayfası URL'i
   * scorepop.com.tr/#/mac/1234567-galatasaray-vs-fenerbahce
   */
  function goMatch(fixtureId, homeTeam, awayTeam) {
    _busy = true;
    const slug = _makeSlug(homeTeam, awayTeam);
    _setHash(`/mac/${fixtureId}${slug ? '-' + slug : ''}`);
    setTimeout(() => { _busy = false; }, 150);
  }

  function goBack() {
    /* Önceki hash varsa geri git, yoksa canlıya dön */
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
    canon.href = window.location.origin + window.location.pathname + window.location.hash;

    /* Open Graph */
    _setOG('og:title',       document.title);
    _setOG('og:description', desc.content);
    _setOG('og:url',         canon.href);
    _setOG('og:type',        'website');
    _setOG('og:site_name',   'ScorePop');
  }

  function setMatchMeta(homeTeam, awayTeam, homeScore, awayScore, league) {
    const scoreStr = (homeScore != null && awayScore != null)
      ? `${homeScore}-${awayScore}`
      : 'v';
    const title = `${homeTeam} ${scoreStr} ${awayTeam}`;
    const desc  = `${league ? league + ' — ' : ''}${homeTeam} - ${awayTeam} canlı skor ve istatistikler`;
    setPageMeta(title, desc);
  }

  /* ── YARDIMCILAR ──────────────────────────── */
  function _getHash() {
    return (window.location.hash || '#/').replace(/^#/, '') || '/';
  }

  function _setHash(path) {
    const newHash = '#' + path;
    if (window.location.hash !== newHash) {
      window.location.hash = path;
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
    setPageMeta, setMatchMeta,
  };

})();
