# Änderungen

## 1.5.5 – November 2026

- **Als Web-App installierbar:** Der KI-Trainer lässt sich auf den Home-Bildschirm oder ins Startmenü legen und öffnet sich dann in einem eigenen Fenster. Dabei wird nichts vorab gespeichert; ohne Netz startet er weiterhin nicht. Neu ist der Ordner `symbole/` – wer den Trainer auf einem eigenen Server betreibt, muss ihn mit hochladen.

## 1.5.4 – November 2026

- **Behoben:** Die Versionsnummer in der Fußzeile blieb leer.

## 1.5.3 – November 2026

- „Wie diese Seite entstanden ist“ nennt kein Produkt mehr, sondern „ein KI-Sprachmodell“.

## 1.5.2 – November 2026

Seite „Wie funktioniert das hier?“ durchgesehen.

- **Beispiele berichtigt:** Das JavaScript-Beispiel „Modell in einer eigenen Webseite nutzen“ brach bei mehr als einer Probe je Klasse ab und lud MobileNet von fremden Servern; es ist jetzt eine vollständige, lauffähige Seite mit dem Modell vom eigenen Server (ebenso das Kurzbeispiel im Modul Bilderkennung). Das Python-Beispiel las die Proben falsch ein. Das JavaScript-Beispiel wird jetzt bei jedem Testlauf ausgeführt.
- **Angaben berichtigt:** Ein Bild ergibt 1.280 Zahlen (nicht 1.024); k ist einstellbar (voreingestellt 3); Größe der Modell-Datei; der Trainer braucht zum Laden eine Verbindung zum Server und https (die Hinweise zu Offline-Betrieb und „als PWA verpacken“ stimmten nicht); „DSGVO-konform“ durch die überprüfbare Aussage ersetzt, dass nichts an einen Server geschickt wird.
- Die Versionsnummer von TensorFlow.js steht nicht mehr in der Lizenzübersicht (sie veraltete beim Aktualisieren); Versionen stehen in NOTICE. Anführungszeichen vereinheitlicht.

## 1.5.1 – November 2026

- **Bibliotheken aktualisiert:** TensorFlow.js 4.15.0 → 4.22.0, MobileNet 2.1.0 → 2.1.1, KNN Classifier 1.2.4 → 1.2.6, Face Landmarks Detection 1.0.5 → 1.0.6, Papa Parse 5.4.1 → 5.7.1. Pose Detection 2.1.3 war schon aktuell. Die Modelle in `models/` sind unverändert; früher heruntergeladene Modell-Dateien passen weiter.

## Werkzeuge – November 2026 (Anwendung unverändert 1.5.0)

- **Bibliotheken aktualisieren:** `werkzeuge/bibliotheken.py` prüft, dass `package.json`, `libs/`, die Prüfsummen in `index.html` und `NOTICE` zusammenpassen, zeigt neuere Versionen an und tauscht Bibliotheken auf Wunsch aus. `package.json` nennt die Versionen, damit GitHub vor bekannten Sicherheitslücken warnen kann. `tests/alle.sh` startet alle Prüfungen.

## 1.5.0 – November 2026

Erste öffentliche Fassung.

- **Datenschutz:** Kamerabilder und Zeichnungen werden nicht mehr im Browser gespeichert. Bis Version 1.4 blieben sie nach dem Schließen der Seite auf dem Gerät liegen; der alte Speicher wird beim ersten Start entfernt. Klassennamen und Proben aus reinen Zahlenwerten (Ton, Pose, Mimik, Daten) bleiben wie bisher, bis „Modul zurücksetzen“ gewählt wird. Die Hinweise im Programm sagen jetzt genau das.
- **Behoben:** Im Modul Mimik brach das Training mit einem Fehler ab. Im Modul Zahlendaten blieb „Klassifizieren“ nach dem Training gesperrt. „Modell laden“ (Mimik, Zahlendaten) tat nichts – die Funktion fehlte; geladene Dateien werden jetzt geprüft.
- **Barrierefreiheit:** Die Seite lässt sich wieder mit zwei Fingern vergrößern.
- **Lizenzangaben berichtigt:** Papa Parse steht unter MIT, die Pinguin-Daten unter CC0; „Speech Commands“ war aufgeführt, ist aber nicht enthalten. Neu: Datei NOTICE mit allen fremden Bestandteilen.
- **Name:** „KI-Trainer“ (vorher „Anton-KI-Trainer“); heruntergeladene Modelle heißen `ki-trainer-….json`. Das Format der Modell-Datei ist unverändert.
- **Code:** Bezeichner und Kommentare einheitlich deutsch; automatische Tests für alle sechs Module.
- Entfernt: Anmeldung eines Service Workers, den es nie gab; zwei ungenutzte Sicherungsordner mit alten Modellen.

## Frühere Fassungen (nur schulintern)

- 1.4.2 Mimik: Modell wird vorab aufgewärmt; ehrliche Statusanzeige, wenn die Kamera während des Ladens gestartet wird
- 1.4.0 Aufteilung in HTML, CSS und JavaScript; Bibliotheken lokal in `libs/` – keine Anfragen an fremde Server
- 1.3.x Design „Werkstatt“ (hell und dunkel), Live-Erkennung neben dem Kamerabild, Katzen-Avatar im Modul Mimik
- 1.2.0 Modelltest (80/20, Genauigkeit, Konfusionsmatrix), k-Regler, „Warum?“-Anzeige, Tastaturbedienung, Ansagen für Screenreader
- 1.1.0 Zwei-Spalten-Layout, robuster Kamerastart in Safari
- 1.0.x Ursprüngliche Module: Bild, Ton, Pose, Zeichnen, Mimik, Zahlendaten
