/* Cozy Space Missions — what has been happening up there lately.

   Headlines come from the Spaceflight News API, which aggregates NASA and the
   spaceflight press. Everything that comes back is somebody else's text: it is
   put on the page with textContent, never as markup, and only https links are
   followed. The fetch waits until the section is actually scrolled into view. */

(function () {
  'use strict';

  var CSM = window.CSM;
  var $ = function (id) { return document.getElementById(id); };

  var FEED = 'https://api.spaceflightnewsapi.net/v4/articles/?search=' +
             encodeURIComponent(CSM.sat.news) + '&limit=6&ordering=-published_at';

  var articles = null;
  var loading = false;
  var failed = false;

  /* --- how long ago, in the reader's language --------------------------- */

  var UNITS = [
    ['year', 31536000], ['month', 2592000], ['week', 604800],
    ['day', 86400], ['hour', 3600], ['minute', 60]
  ];

  function ago(iso) {
    var t = Date.parse(iso);
    if (!isFinite(t)) return '';
    var locale = CSM.t('locale');
    var seconds = (Date.now() - t) / 1000;

    if (typeof Intl === 'undefined' || !Intl.RelativeTimeFormat) {
      return new Date(t).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
    }
    var rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    for (var i = 0; i < UNITS.length; i++) {
      if (seconds >= UNITS[i][1]) {
        return rtf.format(-Math.round(seconds / UNITS[i][1]), UNITS[i][0]);
      }
    }
    return rtf.format(0, 'minute');
  }

  /* --- rendering -------------------------------------------------------- */

  function render() {
    var list = $('news-list');
    var status = $('news-status');
    list.innerHTML = '';

    if (failed) {
      status.hidden = false;
      status.textContent = '';
      status.appendChild(document.createTextNode(CSM.t('news.error') + ' '));
      var a = document.createElement('a');
      a.href = CSM.t('news.fallbackUrl');
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = CSM.t('news.fallback');
      status.appendChild(a);
      return;
    }

    if (!articles) {
      status.hidden = false;
      status.textContent = CSM.t(loading ? 'news.loading' : 'news.waiting');
      return;
    }

    if (!articles.length) {
      status.hidden = false;
      status.textContent = CSM.t('news.empty');
      return;
    }

    status.hidden = true;

    articles.forEach(function (art) {
      var li = document.createElement('li');

      var a = document.createElement('a');
      a.className = 'news-link';
      a.href = art.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';

      var title = document.createElement('span');
      title.className = 'news-title';
      title.textContent = art.title;              // their words, as plain text

      var icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.setAttribute('class', 'ico news-ico');
      icon.setAttribute('aria-hidden', 'true');
      var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', '#i-external');
      icon.appendChild(use);

      var away = document.createElement('span');
      away.className = 'sr-only';
      away.textContent = ' ' + CSM.t('news.newtab');

      a.appendChild(title);
      a.appendChild(icon);
      a.appendChild(away);

      var meta = document.createElement('p');
      meta.className = 'news-meta';
      var site = document.createElement('span');
      site.className = 'news-site';
      site.textContent = art.site;
      meta.appendChild(site);
      var when = ago(art.at);
      if (when) {
        var sep = document.createElement('span');
        sep.className = 'sep';
        sep.textContent = '·';
        meta.appendChild(sep);
        meta.appendChild(document.createTextNode(when));
      }

      li.appendChild(a);
      li.appendChild(meta);
      list.appendChild(li);
    });
  }

  /* --- loading ---------------------------------------------------------- */

  function clean(raw) {
    var seen = {};
    return (raw || []).filter(function (a) {
      if (!a || typeof a.url !== 'string' || a.url.indexOf('https://') !== 0) return false;
      if (!a.title || seen[a.title]) return false;
      seen[a.title] = true;
      return true;
    }).slice(0, 5).map(function (a) {
      return {
        title: String(a.title).slice(0, 180),
        url: a.url,
        site: String(a.news_site || '').slice(0, 40),
        at: a.published_at
      };
    });
  }

  function load() {
    if (loading || articles) return;
    loading = true;
    render();

    CSM.fetchJSON(FEED)
      .then(function (d) {
        loading = false;
        articles = clean(d && d.results);
        render();
        CSM.announce(CSM.t('news.found').replace('{n}', articles.length));
      })
      .catch(function () {
        loading = false;
        failed = true;
        render();
      });
  }

  /* Nothing is fetched until the section is on its way into view. */
  var section = $('news');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { io.disconnect(); load(); }
      });
    }, { rootMargin: '300px 0px' });
    io.observe(section);
  } else {
    load();
  }

  CSM.on('lang', render);
  render();
})();
