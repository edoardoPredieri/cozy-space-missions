# Cozy Space Missions

Una finestra tranquilla sul cielo: dove si trova, adesso, la Stazione Spaziale Internazionale.

**Sito:** https://edoardopredieri.github.io/cozy-space-missions/

Pagina statica, senza framework e senza build. Si apre, guarda in alto, si aggiorna da sola.

## Cosa fa oggi

- Posizione della ISS in tempo reale su una mappa equirettangolare disegnata su canvas
- Traccia a terra dell'ultima ora e della prossima
- Terminatore giorno/notte calcolato dal punto subsolare
- Cerchio dell'orizzonte visibile (footprint)
- Paese o oceano sotto la Stazione, calcolato in locale (nessuna chiamata di reverse geocoding)
- Altitudine, velocità, e se la Stazione è al sole o nell'ombra della Terra

## Struttura

```
index.html          pagina unica
assets/style.css    stile "notte calda / osservatorio"
assets/app.js       cielo stellato, mappa, dati live
assets/world.js     confini semplificati, nomi in italiano (~70 KB)
```

## Dati

- Posizione e traccia: [Where the ISS at?](https://wheretheiss.at/w/developer) — API pubblica, senza chiave, limite ~1 richiesta/secondo. La pagina aggiorna la posizione ogni 5 secondi e la traccia ogni 3 minuti.
- Confini: [Natural Earth](https://www.naturalearthdata.com/) (dominio pubblico), via [johan/world.geo.json](https://github.com/johan/world.geo.json), semplificati con Douglas–Peucker e tradotti in italiano.

Nessun cookie, nessun analytics, nessuna dipendenza da CDN a parte i font Google.

## Sviluppo locale

```bash
python3 -m http.server 8000
# poi apri http://localhost:8000
```

## Prossime tappe

- [x] Mappa live della ISS
- [ ] Altre missioni: Hubble, Tiangong, Roman, JWST
- [ ] Inserimento della propria città e previsione dei passaggi visibili (SGP4 su TLE)
- [ ] App iOS

## Licenza

Codice sotto licenza MIT (vedi `LICENSE`). I dati di Natural Earth sono di dominio pubblico.
