# KI-Trainer: Durchgang durch alle sechs Module mit simulierter Kamera und simuliertem Mikrofon.
#   python3 tests/ki_trainer.py        (braucht Python mit Playwright und Chromium, siehe README)
# Geprüft wird das Verhalten über die Oberfläche: aufnehmen, trainieren, erkennen, herunterladen, zurücksetzen –
# dazu: keine Anfrage an fremde Server, Kamera aus nach dem Verlassen, was im Browser gespeichert bleibt.
import json, pathlib, re, tempfile
from PIL import Image
from pruefen import ADRESSE, Sitzung, ende, pruefe

TMP = pathlib.Path(tempfile.mkdtemp())


def oeffne(s, modul):
    s.evaluate("document.querySelector('.screen.is-active .btn-back')?.click()")
    s.wait_for_timeout(200)
    s.click(f'[data-open="{modul}"]')
    s.wait_for_timeout(500)


def warte_auf(s, bedingung, sekunden=20):
    """Wartet, bis der JavaScript-Ausdruck wahr ist (ohne eval im Seitenkontext, die CSP verbietet es dort nicht für Tests)."""
    for _ in range(sekunden * 5):
        if s.evaluate(bedingung): return True
        s.wait_for_timeout(200)
    return False


def halte(s, knopf, ms):
    knopf.dispatch_event("pointerdown")
    s.wait_for_timeout(ms)
    knopf.dispatch_event("pointerup")
    s.wait_for_timeout(250)


def proben(s, modul):
    return [int(re.search(r"\d+", t).group()) for t in s.eval_on_selector_all(f"#mod-{modul} .cls-count", "e => e.map(x => x.textContent)")]


def trainiere(s, modul):
    s.click(f"#{modul}-train-btn")
    return warte_auf(s, f"!document.getElementById('{modul}-dl-btn').disabled", 40)


def lade_herunter(s, modul):
    with s.expect_download() as d: s.click(f"#{modul}-dl-btn")
    return d.value.suggested_filename, json.loads(pathlib.Path(d.value.path()).read_text())


def gespeichert(s):
    """Inhalt des Browserspeichers: je Modul die Klassen mit Anzahl und Art der Proben."""
    return s.evaluate("""() => new Promise(ok => {
      const namen = indexedDB.databases ? indexedDB.databases() : Promise.resolve([]);
      namen.then(liste => {
        const aus = {}; let offen = liste.length; if (!offen) ok(aus);
        liste.forEach(({ name }) => { const r = indexedDB.open(name);
          r.onsuccess = () => { const db = r.result, speicher = [...db.objectStoreNames];
            if (!speicher.length) { db.close(); if (!--offen) ok(aus); return; }
            const t = db.transaction(speicher[0]).objectStore(speicher[0]), k = t.getAllKeys(), v = t.getAll();
            v.onsuccess = () => { k.result.forEach((key, i) => { aus[name + '/' + key] = (v.result[i].classes || []).map(c =>
              [c.name, (c.samples || []).length, typeof (c.samples || [])[0] === 'string' ? 'Bild' : 'Zahlen']); }); db.close(); if (!--offen) ok(aus); }; }; });
      }); })""")


def start_und_aufbau(sz, s):
    karten = s.eval_on_selector_all("[data-open]", "e => e.map(x => x.dataset.open)")
    pruefe("Start: sechs Module und die Info-Seite", karten == ["img", "audio", "pose", "draw", "face", "data", "info"], karten)
    pruefe("Start: Titel ohne Schulnamen", "Anton" not in s.title(), s.title())
    s.click('[data-open="info"]'); s.wait_for_timeout(300)
    pruefe("Info-Seite öffnet", s.locator("#mod-info.is-active").count() == 1)
    hell = s.evaluate("document.documentElement.getAttribute('data-theme')")
    s.click("#theme-toggle")
    neu = s.evaluate("document.documentElement.getAttribute('data-theme')")
    s.reload(); s.wait_for_timeout(600)
    pruefe("Design: Umschalten bleibt nach dem Neuladen", neu != hell and s.evaluate("document.documentElement.getAttribute('data-theme')") == neu)


def modul_daten(sz, s):
    oeffne(s, "data")
    s.click("#data-load-btn"); s.wait_for_timeout(500)
    pruefe("Daten: Pinguine geladen", proben(s, "data") == [50, 50, 48] or sum(proben(s, "data")) == 148, proben(s, "data"))
    pruefe("Daten: trainiert", trainiere(s, "data"))
    s.click("#data-eval-btn")
    warte_auf(s, "!!document.querySelector('#mod-data .eval-acc')")
    genau = int(re.search(r"(\d+)\s*%", s.inner_text("#mod-data .eval-acc")).group(1))
    pruefe("Daten: Modelltest erreicht mindestens 90 %", genau >= 90, genau)
    for feld, wert in zip(s.locator("#data-predict-inputs input").all(), ["47.5", "15.0", "217", "5100"]):      # ein typischer Eselspinguin
        feld.fill(wert)
    s.click("#data-predict-btn"); s.wait_for_timeout(700)
    zeilen = s.eval_on_selector_all("#data-preds .pred-row", "r => r.map(x => [x.querySelector('.pred-label').textContent, parseInt(x.querySelector('.pred-pct').textContent)])")
    sieger = max(zeilen, key=lambda z: z[1]) if zeilen else ["?", 0]
    pruefe("Daten: Eselspinguin (Gentoo) wird erkannt", sieger[0] == "Gentoo" and sieger[1] >= 60, zeilen)
    name, modell = lade_herunter(s, "data")
    pruefe("Daten: Modell-Datei vollständig", modell.get("version") == "2.0" and modell.get("type") == "data"
           and [c["name"] for c in modell["classes"]] == ["Adelie", "Chinstrap", "Gentoo"] and modell["meta"]["totalSamples"] > 100, name)
    pruefe("Daten: Dateiname ohne Schulnamen", name.startswith("ki-trainer-data-") and name.endswith(".json"), name)
    # Modell wieder laden: neue Sitzung ohne Proben, danach sofort klassifizieren
    datei = TMP / name; datei.write_text(json.dumps(modell))
    s.click("#data-reset-btn"); s.wait_for_timeout(500)
    pruefe("Daten: nach dem Zurücksetzen ist „Klassifizieren“ gesperrt", s.is_disabled("#data-predict-btn") and s.is_disabled("#data-dl-btn"))
    s.set_input_files("#data-upload-model", str(datei)); s.wait_for_timeout(800)
    geladen = s.eval_on_selector_all("#data-classes .cls-name", "e => e.map(x => x.value)")
    pruefe("Daten: Modell-Datei geladen", geladen == ["Adelie", "Chinstrap", "Gentoo"] and s.is_enabled("#data-predict-btn"), geladen)
    for feld, wert in zip(s.locator("#data-predict-inputs input").all(), ["38.8", "18.6", "191", "3800"]):      # ein typischer Adeliepinguin
        feld.fill(wert)
    s.click("#data-predict-btn"); s.wait_for_timeout(700)
    zeilen = s.eval_on_selector_all("#data-preds .pred-row", "r => r.map(x => [x.querySelector('.pred-label').textContent, parseInt(x.querySelector('.pred-pct').textContent)])")
    pruefe("Daten: geladenes Modell erkennt den Adeliepinguin", bool(zeilen) and max(zeilen, key=lambda z: z[1])[0] == "Adelie", zeilen)
    kaputt = TMP / "kaputt.json"; kaputt.write_text(json.dumps({**modell, "dataset": [{"classId": 0, "shape": [2, 4], "data": [1, 2, "x"]}]}))
    s.set_input_files("#data-upload-model", str(kaputt)); s.wait_for_timeout(600)
    pruefe("Daten: beschädigte Modell-Datei wird abgelehnt", "beschädigt" in s.inner_text("#toast") and s.is_enabled("#data-predict-btn"), s.inner_text("#toast"))
    fremd = TMP / "fremd.json"; fremd.write_text(json.dumps({**modell, "type": "img"}))
    s.set_input_files("#data-upload-model", str(fremd)); s.wait_for_timeout(600)
    pruefe("Daten: Modell eines anderen Moduls wird abgelehnt", "dieses Moduls" in s.inner_text("#toast"), s.inner_text("#toast"))
    # eigene CSV-Datei
    csv = TMP / "obst.csv"
    csv.write_text("Gewicht,Laenge,Sorte\n" + "\n".join(f"{150 + i},{7 + i % 3},Apfel" for i in range(8)) + "\n"
                   + "\n".join(f"{120 + i},{18 + i % 3},Banane" for i in range(8)) + "\n")
    s.set_input_files("#data-csv-input", str(csv)); s.wait_for_timeout(500)
    s.select_option("#data-label-col", "Sorte")
    s.click("#data-csv-confirm-btn"); s.wait_for_timeout(500)
    namen = s.eval_on_selector_all("#data-classes .cls-name", "e => e.map(x => x.value)")
    pruefe("Daten: CSV-Datei übernommen", sorted(namen) == ["Apfel", "Banane"] and proben(s, "data") == [8, 8], f"{namen} {proben(s, 'data')}")


def modul_bild(sz, s):
    oeffne(s, "img")
    pruefe("Bild: Modell geladen", warte_auf(s, "!document.getElementById('img-cam-btn').disabled && !/Lädt|Lade/.test(document.querySelector('#mod-img .status-text, #mod-img [id*=status]')?.textContent || '')", 30))
    s.click("#img-cam-btn")
    pruefe("Bild: Kamera läuft", warte_auf(s, "(document.getElementById('img-video').srcObject?.getTracks()[0]?.readyState) === 'live' && document.getElementById('img-video').videoWidth > 0"))
    s.evaluate("window.__kamera = document.getElementById('img-video').srcObject.getTracks()[0]")
    knoepfe = s.locator("#mod-img .btn-hold")
    halte(s, knoepfe.nth(0), 1500); halte(s, knoepfe.nth(1), 1500)
    p = proben(s, "img")
    pruefe("Bild: Proben aufgenommen", len(p) == 2 and min(p) >= 5, p)
    pruefe("Bild: Vorschaubilder sichtbar", s.locator("#mod-img img.cls-thumb").count() >= 10)
    # eigenes Bild hochladen
    Image.new("RGB", (320, 240), (200, 30, 30)).save(TMP / "rot.png")
    s.locator("#mod-img .cls-card").nth(0).locator("input[type=file]").set_input_files(str(TMP / "rot.png")); s.wait_for_timeout(600)
    pruefe("Bild: eigenes Bild hinzugefügt", proben(s, "img")[0] == p[0] + 1, proben(s, "img"))
    pruefe("Bild: trainiert", trainiere(s, "img"))
    s.click("#img-live-btn")
    pruefe("Bild: Live-Erkennung liefert Werte", warte_auf(s, "[...document.querySelectorAll('#img-preds .pred-pct')].some(e => parseInt(e.textContent) > 0)"))
    s.click("#img-live-btn")
    name, modell = lade_herunter(s, "img")
    pruefe("Bild: Modell-Datei enthält nur Zahlen, keine Bilder", modell["type"] == "img" and modell["meta"]["featureSize"] > 100
           and "data:image" not in json.dumps(modell), name)
    # Klassenname mit HTML: muss als Text erscheinen
    feld = s.locator("#mod-img .cls-name").first
    feld.fill('<img src=x onerror="window.__xss=1">'); feld.dispatch_event("change"); s.wait_for_timeout(300)
    s.click("#img-train-btn"); warte_auf(s, "!document.getElementById('img-dl-btn').disabled", 40)
    pruefe("Bild: Klassenname mit HTML wird nicht ausgeführt", s.evaluate("window.__xss") is None and s.locator("#img-preds img").count() == 0)
    # Was bleibt im Browser? Keine Kamerabilder.
    s.wait_for_timeout(1300)
    bilder = [k for k, klassen in gespeichert(s).items() if any(c[2] == "Bild" and c[1] > 0 for c in klassen)]
    pruefe("Bild: Kamerabilder werden nicht im Browser gespeichert", not bilder, bilder)
    s.click("#mod-img .btn-back"); s.wait_for_timeout(400)
    pruefe("Bild: Kamera aus nach „Zurück“", s.evaluate("window.__kamera.readyState") == "ended")
    s.reload(); s.wait_for_timeout(800); oeffne(s, "img")
    warte_auf(s, "!document.getElementById('img-cam-btn').disabled", 30); s.wait_for_timeout(1500)
    pruefe("Bild: nach dem Neuladen sind keine Bilder mehr da", sum(proben(s, "img")) == 0 and s.locator("#mod-img img.cls-thumb").count() == 0, proben(s, "img"))


def modul_zeichnen(sz, s):
    oeffne(s, "draw")
    warte_auf(s, "!!document.getElementById('draw-canvas').offsetParent", 10); s.wait_for_timeout(4000)
    k = s.locator("#draw-canvas").bounding_box()
    mx, my, r = k["x"] + k["width"] / 2, k["y"] + k["height"] / 2, min(k["width"], k["height"]) * 0.3

    def zeichne(form, versatz):
        s.click("#draw-clear-btn")
        if form == "strich":
            punkte = [(mx - r + versatz, my - r), (mx + r + versatz, my + r)]
        else:
            punkte = [(mx - r, my - r + versatz), (mx + r, my - r + versatz), (mx + r, my + r), (mx - r, my + r), (mx - r, my - r + versatz)]
        s.mouse.move(*punkte[0]); s.mouse.down()
        for x, y in punkte[1:]: s.mouse.move(x, y, steps=6)
        s.mouse.up(); s.wait_for_timeout(120)

    knoepfe = s.locator("#mod-draw .btn-hold")
    for i in range(6):
        zeichne("strich", i * 4); knoepfe.nth(0).click(); s.wait_for_timeout(350)
        zeichne("kasten", i * 4); knoepfe.nth(1).click(); s.wait_for_timeout(350)
    pruefe("Zeichnen: je sechs Zeichnungen aufgenommen", proben(s, "draw") == [6, 6], proben(s, "draw"))
    zeichne("strich", 30); s.click("#draw-undo-btn"); s.wait_for_timeout(200)
    leer = s.evaluate("(() => { const c = document.getElementById('draw-canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const a = [d[0], d[1], d[2]]; for (let i = 0; i < d.length; i += 4000) if (d[i] !== a[0] || d[i + 1] !== a[1]) return false; return true; })()")
    pruefe("Zeichnen: Rückgängig entfernt den Strich", leer)
    pruefe("Zeichnen: trainiert", trainiere(s, "draw"))
    zeichne("kasten", 10); s.click("#draw-live-btn")
    warte_auf(s, "[...document.querySelectorAll('#draw-preds .pred-pct')].some(e => parseInt(e.textContent) > 0)")
    werte = s.eval_on_selector_all("#draw-preds .pred-pct", "e => e.map(x => parseInt(x.textContent))")
    pruefe("Zeichnen: Kasten wird als zweite Klasse erkannt", len(werte) == 2 and werte[1] > werte[0], werte)
    s.wait_for_timeout(1300)
    bilder = [k for k, klassen in gespeichert(s).items() if any(c[2] == "Bild" and c[1] > 0 for c in klassen)]
    pruefe("Zeichnen: Zeichnungen werden nicht im Browser gespeichert", not bilder, bilder)


def modul_ton(sz, s):
    oeffne(s, "audio")
    s.click("#audio-mic-btn")
    pruefe("Ton: Mikrofon läuft", warte_auf(s, "/stopp|aktiv|läuft/i.test(document.getElementById('audio-mic-btn').textContent + (document.querySelector('#mod-audio [id*=status]')?.textContent || ''))", 10),
           s.inner_text("#audio-mic-btn"))
    knoepfe = s.locator("#mod-audio .btn-hold")
    halte(s, knoepfe.nth(0), 3000); halte(s, knoepfe.nth(1), 3000)
    p = proben(s, "audio")
    pruefe("Ton: Proben aufgenommen", len(p) == 2 and min(p) >= 5, p)
    pruefe("Ton: trainiert", trainiere(s, "audio"))
    name, modell = lade_herunter(s, "audio")
    pruefe("Ton: Modell-Datei", modell["type"] == "audio" and modell["meta"]["totalSamples"] == sum(p), name)
    s.wait_for_timeout(1300)
    pruefe("Ton: Proben (Zahlenwerte) bleiben für die nächste Sitzung", any(k.endswith("audio") and sum(c[1] for c in v) == sum(p) for k, v in gespeichert(s).items()), gespeichert(s))
    s.click("#audio-reset-btn"); s.wait_for_timeout(600)
    pruefe("Ton: „Modul zurücksetzen“ leert Proben und Speicher", sum(proben(s, "audio")) == 0
           and not any(k.endswith("audio") and sum(c[1] for c in v) for k, v in gespeichert(s).items()))


def modul_pose(sz, s):
    oeffne(s, "pose")
    s.click("#pose-cam-btn")
    pruefe("Pose: Kamera und Modell laufen", warte_auf(s, "document.getElementById('pose-video').videoWidth > 0 && /Person|erkannt/.test(document.getElementById('pose-status-txt').textContent)", 40),
           s.inner_text("#pose-status-txt"))
    s.locator("#mod-pose .btn-clear-cls").first.click(); s.wait_for_timeout(200)
    # Das Testbild der simulierten Kamera zeigt keinen Menschen. Deshalb liefert hier ein Ersatz für das Pose-Modell
    # zwei feste Körperhaltungen (Arme unten / Arme oben) – alles danach (Vektor, Training, Erkennung, Skelett) ist echt.
    s.evaluate("""() => {
      const haltung = oben => [[320,80],[300,70],[340,70],[280,80],[360,80],[250,160],[390,160],[220,oben?90:240],[420,oben?90:240],
        [200,oben?30:310],[440,oben?30:310],[270,330],[370,330],[265,420],[375,420],[260,470],[380,470]].map(([x, y]) => ({ x, y, score: 0.9 }));
      window.__armeOben = false;
      module.pose._erkenner.estimatePoses = async () => [{ keypoints: haltung(window.__armeOben), score: 0.9 }];
    }""")
    s.wait_for_timeout(600)
    knoepfe = s.locator("#mod-pose .btn-hold")
    halte(s, knoepfe.nth(0), 2200)
    s.evaluate("window.__armeOben = true"); s.wait_for_timeout(400)
    halte(s, knoepfe.nth(1), 2200)
    p = proben(s, "pose")
    pruefe("Pose: Proben für zwei Haltungen", len(p) == 2 and min(p) >= 5, p)
    pruefe("Pose: trainiert", trainiere(s, "pose"))
    s.click("#pose-live-btn")
    warte_auf(s, "[...document.querySelectorAll('#pose-preds .pred-pct')].some(e => parseInt(e.textContent) > 0)")
    oben = s.eval_on_selector_all("#pose-preds .pred-pct", "e => e.map(x => parseInt(x.textContent))")
    s.evaluate("window.__armeOben = false"); s.wait_for_timeout(1500)
    unten = s.eval_on_selector_all("#pose-preds .pred-pct", "e => e.map(x => parseInt(x.textContent))")
    pruefe("Pose: Live-Erkennung unterscheidet die Haltungen", oben[1] > oben[0] and unten[0] > unten[1], f"{oben} {unten}")
    s.click("#pose-live-btn")
    name, modell = lade_herunter(s, "pose")
    pruefe("Pose: Modell-Datei mit 51 Zahlen je Probe (17 Punkte)", modell["type"] == "pose" and modell["meta"]["featureSize"] == 51, modell["meta"])


def modul_mimik(sz, s):
    oeffne(s, "face")
    s.click("#face-cam-btn")
    pruefe("Mimik: Kamera und Modell laufen", warte_auf(s, "document.getElementById('face-video').videoWidth > 0", 40))
    for reiter, bereich in (("erkunden", "#face-pane-erkunden"), ("trainieren", "#face-pane-trainieren"), ("spiegel", "#face-pane-spiegel")):
        s.click(f'[data-face-tab="{reiter}"]'); s.wait_for_timeout(300)
        pruefe(f"Mimik: Reiter „{reiter}“ öffnet", s.locator(bereich).is_visible())
    # Auch hier zeigt das Testbild kein Gesicht: Ein Ersatz für das Gesichtsmodell liefert 468 Punkte in zwei Varianten
    # (Mund zu / Mund weit offen). Mimikwerte, Avatar, Training und Erkennung laufen danach mit dem echten Code.
    s.evaluate("""() => {
      const gesicht = offen => Array.from({ length: 468 }, (_, i) => {
        const w = i * 2.399963, r = 40 + 110 * Math.sqrt((i + 0.5) / 468);      // gleichmäßig verteilte Punkte
        let x = 320 + r * Math.cos(w), y = 240 + r * 1.25 * Math.sin(w);
        if (offen && y > 270) y += (y - 270) * 0.6;                              // untere Gesichtshälfte gestreckt
        return { x, y, z: -20 * Math.cos(r / 110) };
      });
      window.__mundOffen = false;
      module.face._erkenner.estimateFaces = async () => [{ keypoints: gesicht(window.__mundOffen), box: { xMin: 170, yMin: 60, width: 300, height: 380 } }];
    }""")
    s.wait_for_timeout(1500)
    s.click('[data-face-tab="erkunden"]'); s.wait_for_timeout(1200)
    balken = s.locator("#face-expr-bars > *").count()
    pruefe("Mimik: Erkunden zeigt Messwerte", balken >= 3, balken)
    s.click('[data-face-tab="trainieren"]'); s.wait_for_timeout(400)
    knoepfe = s.locator("#face-pane-trainieren .btn-hold")
    halte(s, knoepfe.nth(0), 2200)
    s.evaluate("window.__mundOffen = true"); s.wait_for_timeout(500)
    halte(s, knoepfe.nth(1), 2200)
    anzahl = [int(re.search(r"\d+", t).group()) for t in s.eval_on_selector_all("#face-classes .cls-count", "e => e.map(x => x.textContent)")]
    pruefe("Mimik: Proben für zwei Gesichtsausdrücke", len(anzahl) == 3 and anzahl[0] >= 5 and anzahl[1] >= 5, anzahl)
    s.click("#face-train-btn")
    pruefe("Mimik: trainiert", warte_auf(s, "!document.getElementById('face-dl-btn').disabled", 40))
    s.click("#face-live-btn")
    warte_auf(s, "[...document.querySelectorAll('#face-preds .pred-pct')].some(e => parseInt(e.textContent) > 0)")
    offen = s.eval_on_selector_all("#face-preds .pred-pct", "e => e.map(x => parseInt(x.textContent))")
    s.evaluate("window.__mundOffen = false"); s.wait_for_timeout(1800)
    zu = s.eval_on_selector_all("#face-preds .pred-pct", "e => e.map(x => parseInt(x.textContent))")
    pruefe("Mimik: Live-Erkennung unterscheidet die Ausdrücke", offen[1] > offen[0] and zu[0] > zu[1], f"{offen} {zu}")
    s.click("#face-live-btn")
    name, modell = lade_herunter(s, "face")
    pruefe("Mimik: Modell-Datei enthält nur Zahlen", modell["type"] == "face" and "data:image" not in json.dumps(modell))
    s.click('[data-face-tab="spiegel"]'); s.wait_for_timeout(1200)
    farbig = s.evaluate("(() => { const c = document.getElementById('face-avatar-canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const f = new Set(); for (let i = 0; i < d.length; i += 404) f.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]); return f.size; })()")
    pruefe("Mimik: Avatar wird gezeichnet", farbig >= 3, farbig)
    s.wait_for_timeout(600)


with Sitzung() as sz:
    s = sz.seite()
    for teil in (start_und_aufbau, modul_daten, modul_bild, modul_zeichnen, modul_ton, modul_pose, modul_mimik):
        try:
            teil(sz, s)
        except Exception as e:                      # ein hängender Abschnitt soll die übrigen nicht verdecken
            pruefe(f"{teil.__name__}: läuft ohne Abbruch", False, str(e).split("\n")[0][:160])
    fremd = sorted({u.split("/")[2] for u in sz.anfragen if not u.startswith(ADRESSE) and not u.startswith(("data:", "blob:"))})
    pruefe("Keine Anfrage an fremde Server", not fremd, fremd)
    pruefe("Keine Fehler im Browser", not sz.meldungen, sz.meldungen[:3])
ende()
