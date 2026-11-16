# KI-Trainer

Eine KI selbst trainieren – direkt im Browser: Bilder, Töne, Körperhaltungen, Zeichnungen, Mimik oder Messwerte unterscheiden lassen und dabei sehen, wie maschinelles Lernen funktioniert und wo seine Grenzen liegen. Entwickelt am St.-Antonius-Gymnasium Lüdinghausen für den Informatikunterricht.

- **Alles bleibt auf dem Gerät.** Kamera- und Tonaufnahmen werden im Browser verarbeitet und nirgendwohin übertragen. Es gibt keine Anmeldung und keinen Serverteil.
- **Keine fremden Server.** Bibliotheken (`libs/`) und vortrainierte Modelle (`models/`) liegen im Projekt und kommen vom eigenen Webspace.
- **Freie Software** unter der Apache-2.0-Lizenz.

| Modul | Was es unterscheidet | Technik |
|---|---|---|
| Bilderkennung | Gegenstände vor der Kamera, eigene Bilder | MobileNet-Merkmale + k-nächste-Nachbarn |
| Tonerkennung | Geräusche über das Mikrofon | Frequenzspektrum + k-nächste-Nachbarn |
| Poseerkennung | Körperhaltungen | MoveNet (17 Körperpunkte) + k-nächste-Nachbarn |
| Zeichenerkennung | eigene Zeichnungen | MobileNet-Merkmale + k-nächste-Nachbarn |
| Mimikerkennung | Gesichtsausdrücke, mit Katzen-Avatar | Face Mesh (468 Punkte) + k-nächste-Nachbarn |
| Zahlendaten | Messwerte aus Tabellen (CSV), Beispiel Pinguine | k-nächste-Nachbarn |

In jedem Modul: Proben aufnehmen, trainieren, live erkennen, das Modell mit einer Testmenge prüfen (Genauigkeit, Konfusionsmatrix), k verändern, das Modell als Datei herunterladen. Die Seite „Wie funktioniert das hier?“ erklärt die Hintergründe.

## Einrichten

1. Dieses Repository herunterladen (grüner Knopf „Code“ → „Download ZIP“) und entpacken.
2. Den ganzen Inhalt in einen Ordner des Webspace laden, zum Beispiel `ki-trainer/`. Gebraucht werden `index.html`, `favicon.svg` und die Ordner `css/`, `js/`, `libs/`, `models/`, `symbole/` (zusammen etwa 17 MB). `tests/`, `werkzeuge/` und `package.json` werden nicht gebraucht.
3. Die Seite muss über **https** erreichbar sein – sonst geben Browser Kamera und Mikrofon nicht frei.
4. Impressum und Datenschutz eintragen: In `index.html` steht in der Fußzeile `<!-- rechtliches --><!-- /rechtliches -->`. Dazwischen gehören die Links Ihrer Schule, zum Beispiel:

   ```html
   <!-- rechtliches --> · <a href="https://ihre-schule.de/impressum">Impressum</a> · <a href="https://ihre-schule.de/datenschutz">Datenschutz</a><!-- /rechtliches -->
   ```

Ein Bauschritt ist nicht nötig. Zum Ausprobieren auf dem eigenen Rechner genügt `python3 -m http.server` im Projektordner und dann `http://localhost:8000/` (auf `localhost` funktioniert die Kamera auch ohne https).

### Hinweise für den Server

- **Content-Security-Policy:** Wer eine strenge CSP setzt, muss für diese Seite `script-src 'self' 'unsafe-eval'` erlauben. TensorFlow.js erzeugt intern Funktionen aus Text und startet sonst nicht. Alles Übrige kommt mit `'self'` aus (dazu `img-src 'self' data: blob:`, `media-src 'self' blob:`, `worker-src 'self' blob:`, `style-src 'self' 'unsafe-inline'`).
- **Als Web-App:** Die Seite lässt sich installieren (Symbol, eigenes Fenster). Es gibt keinen Service Worker: Es wird nichts vorab gespeichert, und ohne Netz startet die Seite nicht. Eine strenge CSP braucht dafür `manifest-src 'self'`.
- **Permissions-Policy:** Kamera und Mikrofon müssen für die Seite erlaubt sein (`camera=(self), microphone=(self)`).
- **Zwischenspeichern:** Die Dateien in `libs/` und `models/` ändern sich nie und dürfen lange im Browser bleiben. Für `index.html`, `css/` und `js/` empfiehlt sich `Cache-Control: no-cache`.

## Was im Browser gespeichert wird

| Was | Wo | Wie lange |
|---|---|---|
| Kamerabilder, Zeichnungen | nur im Arbeitsspeicher | bis die Seite geschlossen oder neu geladen wird |
| trainiertes Modell | nur im Arbeitsspeicher | bis die Seite geschlossen wird; auf Wunsch als Datei |
| Klassennamen, Wert von k; Proben aus Zahlenwerten (Ton, Pose, Mimik, Daten) | IndexedDB `ki-trainer` | bis „Modul zurücksetzen“ |
| Einstellung hell/dunkel | localStorage `ki-trainer-theme` | dauerhaft |

Proben aus Zahlenwerten sind zum Beispiel 17 Körperpunkte oder Abstände im Gesicht – kein Bild und kein Ton. Auf geteilten Geräten empfiehlt sich trotzdem „Modul zurücksetzen“ am Ende der Stunde.

Textvorschlag für die Datenschutzerklärung der Schule:

> Der KI-Trainer verarbeitet Kamera- und Mikrofonaufnahmen ausschließlich im Browser des genutzten Geräts. Es werden keine Aufnahmen und keine daraus berechneten Daten an den Server oder an Dritte übertragen. Kamerabilder und Zeichnungen werden nicht gespeichert. Klassennamen und Zahlenwerte aus Ton-, Pose-, Mimik- und Tabellendaten speichert der Browser lokal (IndexedDB), bis sie im Programm zurückgesetzt werden.

## Aufbau

```
index.html          Seite mit allen Modulen und Erklärtexten
css/ki-trainer.css  Gestaltung (hell und dunkel)
js/grundlagen.js    Festwerte, Hilfsfunktionen, Browserspeicher, MobileNet, Modell-Datei
js/lernmodul.js     Basisklasse LernModul: Klassen, Aufnahme, Training, Test, Live-Erkennung, Speichern
js/modul-*.js       je ein Modul: Bild, Ton, Pose, Zeichnen, Mimik, Daten
js/pinguine.js      Beispieldaten
js/start.js         legt die Module an, verdrahtet Knöpfe und Navigation
symbole/            Symbole und Manifest, damit sich die Seite als Web-App installieren lässt
libs/               fremde Bibliotheken, unverändert (siehe NOTICE)
models/             vortrainierte Modelle, unverändert (siehe NOTICE)
tests/              automatische Tests
werkzeuge/          bibliotheken.py: fremde Bibliotheken prüfen und aktualisieren
package.json        Verzeichnis der fremden Bibliotheken mit ihren Versionen (es wird nichts installiert)
```

Bezeichner und Kommentare sind deutsch. Englisch geblieben sind die Namen in HTML und CSS sowie die Felder der Datenformate (Modell-Datei und Browserspeicher: `classes`, `id`, `name`, `samples`, `dataset` …), damit früher heruntergeladene Modelle weiter passen.

### Format der Modell-Datei

```json
{ "version": "2.0", "type": "img", "created": "…",
  "classes": [{ "id": 0, "name": "Klasse 1" }],
  "dataset": [{ "classId": 0, "shape": [12, 1280], "data": [0.1, …] }],
  "meta": { "totalSamples": 24, "featureSize": 1280 } }
```

Die Datei enthält nur Zahlen (Merkmalsvektoren), keine Bilder oder Töne. Wie man sie in eigenen Programmen nutzt, zeigt jedes Modul unter „ℹ️“.

## Tests

```bash
python3 -m venv .venv && .venv/bin/pip install playwright pillow && .venv/bin/playwright install chromium
tests/alle.sh
```

`tests/alle.sh` prüft erst die Bibliotheken (`werkzeuge/bibliotheken.py pruefen`, ohne Browser und ohne Netz) und startet dann den Browsertest `tests/ki_trainer.py`.

Der Test startet einen kleinen Server mit strenger CSP und geht in Chromium mit simulierter Kamera und simuliertem Mikrofon durch alle sechs Module: aufnehmen, trainieren, erkennen, Modell herunterladen und wieder laden, zurücksetzen. Geprüft wird auch, dass keine Anfrage an fremde Server geht, dass die Kamera nach dem Verlassen aus ist und dass keine Bilder im Browser bleiben. Weil das Testbild der simulierten Kamera keinen Menschen zeigt, liefern in den Modulen Pose und Mimik Ersatzfunktionen feste Körper- und Gesichtspunkte; alles danach läuft mit dem echten Code. Nicht abgedeckt: Safari/iPadOS und die Erkennungsgüte mit echten Personen.

## Bibliotheken aktualisieren

Die Dateien in `libs/` sind unveränderte Kopien aus den npm-Paketen. Welche Version gilt, steht in `package.json`; `index.html` lädt jede Datei mit Prüfsumme (`integrity`), `NOTICE` nennt Version und Lizenz. Das Werkzeug hält diese vier Stellen zusammen:

```bash
python3 werkzeuge/bibliotheken.py pruefen                 # passt alles zusammen? (ohne Netz)
python3 werkzeuge/bibliotheken.py stand                   # eingebaute Versionen neben den neuesten bei npm
python3 werkzeuge/bibliotheken.py holen papaparse@5.7.1   # Version eintragen, Datei holen, index.html und NOTICE anpassen
python3 werkzeuge/bibliotheken.py holen                   # libs/ auf den Stand von package.json bringen
tests/alle.sh
```

`holen` lädt das Paket von registry.npmjs.org, vergleicht es mit der dort hinterlegten Prüfsumme und nimmt genau eine Datei heraus. Es wird nichts installiert und kein Code aus dem Paket ausgeführt; gebraucht wird nur Python 3. Steht ein Paket plötzlich unter einer anderen Lizenz, bricht das Werkzeug ab.

Aktualisiert wird bewusst von Hand und nicht automatisch: Die Modelle in `models/` gehören zu bestimmten Bibliotheksversionen, und die Tests prüfen den Ablauf, nicht die Erkennungsgüte. Nach einem Austausch deshalb Bild, Pose und Mimik einmal mit echter Kamera ausprobieren – erst dann veröffentlichen. Die Modelle selbst fasst das Werkzeug nicht an.

Weil `package.json` die Versionen nennt, kann GitHub vor bekannten Sicherheitslücken warnen (in den Einstellungen des Repositorys „Dependabot alerts“ einschalten).

## Mitmachen

Fehler und Ideen gern als [Issue](https://github.com/Schulwerkzeuge/ki-trainer/issues). Bitte keine personenbezogenen Daten und keine Fotos von Personen in Issues.

## Lizenz

Apache License 2.0 – siehe [LICENSE](LICENSE). Fremde Bibliotheken, Modelle und Daten: siehe [NOTICE](NOTICE).
© 2026 St.-Antonius-Gymnasium Lüdinghausen. Erstellt mit KI-Unterstützung.
