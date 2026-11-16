# Änderungen

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
