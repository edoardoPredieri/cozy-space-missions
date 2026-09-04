/* Cozy Space Missions — strings.
   English is the default; Italian is the alternative.
   Keys ending in .h1 / .p / .sources / .meta may contain inline markup. */

window.I18N = {

  en: {
    'html.lang': 'en',
    'locale': 'en-GB',
    'doc.title': 'Cozy Space Missions — where the ISS is right now',
    'doc.desc': "A quiet window on the sky: the International Space Station's live position, with a night map, ground track and the day/night line.",

    'lang.group': 'Language',
    'brand.sub': 'A quiet window on the sky',

    'hero.h1': 'Where the <em>Space&nbsp;Station</em> is, right now.',
    'hero.lede': 'Some four hundred kilometres above our heads, seven people go around the Earth sixteen times a day. This page follows them, quietly.',

    'map.title': 'Live position',
    'map.alt': 'World map showing the current position of the International Space Station',
    'legend.iss': 'ISS',
    'legend.track': 'ground track',
    'legend.night': 'night',
    'overhead.label': 'Point below the Station',

    'stats.group': 'Flight data',
    'stat.lat': 'Latitude',
    'stat.lon': 'Longitude',
    'stat.alt': 'Altitude',
    'stat.vel': 'Speed',
    'stat.light': 'Light',
    'stat.foot': 'Visible horizon',

    'dir.n': 'N', 'dir.s': 'S', 'dir.e': 'E', 'dir.w': 'W',
    'unit.km': 'km',
    'unit.kmh': 'km/h',
    'unit.across': 'km across',
    'vis.day': 'in sunlight',
    'vis.night': "in the Earth's shadow",

    'status.listening': 'listening…',
    'status.updated': 'updated at {time}',
    'status.lost': 'connection lost, retrying…',

    'ocean.pacific': 'the Pacific Ocean',
    'ocean.atlantic': 'the Atlantic Ocean',
    'ocean.indian': 'the Indian Ocean',
    'ocean.southern': 'the Southern Ocean',
    'ocean.arctic': 'the Arctic Ocean',
    'ocean.open': 'the open sea',

    'notes.title': 'How to read the map',
    'notes.trail.h': 'The trail',
    'notes.trail.p': 'The amber line is the ground track: where the Station has been over the past hour, and where it will be over the next one. Each lap takes about ninety minutes.',
    'notes.shadow.h': 'The shadow',
    'notes.shadow.p': 'The darker band is the half of the Earth where it is night. The ISS is visible to the naked eye only while it is still in sunlight and the ground below is already dark.',
    'notes.circle.h': 'The circle',
    'notes.circle.p': 'The thin circle is the horizon: from anywhere inside it, with a clear enough sky, the Station is above the horizon line.',

    'road.title': 'What comes next',
    'road.1': 'Live ISS map',
    'road.2': 'More missions: Hubble, Tiangong, Roman, JWST',
    'road.3': 'Enter your city and find out when to look up',
    'road.4': 'iOS app',

    'foot.sources': 'Flight data from <a href="https://wheretheiss.at/w/developer" rel="noopener">Where the ISS at?</a>. Borders from Natural Earth. No cookies, no tracking.',
    'foot.meta': 'Made slowly · <a href="https://github.com/edoardoPredieri/cozy-space-missions" rel="noopener">source on GitHub</a>'
  },

  it: {
    'html.lang': 'it',
    'locale': 'it-IT',
    'doc.title': 'Cozy Space Missions — dove si trova la ISS adesso',
    'doc.desc': 'Una finestra tranquilla sul cielo: la posizione in tempo reale della Stazione Spaziale Internazionale, con mappa notturna, traccia a terra e linea del giorno.',

    'lang.group': 'Lingua',
    'brand.sub': 'Una finestra tranquilla sul cielo',

    'hero.h1': 'Dove si trova la <em>Stazione&nbsp;Spaziale</em>, proprio adesso.',
    'hero.lede': 'Sopra le nostre teste, a circa quattrocento chilometri, sette persone girano attorno alla Terra sedici volte al giorno. Questa pagina segue il loro passaggio, con calma.',

    'map.title': 'Posizione in tempo reale',
    'map.alt': 'Mappa del mondo con la posizione attuale della Stazione Spaziale Internazionale',
    'legend.iss': 'ISS',
    'legend.track': 'traccia a terra',
    'legend.night': 'notte',
    'overhead.label': 'Punto sotto la Stazione',

    'stats.group': 'Dati di volo',
    'stat.lat': 'Latitudine',
    'stat.lon': 'Longitudine',
    'stat.alt': 'Altitudine',
    'stat.vel': 'Velocità',
    'stat.light': 'Luce',
    'stat.foot': 'Orizzonte visibile',

    'dir.n': 'N', 'dir.s': 'S', 'dir.e': 'E', 'dir.w': 'O',
    'unit.km': 'km',
    'unit.kmh': 'km/h',
    'unit.across': 'km di diametro',
    'vis.day': 'alla luce del Sole',
    'vis.night': 'nell’ombra della Terra',

    'status.listening': 'in ascolto…',
    'status.updated': 'aggiornato alle {time}',
    'status.lost': 'connessione persa, riprovo…',

    'ocean.pacific': 'Oceano Pacifico',
    'ocean.atlantic': 'Oceano Atlantico',
    'ocean.indian': 'Oceano Indiano',
    'ocean.southern': 'Oceano Antartico',
    'ocean.arctic': 'Oceano Artico',
    'ocean.open': 'mare aperto',

    'notes.title': 'Come leggere la mappa',
    'notes.trail.h': 'La scia',
    'notes.trail.p': 'La linea ambrata è la traccia a terra: dove la Stazione è passata nell’ultima ora e dove passerà nella prossima. Ogni giro dura circa novanta minuti.',
    'notes.shadow.h': 'L’ombra',
    'notes.shadow.p': 'La fascia più scura è la parte di Terra in cui è notte. La ISS si vede a occhio nudo solo quando lei è ancora al sole e sotto è già buio.',
    'notes.circle.h': 'Il cerchio',
    'notes.circle.p': 'Il cerchio sottile è l’orizzonte: da lì dentro, con il cielo giusto, la Stazione è sopra la linea dell’orizzonte.',

    'road.title': 'Prossime tappe',
    'road.1': 'Mappa live della ISS',
    'road.2': 'Altre missioni: Hubble, Tiangong, Roman, JWST',
    'road.3': 'Inserisci la tua città e scopri quando guardare in alto',
    'road.4': 'App iOS',

    'foot.sources': 'Dati di volo da <a href="https://wheretheiss.at/w/developer" rel="noopener">Where the ISS at?</a>. Confini da Natural Earth. Nessun cookie, nessun tracciamento.',
    'foot.meta': 'Fatto con calma · <a href="https://github.com/edoardoPredieri/cozy-space-missions" rel="noopener">codice su GitHub</a>'
  }

};
