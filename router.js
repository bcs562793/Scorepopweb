/* ═══════════════════════════════════════════════
   SCOREPOP — router.js
   Hash tabanlı SEO dostu URL yönetimi
════════════════════════════════════════════════ */
'use strict';

const Router = (() => {

  const ROUTES = {
    live:     /^\/?(?:canli|live)?$/i,
    today:    /^\/?(?:bugun|today)(?:\/(\d{4}-\d{2}-\d{2}))?$/i,
    upcoming: /^\/?(?:yakin|upcoming|yarin)(?:\/(\d{4}-\d{2}-\d{2}))?$/i,
    match:    /^\/?mac\/(\d+)(?:-[^/]+)?$/i,
  };

  let _busy = false;

  function init() {
    window.addEventListener('popstate', () => {
      if (_busy) return;
      _handle();
    });

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

  function _consumeRedirectParam() {
    const sp   = new URLSearchParams(window.location.search);
    const path = sp.get('p');
    if (!path) return null;
    sp.delete('p');
    const qs = sp.toString();
    const cleanUrl = path + (qs ? '?' + qs : '');
    history.replaceState(null, '', cleanUrl);
    return path;
  }

  function _handle() {
    if (_busy) return;
    _busy = true;
    _handleInner();
    setTimeout(() => { _busy = false; }, 100);
  }

  function _handleInner() {
    const path = _getPath();

    const mMatch = path.match(ROUTES.match);
    if (mMatch) {
      const id = parseInt(mMatch[1], 10);
      if (!isNaN(id)) {
        if (typeof openDetail === 'function') openDetail(id, false);
        return;
      }
    }

    const todayMatch = path.match(ROUTES.today);
    if (todayMatch) {
      if (todayMatch[1]) S.date = todayMatch[1];
      if (typeof navigate === 'function') navigate('today');
      return;
    }

    const upMatch = path.match(ROUTES.upcoming);
    if (upMatch) {
      if (upMatch[1]) S.date = upMatch[1];
      if (typeof navigate === 'function') navigate('upcoming');
      return;
    }

    if (typeof navigate === 'function') navigate('live');
  }

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

    let canon = document.querySelector('link[rel="canonical"]');
    if (!canon) {
      canon = document.createElement('link');
      canon.rel = 'canonical';
      document.head.appendChild(canon);
    }
    canon.href = window.location.origin + window.location.pathname;

    _setOG('og:title',       document.title);
    _setOG('og:description', desc.content);
    _setOG('og:url',         canon.href);
    _setOG('og:type',        'website');
    _setOG('og:site_name',   'ScorePop');
  }

  /* Canlı sayılan status kodları — app.js / statusInfo ile senkron tutulmalı */
  const _LIVE_STATUS_CODES = new Set(['1H','2H','HT','ET','BT','P','LIVE']);

  function setMatchMeta(homeTeam, awayTeam, homeScore, awayScore, league, status, fixtureId, kickoffTime, homeLogo, awayLogo) {
    const hasScore = homeScore != null && awayScore != null;
    const scoreStr = hasScore ? `${homeScore}-${awayScore}` : 'vs';

    const isLiveStatus = _LIVE_STATUS_CODES.has(status);
    let stLabel = '';
    if (isLiveStatus && status !== 'HT') stLabel = '🔴 CANLI | ';
    else if (status === 'HT') stLabel = '⏸ Devre Arası | ';

    const title = `${stLabel}${homeTeam} ${scoreStr} ${awayTeam}`;
    const desc  = `${stLabel}${homeTeam} ${scoreStr} ${awayTeam} canlı skor, dakika dakika anlatım ve istatistikler.${league ? ' (' + league + ')' : ''}`;
    setPageMeta(title, desc);

    const startDateObj = kickoffTime ? new Date(kickoffTime) : new Date();
    const startDateISO = startDateObj.toISOString();
    const endDateISO = new Date(startDateObj.getTime() + 2 * 60 * 60 * 1000).toISOString();

    const imageUrl = homeLogo || awayLogo || 'https://scorepop.com.tr/logo.png';

    /* ── Doğru eventStatus: canlıda EventLive, bittiyse EventCompleted ── */
    const DONE_STATUSES = new Set(['FT','AET','PEN']);
    const eventStatus = isLiveStatus
      ? 'https://schema.org/EventLive'
      : DONE_STATUSES.has(status)
        ? 'https://schema.org/EventCompleted'
        : 'https://schema.org/EventScheduled';

    /* ── SportsEvent @id tanımla — LiveBlogPosting.about buraya referans verecek ── */
    const matchUrl = window.location.href;
    const sportsEventId = `${matchUrl}#event`;

    /* ── SportsEvent schema (her durumda) ── */
    _setJsonLD({
      '@context': 'https://schema.org',
      '@type': 'SportsEvent',
      '@id': sportsEventId,
      'name': `${homeTeam} - ${awayTeam}`,
      'sport': 'Soccer',
      'description': desc,
      'url': matchUrl,
      'startDate': startDateISO,
      'endDate': endDateISO,
      'image': imageUrl,
      'location': {
        '@type': 'Place',
        'name': 'Futbol Stadyumu',
        /* address boş bırakılmıyor — eksik ama zorunlu değil, bloğu kaldır */
      },
      'eventStatus': eventStatus,
      'organizer': {
        '@type': 'SportsOrganization',
        'name': league || 'Football',
        'url': 'https://scorepop.com.tr',
      },
      'performer': [
        { '@type': 'SportsTeam', 'name': homeTeam },
        { '@type': 'SportsTeam', 'name': awayTeam },
      ],
      'offers': {
        '@type': 'Offer',
        'name': 'Canlı Maç Takibi',
        'price': '0',
        'priceCurrency': 'TRY',
        'availability': 'https://schema.org/InStock',
        'url': matchUrl,
        'validFrom': startDateISO,   /* eksik "validFrom" uyarısı giderildi */
      },
      'homeTeam': { '@type': 'SportsTeam', 'name': homeTeam },
      'awayTeam': { '@type': 'SportsTeam', 'name': awayTeam },
      ...(hasScore ? {
        'homeScore': { '@type': 'Integer', 'value': homeScore },
        'awayScore': { '@type': 'Integer', 'value': awayScore },
      } : {}),
      ...(fixtureId ? { 'identifier': String(fixtureId) } : {}),
    });

    /* ── LiveBlogPosting schema (sadece canlı maçlar için) ─────────────
       about alanında yeni SportsEvent yaratma — @id ile referans ver.
       Böylece Google iki ayrı SportsEvent görmez, tek birleşik obje görür.
    ───────────────────────────────────────────────────────────────── */
    if (isLiveStatus) {
      _setLiveBlogJsonLD({
        '@context': 'https://schema.org',
        '@type': 'LiveBlogPosting',
        'headline': title,
        'description': desc,
        'url': matchUrl,
        'datePublished': startDateISO,
        'dateModified': new Date().toISOString(),
        'coverageStartTime': startDateISO,
        'coverageEndTime': endDateISO,
        'image': imageUrl,
        'publisher': {
          '@type': 'Organization',
          'name': 'ScorePop',
          'logo': { '@type': 'ImageObject', 'url': 'https://scorepop.com.tr/logo.png' },
        },
        'author': { '@type': 'Organization', 'name': 'ScorePop' },
        /* about: yeni SportsEvent değil, yukarıdaki @id'ye referans */
        'about': { '@id': sportsEventId },
      });
    } else {
      /* Canlı değilse LiveBlogPosting bloğunu kaldır */
      const old = document.getElementById('sp-liveblog-jsonld');
      if (old) old.remove();
    }
  }

  function _setLiveBlogJsonLD(data) {
    let el = document.getElementById('sp-liveblog-jsonld');
    if (!el) {
      el = document.createElement('script');
      el.id   = 'sp-liveblog-jsonld';
      el.type = 'application/ld+json';
      document.head.appendChild(el);
    }
    try { el.textContent = JSON.stringify(data); } catch(e) {}
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

  return {
    init,
    goLive, goToday, goUpcoming, goMatch, goBack,
    setPageMeta, setMatchMeta, setJsonLD: _setJsonLD,
  };

})();
