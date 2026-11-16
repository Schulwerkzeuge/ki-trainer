#!/usr/bin/env python3
# Fremde Bibliotheken im Ordner libs/ verwalten. Welche Version gilt, steht allein in package.json.
#
#   python3 werkzeuge/bibliotheken.py pruefen               passen package.json, libs/, index.html und NOTICE zusammen? (ohne Netz)
#   python3 werkzeuge/bibliotheken.py stand                 eingebaute Versionen neben den neuesten bei npm
#   python3 werkzeuge/bibliotheken.py holen                 libs/, index.html und NOTICE auf den Stand von package.json bringen
#   python3 werkzeuge/bibliotheken.py holen papaparse@5.7.1 erst die Version in package.json eintragen, dann holen
#
# „holen“ lädt das Paket von registry.npmjs.org, vergleicht es mit der dort hinterlegten Prüfsumme und nimmt genau eine
# Datei unverändert heraus. Es wird nichts installiert und kein Code aus dem Paket ausgeführt. Braucht nur Python 3.
import base64, hashlib, io, json, pathlib, re, sys, tarfile, urllib.parse, urllib.request

WURZEL = pathlib.Path(__file__).resolve().parent.parent
LIBS = WURZEL / "libs"
REGISTER = "https://registry.npmjs.org/"
# Paket bei npm, Datei im Paket, Name in NOTICE, erwartete Lizenz. Die Reihenfolge ist die Ladereihenfolge in index.html.
BIBLIOTHEKEN = [
    ("@tensorflow/tfjs", "dist/tf.min.js", "TensorFlow.js", "Apache-2.0"),
    ("@tensorflow-models/mobilenet", "dist/mobilenet.min.js", "MobileNet", "Apache-2.0"),
    ("@tensorflow-models/knn-classifier", "dist/knn-classifier.min.js", "KNN Classifier", "Apache-2.0"),
    ("@tensorflow-models/pose-detection", "dist/pose-detection.min.js", "Pose Detection", "Apache-2.0"),
    ("@tensorflow-models/face-landmarks-detection", "dist/face-landmarks-detection.min.js", "Face Landmarks Detection",
     "Apache-2.0"),
    ("papaparse", "papaparse.min.js", "Papa Parse", "MIT"),
]
fehler = []


def pruefe(name, ok, info=""):
    print(("ok     " if ok else "FEHLER ") + name + (f"  ({info})" if info != "" else ""))
    if not ok: fehler.append(name)
    return bool(ok)


def abbruch(text):
    sys.exit("Abbruch: " + text)


# ---------- Namen und Prüfsummen ----------

def lies_paketdatei():
    return json.loads((WURZEL / "package.json").read_text(encoding="utf-8"))


def schreibe_paketdatei(daten):
    (WURZEL / "package.json").write_text(json.dumps(daten, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def dateiname(paket, version, datei):
    """Name in libs/, z. B. tensorflow-tfjs-4.15.0-tf.min.js"""
    return f"{paket.lstrip('@').replace('/', '-')}-{version}-{datei.split('/')[-1]}"


def pruefsumme(inhalt):
    """Wert für das Attribut integrity im <script>-Element"""
    return "sha384-" + base64.b64encode(hashlib.sha384(inhalt).digest()).decode()


def vorhandene_datei(paket, datei):
    """Die Datei, die für dieses Paket gerade in libs/ liegt (oder None), gleich in welcher Version"""
    muster = re.compile(re.escape(dateiname(paket, "§", datei)).replace("§", r"(\d+\.\d+\.\d+)") + "$")
    treffer = [p for p in LIBS.iterdir() if muster.match(p.name)]
    return (treffer[0], muster.match(treffer[0].name).group(1)) if treffer else (None, None)


# ---------- pruefen ----------

def pruefe_bestand():
    paketdatei = lies_paketdatei()
    versionen = paketdatei.get("dependencies", {})
    seite = (WURZEL / "index.html").read_text(encoding="utf-8")
    hinweise = (WURZEL / "NOTICE").read_text(encoding="utf-8")
    pruefe("package.json nennt genau die sechs Bibliotheken", sorted(versionen) == sorted(b[0] for b in BIBLIOTHEKEN))
    stand_seite = re.search(r'<meta name="version" content="([^"]+)"', seite)
    pruefe("package.json trägt die Version der Anwendung", stand_seite and paketdatei.get("version") == stand_seite.group(1))
    erwartet = []
    for paket, datei, name, _ in BIBLIOTHEKEN:
        version = versionen.get(paket, "")
        if not pruefe(f"{name}: feste Version in package.json", re.fullmatch(r"\d+\.\d+\.\d+", version), version): continue
        ziel = dateiname(paket, version, datei)
        erwartet.append(ziel)
        if not pruefe(f"{name} {version}: Datei liegt in libs/", (LIBS / ziel).is_file(), ziel): continue
        inhalt = (LIBS / ziel).read_bytes()
        element = re.search(r'<script src="libs/' + re.escape(ziel) + r'"\s+integrity="([^"]+)"\s+crossorigin="anonymous">', seite)
        pruefe(f"{name} {version}: index.html lädt die Datei mit Prüfsumme", element is not None)
        pruefe(f"{name} {version}: Prüfsumme in index.html stimmt", element and element.group(1) == pruefsumme(inhalt))
        pruefe(f"{name} {version}: steht so in NOTICE", re.search(r"^\s+" + re.escape(f"{name} {version}") + r"\s", hinweise, re.M))
        pruefe(f"{name} {version}: Lizenzkopf in der Datei erhalten", re.search(rb"licen[sc]e", inhalt[:1500], re.I))
    pruefe("libs/ enthält nichts anderes", sorted(p.name for p in LIBS.iterdir()) == sorted(erwartet))
    genannt = set(re.findall(r'libs/([\w.@-]+\.js)', seite))
    pruefe("index.html nennt keine andere Datei aus libs/", genannt <= set(erwartet), ", ".join(sorted(genannt - set(erwartet))))
    fremd = re.findall(r'<script[^>]+src="(?:https?:)?//[^"]+', seite)
    pruefe("index.html lädt kein Skript von fremden Servern", not fremd, ", ".join(fremd))


# ---------- Netz ----------

def lade(adresse):
    with urllib.request.urlopen(adresse, timeout=60) as antwort:
        return antwort.read()


def paketangaben(paket, version):
    """Angaben des Registers zu einer Version (oder zu „latest“)"""
    return json.loads(lade(REGISTER + urllib.parse.quote(paket, safe="@") + "/" + version))


def lade_paket(angaben):
    """Lädt das Paket und vergleicht es mit der Prüfsumme (SHA-512), die das Register dazu nennt."""
    paket = lade(angaben["dist"]["tarball"])
    verfahren, _, soll = angaben["dist"]["integrity"].partition("-")
    if verfahren != "sha512": abbruch("Das Register nennt keine SHA-512-Prüfsumme für " + angaben["name"])
    if base64.b64encode(hashlib.sha512(paket).digest()).decode() != soll:
        abbruch("Die Prüfsumme des geladenen Pakets stimmt nicht: " + angaben["name"])
    return tarfile.open(fileobj=io.BytesIO(paket), mode="r:gz")


def lies_aus_paket(archiv, datei):
    try:
        return archiv.extractfile("package/" + datei).read()
    except KeyError:
        return None


# ---------- stand ----------

def zeige_stand():
    versionen = lies_paketdatei()["dependencies"]
    print(f"{'Bibliothek':28}{'eingebaut':12}{'neueste bei npm':18}")
    for paket, _, name, _ in BIBLIOTHEKEN:
        neueste = paketangaben(paket, "latest")["version"]
        print(f"{name:28}{versionen[paket]:12}{neueste:18}{'' if neueste == versionen[paket] else '← neuer'}")
    print("\nAktualisieren, zum Beispiel:  python3 werkzeuge/bibliotheken.py holen papaparse@5.7.1")
    print("Danach die Tests laufen lassen und die Erkennung von Hand ausprobieren (siehe README, „Bibliotheken aktualisieren“).")


# ---------- holen ----------

def trage_versionen_ein(wuensche):
    """wuensche: Angaben wie papaparse@5.7.1 von der Befehlszeile"""
    daten = lies_paketdatei()
    for wunsch in wuensche:
        paket, _, version = wunsch.rpartition("@")
        if paket not in daten["dependencies"]: abbruch(f"Unbekanntes Paket „{paket}“. Bekannt: " + ", ".join(daten["dependencies"]))
        if not re.fullmatch(r"\d+\.\d+\.\d+", version): abbruch(f"„{version}“ ist keine feste Version wie 5.7.1")
        daten["dependencies"][paket] = version
    schreibe_paketdatei(daten)


def pruefe_lizenz(angaben, archiv, name, lizenz):
    """Bricht ab, wenn das Paket unter einer anderen Lizenz steht als bisher; weist auf einen geänderten Lizenztext hin."""
    if angaben.get("license") != lizenz:
        abbruch(f"{name} {angaben['version']} steht laut Paket unter „{angaben.get('license')}“, erwartet war „{lizenz}“. "
                "Bitte erst die Lizenz klären; nichts wurde geändert.")
    for datei in ("LICENSE", "LICENSE.md", "LICENSE.txt", "NOTICE"):
        text = lies_aus_paket(archiv, datei)
        if text is None: continue
        hinweise = " ".join((WURZEL / "NOTICE").read_text(encoding="utf-8").split())
        if " ".join(text.decode("utf-8", "replace").split()) not in hinweise:
            print(f"   HINWEIS: Das Paket enthält die Datei {datei}, deren Text so nicht in NOTICE steht. Bitte NOTICE von Hand anpassen.")


def ersetze_in_datei(pfad, ersetzungen):
    text = pfad.read_text(encoding="utf-8")
    for muster, neu in ersetzungen:
        text, anzahl = re.subn(muster, neu, text)
        if anzahl == 0: abbruch(f"In {pfad.name} nicht gefunden: {muster}")
    pfad.write_text(text, encoding="utf-8")


def hole_bibliothek(paket, datei, name, lizenz, version):
    alt, alte_version = vorhandene_datei(paket, datei)
    if alt is None: abbruch(f"Für {name} liegt keine Datei in libs/ – der Ausgangsstand ist unvollständig.")
    print(f"== {name}: {alte_version} → {version}")
    angaben = paketangaben(paket, version)
    archiv = lade_paket(angaben)
    pruefe_lizenz(angaben, archiv, name, lizenz)
    inhalt = lies_aus_paket(archiv, datei)
    if inhalt is None: abbruch(f"Das Paket enthält die Datei {datei} nicht mehr.")
    neu = LIBS / dateiname(paket, version, datei)
    neu.write_bytes(inhalt)
    alt.unlink()
    ersetze_in_datei(WURZEL / "index.html", [
        (r'(<script src="libs/' + re.escape(alt.name) + r'"\s+integrity=")[^"]+', lambda m: m.group(1) + pruefsumme(inhalt)),
        (re.escape(alt.name), neu.name),
    ])
    # In NOTICE bleibt die Spaltenbreite erhalten: „Papa Parse 5.4.1     papaparse“ → „Papa Parse 5.7.1     papaparse“
    eintrag = lambda v, breite=0: f"{name} {v}".ljust(breite)
    ersetze_in_datei(WURZEL / "NOTICE", [
        (re.escape(eintrag(alte_version)) + r"( +)", lambda m: eintrag(version, len(m.group(0)) - 1) + " "),
    ])
    voraussetzungen = angaben.get("peerDependencies", {})
    if voraussetzungen:
        print("   setzt voraus: " + ", ".join(f"{k} {v}" for k, v in voraussetzungen.items()))


def hole_alle(wuensche):
    if wuensche: trage_versionen_ein(wuensche)
    versionen = lies_paketdatei()["dependencies"]
    geaendert = 0
    for paket, datei, name, lizenz in BIBLIOTHEKEN:
        if (LIBS / dateiname(paket, versionen[paket], datei)).is_file(): continue
        hole_bibliothek(paket, datei, name, lizenz, versionen[paket])
        geaendert += 1
    print("\nNichts zu tun: libs/ entspricht package.json.\n" if geaendert == 0 else f"\n{geaendert} Bibliothek(en) ausgetauscht.\n")
    pruefe_bestand()
    if geaendert and not fehler:
        print("\nJetzt: Tests laufen lassen (tests/alle.sh), die Erkennung von Hand ausprobieren, CHANGELOG ergänzen.")
        print("Zurück zum alten Stand: git checkout -- . && git clean -fd libs/")


# ---------- Aufruf ----------

if __name__ == "__main__":
    befehl = sys.argv[1] if len(sys.argv) > 1 else "pruefen"
    if befehl == "pruefen": pruefe_bestand()
    elif befehl == "stand": zeige_stand()
    elif befehl == "holen": hole_alle(sys.argv[2:])
    else: abbruch("Befehle: pruefen, stand, holen [paket@version …]")
    if fehler: print(f"\n{len(fehler)} Erwartung(en) nicht erfüllt: " + "; ".join(fehler))
    elif befehl == "pruefen": print("\nAlle Erwartungen erfüllt.")
    sys.exit(1 if fehler else 0)
