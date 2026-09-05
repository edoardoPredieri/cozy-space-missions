/* Cozy Space Missions — every string on the page.
   English is the default; Italian is the alternative.
   {braces} are filled in at runtime. Values may contain inline markup. */

window.I18N = {

  en: {
    'html.lang': 'en',
    'locale': 'en-GB',
    'doc.title': 'Cozy Space Missions — where the ISS is right now',
    'doc.desc': "A quiet window on the sky: the International Space Station's live position, when it passes over you, and where Earth sits among its neighbours.",

    'skip': 'Skip to the content',
    'lang.group': 'Language',
    'brand.sub': 'A quiet window on the sky',

    'hero.h1': 'Where the <em>Space&nbsp;Station</em> is, right now.',
    'hero.lede': 'Some four hundred kilometres above our heads, seven people go around the Earth sixteen times a day. This page follows them, quietly.',

    /* --- live map --- */
    'map.title': 'Live position',
    'map.alt': 'World map showing the current position of the International Space Station',
    'legend.iss': 'ISS',
    'legend.track': 'ground track',
    'legend.night': 'night',
    'legend.you': 'you',
    'map.you': 'you',
    'overhead.label': 'Point below the Station',

    'stats.group': 'Flight data',
    'stat.lat': 'Latitude',
    'stat.lon': 'Longitude',
    'stat.alt': 'Altitude',
    'stat.vel': 'Speed',
    'stat.light': 'Light',
    'stat.foot': 'Visible horizon',

    'dir.n': 'N', 'dir.s': 'S', 'dir.e': 'E', 'dir.w': 'W',
    'compass': 'N,NNE,NE,ENE,E,ESE,SE,SSE,S,SSW,SW,WSW,W,WNW,NW,NNW',
    'unit.km': 'km',
    'unit.kmh': 'km/h',
    'unit.across': 'km across',
    'unit.mkm': 'million km',
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

    /* --- from where you are --- */
    'obs.title': 'From where you are',
    'obs.sub': 'Tell the page where you are and it will work out how far the Station is right now, which way to turn, and when it next comes over.',
    'obs.label': 'Your street, town or postcode',
    'obs.placeholder': 'Via Roma 1, Bologna',
    'obs.search': 'Search',
    'obs.hint': 'Looked up through OpenStreetMap. Your position is kept in this browser and sent nowhere else.',
    'obs.locate': 'Use my position',
    'obs.change': 'Change',
    'obs.you': 'Your position',
    'obs.results': '{n} places found. Pick one.',
    'obs.set': 'Position set to {place}. Reading the track.',

    'obs.err.short': 'Type at least a couple of letters.',
    'obs.err.none': 'No match for that one — try adding the town or country.',
    'obs.err.net': 'The address service did not answer. Try again in a moment.',
    'obs.err.geo': 'This browser cannot share a position.',
    'obs.err.denied': 'No position available — you can type an address instead.',

    'obs.distance': 'Distance from you',
    'obs.direction': 'Direction',
    'obs.elevation': 'Height above horizon',
    'obs.ground': 'Ground distance',
    'obs.up': 'up',
    'obs.under': 'below the horizon',
    'obs.dome.alt': "Sky dome seen from your position, with the Station's current direction",
    'obs.dome.above': 'Above your horizon right now',
    'obs.dome.below': 'Below your horizon right now',

    'pass.title': 'Next passes overhead',
    'pass.hint': "Worked out from the Station's own track over the next twelve hours. A pass counts as visible when the Station is still in sunlight while your sky is already dark.",
    'pass.loading': 'reading the track…',
    'pass.progress': 'Reading the Station track',
    'pass.found': '{n} passes found in the next twelve hours.',
    'pass.error': 'could not read the track',
    'pass.none': 'Nothing higher than 10° above your horizon in the next twelve hours. Passes come in clusters — try again tomorrow.',
    'pass.visible': 'visible',
    'pass.daylight': 'too bright',
    'pass.duration': '{min} min',
    'pass.height': 'up to {deg}°',
    'pass.from': '{a} → {b}',
    'pass.tomorrow': 'tomorrow',

    /* --- how far up --- */
    'ladder.title': 'How far up is up?',
    'ladder.sub': 'Space is not far away — it is just straight up. On this scale each step is ten times the one before.',
    'ladder.alt': "Logarithmic scale from the ground to the Moon, marking the Station's altitude",
    'ladder.cap': 'The Station orbits closer to you than most capital cities are to each other. The Moon, on the same line, is a thousand times further out.',
    'ladder.karman': 'edge of space',
    'ladder.iss': 'ISS',
    'ladder.hubble': 'Hubble',
    'ladder.gps': 'GPS satellites',
    'ladder.geo': 'TV satellites',
    'ladder.moon': 'the Moon',

    /* --- neighbourhood --- */
    'solar.title': 'The neighbourhood',
    'solar.sub': "Where the whole thing sits today: the inner planets in their real positions, and our small blue dot with the Station a hair's breadth above it.",
    'solar.alt': 'Top-down view of the inner solar system with the current positions of Mercury, Venus, Earth and Mars',
    'solar.scale': 'seen from above · orbits to scale',
    'solar.iss': 'ISS above Earth',
    'planet.sun': 'the Sun',
    'planet.mercury': 'Mercury',
    'planet.venus': 'Venus',
    'planet.earth': 'Earth',
    'planet.mars': 'Mars',

    /* --- notes --- */
    'notes.title': 'How to read the map',
    'notes.trail.h': 'The trail',
    'notes.trail.p': 'The amber line is the ground track: where the Station has been over the past hour, and where it will be over the next one. Each lap takes about ninety minutes.',
    'notes.shadow.h': 'The shadow',
    'notes.shadow.p': 'The darker band is the half of the Earth where it is night. The ISS is visible to the naked eye only while it is still in sunlight and the ground below is already dark.',
    'notes.circle.h': 'The circle',
    'notes.circle.p': 'The thin circle is the horizon: from anywhere inside it, with a clear enough sky, the Station is above the horizon line.',

    'road.title': 'What comes next',
    'road.1': 'Live ISS map',
    'road.2': 'Your position, and when to look up',
    'road.3': 'More missions: Hubble, Tiangong, Roman, JWST',
    'road.4': 'iOS app',

    'foot.sources': 'Flight data from <a href="https://wheretheiss.at/w/developer" rel="noopener">Where the ISS at?</a>, address search by <a href="https://openstreetmap.org/copyright" rel="noopener">OpenStreetMap</a>, borders from Natural Earth. No cookies, no tracking.',
    'foot.meta': 'Made slowly · <a href="https://github.com/edoardoPredieri/cozy-space-missions" rel="noopener">source on GitHub</a>'
  },

  it: {
    'html.lang': 'it',
    'locale': 'it-IT',
    'doc.title': 'Cozy Space Missions — dove si trova la ISS adesso',
    'doc.desc': 'Una finestra tranquilla sul cielo: la posizione in tempo reale della Stazione Spaziale Internazionale, quando passa sopra di te, e dove si trova la Terra fra i suoi vicini.',

    'skip': 'Vai al contenuto',
    'lang.group': 'Lingua',
    'brand.sub': 'Una finestra tranquilla sul cielo',

    'hero.h1': 'Dove si trova la <em>Stazione&nbsp;Spaziale</em>, proprio adesso.',
    'hero.lede': 'Sopra le nostre teste, a circa quattrocento chilometri, sette persone girano attorno alla Terra sedici volte al giorno. Questa pagina segue il loro passaggio, con calma.',

    /* --- mappa live --- */
    'map.title': 'Posizione in tempo reale',
    'map.alt': 'Mappa del mondo con la posizione attuale della Stazione Spaziale Internazionale',
    'legend.iss': 'ISS',
    'legend.track': 'traccia a terra',
    'legend.night': 'notte',
    'legend.you': 'tu',
    'map.you': 'tu',
    'overhead.label': 'Punto sotto la Stazione',

    'stats.group': 'Dati di volo',
    'stat.lat': 'Latitudine',
    'stat.lon': 'Longitudine',
    'stat.alt': 'Altitudine',
    'stat.vel': 'Velocità',
    'stat.light': 'Luce',
    'stat.foot': 'Orizzonte visibile',

    'dir.n': 'N', 'dir.s': 'S', 'dir.e': 'E', 'dir.w': 'O',
    'compass': 'N,NNE,NE,ENE,E,ESE,SE,SSE,S,SSO,SO,OSO,O,ONO,NO,NNO',
    'unit.km': 'km',
    'unit.kmh': 'km/h',
    'unit.across': 'km di diametro',
    'unit.mkm': 'milioni di km',
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

    /* --- da dove sei --- */
    'obs.title': 'Da dove sei tu',
    'obs.sub': 'Dì alla pagina dove ti trovi: calcolerà quanto è lontana la Stazione adesso, da che parte guardare e quando tornerà a passare.',
    'obs.label': 'La tua via, città o CAP',
    'obs.placeholder': 'Via Roma 1, Bologna',
    'obs.search': 'Cerca',
    'obs.hint': 'La ricerca passa da OpenStreetMap. La tua posizione resta in questo browser e non viene inviata altrove.',
    'obs.locate': 'Usa la mia posizione',
    'obs.change': 'Cambia',
    'obs.you': 'La tua posizione',
    'obs.results': '{n} luoghi trovati. Scegline uno.',
    'obs.set': 'Posizione impostata su {place}. Leggo la traccia.',

    'obs.err.short': 'Scrivi almeno un paio di lettere.',
    'obs.err.none': 'Nessun risultato — prova ad aggiungere città o nazione.',
    'obs.err.net': 'Il servizio degli indirizzi non risponde. Riprova fra un momento.',
    'obs.err.geo': 'Questo browser non può condividere la posizione.',
    'obs.err.denied': 'Posizione non disponibile — puoi scrivere un indirizzo.',

    'obs.distance': 'Distanza da te',
    'obs.direction': 'Direzione',
    'obs.elevation': 'Altezza sull’orizzonte',
    'obs.ground': 'Distanza a terra',
    'obs.up': 'sopra l’orizzonte',
    'obs.under': 'sotto l’orizzonte',
    'obs.dome.alt': 'La volta celeste vista da dove sei, con la direzione attuale della Stazione',
    'obs.dome.above': 'Adesso è sopra il tuo orizzonte',
    'obs.dome.below': 'Adesso è sotto il tuo orizzonte',

    'pass.title': 'Prossimi passaggi',
    'pass.hint': 'Calcolati dalla traccia della Stazione nelle prossime dodici ore. Un passaggio è visibile quando la Stazione è ancora al sole mentre il tuo cielo è già buio.',
    'pass.loading': 'leggo la traccia…',
    'pass.progress': 'Lettura della traccia della Stazione',
    'pass.found': '{n} passaggi trovati nelle prossime dodici ore.',
    'pass.error': 'traccia non disponibile',
    'pass.none': 'Niente sopra i 10° dal tuo orizzonte nelle prossime dodici ore. I passaggi arrivano a gruppi — riprova domani.',
    'pass.visible': 'visibile',
    'pass.daylight': 'troppa luce',
    'pass.duration': '{min} min',
    'pass.height': 'fino a {deg}°',
    'pass.from': '{a} → {b}',
    'pass.tomorrow': 'domani',

    /* --- quanto è in alto --- */
    'ladder.title': 'Quanto è lontano lo spazio?',
    'ladder.sub': 'Lo spazio non è lontano: è solo dritto sopra di te. Su questa scala ogni passo vale dieci volte il precedente.',
    'ladder.alt': 'Scala logaritmica dal suolo alla Luna, con l’altitudine della Stazione',
    'ladder.cap': 'La Stazione orbita più vicino a te di quanto lo siano fra loro molte capitali. La Luna, sulla stessa linea, è mille volte più in là.',
    'ladder.karman': 'inizio dello spazio',
    'ladder.iss': 'ISS',
    'ladder.hubble': 'Hubble',
    'ladder.gps': 'satelliti GPS',
    'ladder.geo': 'satelliti TV',
    'ladder.moon': 'la Luna',

    /* --- vicinato --- */
    'solar.title': 'Il vicinato',
    'solar.sub': 'Dove sta tutto quanto, oggi: i pianeti interni nelle loro posizioni reali, e il nostro piccolo punto azzurro con la Stazione a un capello sopra.',
    'solar.alt': 'Vista dall’alto del sistema solare interno con le posizioni attuali di Mercurio, Venere, Terra e Marte',
    'solar.scale': 'vista dall’alto · orbite in scala',
    'solar.iss': 'ISS sopra la Terra',
    'planet.sun': 'il Sole',
    'planet.mercury': 'Mercurio',
    'planet.venus': 'Venere',
    'planet.earth': 'Terra',
    'planet.mars': 'Marte',

    /* --- note --- */
    'notes.title': 'Come leggere la mappa',
    'notes.trail.h': 'La scia',
    'notes.trail.p': 'La linea ambrata è la traccia a terra: dove la Stazione è passata nell’ultima ora e dove passerà nella prossima. Ogni giro dura circa novanta minuti.',
    'notes.shadow.h': 'L’ombra',
    'notes.shadow.p': 'La fascia più scura è la parte di Terra in cui è notte. La ISS si vede a occhio nudo solo quando lei è ancora al sole e sotto è già buio.',
    'notes.circle.h': 'Il cerchio',
    'notes.circle.p': 'Il cerchio sottile è l’orizzonte: da lì dentro, con il cielo giusto, la Stazione è sopra la linea dell’orizzonte.',

    'road.title': 'Prossime tappe',
    'road.1': 'Mappa live della ISS',
    'road.2': 'La tua posizione e quando guardare in alto',
    'road.3': 'Altre missioni: Hubble, Tiangong, Roman, JWST',
    'road.4': 'App iOS',

    'foot.sources': 'Dati di volo da <a href="https://wheretheiss.at/w/developer" rel="noopener">Where the ISS at?</a>, ricerca indirizzi con <a href="https://openstreetmap.org/copyright" rel="noopener">OpenStreetMap</a>, confini da Natural Earth. Nessun cookie, nessun tracciamento.',
    'foot.meta': 'Fatto con calma · <a href="https://github.com/edoardoPredieri/cozy-space-missions" rel="noopener">codice su GitHub</a>'
  }

};
