/* Cozy Space Missions — where the reader is standing.

   One copy of this, deliberately. Two things here are easy to get subtly wrong
   and expensive to get wrong twice: what gets written to storage on an origin
   shared with every other project on this GitHub account, and what happens to
   the text a geocoder sends back. Both pages that ask for a position go
   through this file, so there is one place to check and one place to fix.

   window.PLACE
     get()                the current place, or null
     set(p)               validate, remember, and tell everyone
     forget()             drop it
     on(fn)               called whenever it changes
     wire(ids, t, say)    attach a form, a results list and a locate button */

window.PLACE = (function () {
  'use strict';

  var STORE_KEY = 'csm.place';
  var GEOCODE = 'https://nominatim.openstreetmap.org/search';
  var MAX_RESULTS = 5;          // what we ask for; what we draw regardless

  /* What gets written down is deliberately blunter than what the page knows.
     Every project on a github.io account shares one origin, so anything else
     published under this account can read this key; three decimals is about a
     hundred metres, which changes no pass by a second but is not an address.
     The precise position the browser gave stays in memory for this visit. */
  var SAVED_PRECISION = 1000;

  var place = null;
  var listeners = [];

  /* Anything read back out of storage is treated as if a stranger wrote it:
     the numbers must be real angles on Earth, the names must be strings, and
     a name that runs away with itself gets cut. */
  function sane(p) {
    if (!p || typeof p !== 'object') return null;
    var lat = Number(p.lat), lon = Number(p.lon);
    if (!isFinite(lat) || !isFinite(lon)) return null;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return {
      lat: lat,
      lon: lon,
      label: typeof p.label === 'string' ? p.label.slice(0, 120) : '',
      sub: typeof p.sub === 'string' ? p.sub.slice(0, 160) : ''
    };
  }

  try {
    var raw = localStorage.getItem(STORE_KEY);
    if (raw) place = sane(JSON.parse(raw));
  } catch (e) { /* private mode, or nothing saved yet */ }

  function save() {
    try {
      if (!place) { localStorage.removeItem(STORE_KEY); return; }
      localStorage.setItem(STORE_KEY, JSON.stringify({
        lat: Math.round(place.lat * SAVED_PRECISION) / SAVED_PRECISION,
        lon: Math.round(place.lon * SAVED_PRECISION) / SAVED_PRECISION,
        label: place.label,
        sub: place.sub
      }));
    } catch (e) {}
  }

  function announce() {
    listeners.forEach(function (fn) {
      try { fn(place); } catch (e) { /* one bad listener must not stop the rest */ }
    });
  }

  function get() { return place; }

  function set(input) {
    var p = sane(input);
    if (!p) return null;
    place = p;
    save();
    announce();
    return p;
  }

  function forget() {
    place = null;
    save();
    announce();
  }

  function on(fn) {
    listeners.push(fn);
    return fn;
  }

  /* ------------------------------------------------------------------ */
  /*  Asking                                                             */
  /* ------------------------------------------------------------------ */

  /* The geocoder's answer is somebody else's text. Names go in through
     createTextNode, the list is capped at what we asked for however much comes
     back, and every string is cut to a sane length before it reaches the DOM. */
  function renderResults(ul, all, onPick, t) {
    ul.innerHTML = '';
    var list = (Array.isArray(all) ? all : []).slice(0, MAX_RESULTS);
    list.forEach(function (r) {
      var parts = String(r && r.display_name || '').slice(0, 300).split(',');
      var head = parts.shift().trim().slice(0, 120);
      var sub = parts.join(',').trim().slice(0, 160);

      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button';
      b.appendChild(document.createTextNode(head));
      if (sub) {
        var s = document.createElement('span');
        s.className = 'r-sub';
        s.textContent = sub;
        b.appendChild(s);
      }
      b.addEventListener('click', function () {
        onPick({ lat: parseFloat(r.lat), lon: parseFloat(r.lon), label: head, sub: sub });
      });
      li.appendChild(b);
      ul.appendChild(li);
    });
    ul.hidden = false;
    return list.length;
  }

  function search(query, lang) {
    var url = GEOCODE + '?format=jsonv2&limit=' + MAX_RESULTS + '&accept-language=' +
      encodeURIComponent(lang || 'en') + '&q=' + encodeURIComponent(query);
    return window.CSM.fetchJSON(url);
  }

  function locate() {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) { reject(new Error('unsupported')); return; }
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          resolve({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            label: null,          // resolved to "your position" at paint time
            sub: null
          });
        },
        function () { reject(new Error('denied')); },
        { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 }
      );
    });
  }

  /* ------------------------------------------------------------------ */

  /* Wires a form, a results list, a locate button and an error line together.
     `ids` names the elements; `t` translates; `say` announces to the one live
     region. Both pages that ask for a position use this, so the wording of a
     failure and the shape of the flow are the same on each. */
  function wire(ids, t, say) {
    var form = document.getElementById(ids.form);
    var input = document.getElementById(ids.input);
    var results = document.getElementById(ids.results);
    var locateBtn = document.getElementById(ids.locate);
    var submit = document.getElementById(ids.submit);
    var err = document.getElementById(ids.error);
    if (!form || !input || !results) return;

    function showError(key) {
      if (!err) return;
      err.textContent = t(key);
      err.hidden = false;
      if (say) say(err.textContent);
    }
    function clearError() { if (err) err.hidden = true; }

    function pick(p) {
      set(p);
      results.hidden = true;
      input.value = '';
      clearError();
    }

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var q = input.value.trim();
      if (q.length < 2) { showError('obs.err.short'); return; }
      if (submit) submit.disabled = true;
      clearError();
      results.hidden = true;

      search(q, window.CSM.lang())
        .then(function (list) {
          if (submit) submit.disabled = false;
          if (!list || !list.length) { showError('obs.err.none'); return; }
          var n = renderResults(results, list, pick, t);
          if (say) say(t('obs.results').replace('{n}', n));
        })
        .catch(function () {
          if (submit) submit.disabled = false;
          showError('obs.err.net');
        });
    });

    if (locateBtn) {
      locateBtn.addEventListener('click', function () {
        locateBtn.disabled = true;
        clearError();
        locate()
          .then(function (p) { locateBtn.disabled = false; pick(p); })
          .catch(function (e) {
            locateBtn.disabled = false;
            showError(e.message === 'unsupported' ? 'obs.err.geo' : 'obs.err.denied');
          });
      });
    }
  }

  return { get: get, set: set, forget: forget, on: on, wire: wire, search: search, locate: locate };
})();
