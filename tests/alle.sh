#!/bin/bash
# Alle Prüfungen nacheinander; Aufruf aus dem Projektordner: tests/alle.sh
cd "$(dirname "$0")/.." || exit 1
PY=python3; [ -x .venv/bin/python ] && PY=.venv/bin/python
ergebnis=0
echo "== Bibliotheken"; python3 werkzeuge/bibliotheken.py pruefen || ergebnis=1
echo; echo "== KI-Trainer im Browser"; $PY tests/ki_trainer.py || ergebnis=1
echo; [ $ergebnis = 0 ] && echo "ALLES IN ORDNUNG" || echo "ES GIBT FEHLER"
exit $ergebnis
