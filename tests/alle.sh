#!/bin/bash
# Alle Prüfungen nacheinander; Aufruf aus dem Projektordner: tests/alle.sh
cd "$(dirname "$0")/.." || exit 1
PY=python3; [ -x .venv/bin/python ] && PY=.venv/bin/python
ergebnis=0
echo "== Bibliotheken"; python3 werkzeuge/bibliotheken.py pruefen || ergebnis=1
echo; echo "== KI-Trainer im Browser"
if $PY -c "import playwright, PIL" 2>/dev/null; then
    $PY tests/ki_trainer.py || ergebnis=1
else
    echo "ÜBERSPRUNGEN: Für den Browsertest fehlen Playwright und Pillow. Einmalig einrichten (siehe README, „Tests“):"
    echo "  python3 -m venv .venv && .venv/bin/pip install playwright pillow && .venv/bin/playwright install chromium"
    echo; echo "BIBLIOTHEKEN GEPRÜFT, BROWSERTEST NICHT GELAUFEN"; exit $((ergebnis ? 1 : 2))
fi
echo; [ $ergebnis = 0 ] && echo "ALLES IN ORDNUNG" || echo "ES GIBT FEHLER"
exit $ergebnis
