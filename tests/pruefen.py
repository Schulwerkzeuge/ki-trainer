# Gemeinsame Hilfe der Tests: Server für die Dateien des KI-Trainers, Browser mit simulierter Kamera, Ausgabe „ok/FEHLER“.
import functools, http.server, pathlib, sys, threading
from playwright.sync_api import sync_playwright

WURZEL = pathlib.Path(__file__).resolve().parent.parent
PORT = 8811
ADRESSE = f"http://127.0.0.1:{PORT}/"
# Strenge Kopfzeilen wie auf einem sorgfältig eingerichteten Server: Die Seite darf nur eigene Dateien laden.
# 'unsafe-eval' braucht TensorFlow.js (die fertige Datei tf.min.js erzeugt intern Funktionen aus Text) – siehe README.
CSP = ("default-src 'none'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
       "media-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:; font-src 'self'; manifest-src 'self'; "
       "base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
fehler = []


def pruefe(name, ok, info=""):
    print(("ok     " if ok else "FEHLER ") + name + (f"  ({info})" if info != "" else ""))
    if not ok: fehler.append(name)
    return bool(ok)


class Dateien(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Content-Security-Policy", CSP)
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()
    def log_message(self, *a): pass


def starte_server():
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), functools.partial(Dateien, directory=str(WURZEL)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


class Sitzung:
    """Browser mit simulierter Kamera und simuliertem Mikrofon; sammelt Fehler und alle Netzanfragen."""
    def __enter__(self):
        self.srv = starte_server()
        self.pw = sync_playwright().start()
        self.browser = self.pw.chromium.launch(args=["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"])
        self.kontext = self.browser.new_context(viewport={"width": 1280, "height": 900}, permissions=["camera", "microphone"],
                                                accept_downloads=True)
        self.meldungen, self.anfragen = [], []
        return self

    def seite(self):
        s = self.kontext.new_page()
        s.set_default_timeout(15000)
        s.on("pageerror", lambda e: self.meldungen.append("Fehler: " + str(e)[:300]))
        s.on("console", lambda m: m.type == "error" and self.meldungen.append("Konsole: " + m.text[:300]))
        s.on("request", lambda r: self.anfragen.append(r.url))
        s.on("dialog", lambda d: d.accept())                      # Rückfragen („Wirklich löschen?“) bestätigen
        s.goto(ADRESSE)
        s.wait_for_timeout(800)
        return s

    def __exit__(self, *a):
        self.browser.close(); self.pw.stop(); self.srv.shutdown()


def ende():
    print()
    print("Alle Erwartungen erfüllt." if not fehler else f"{len(fehler)} Erwartung(en) nicht erfüllt: " + "; ".join(fehler))
    sys.exit(1 if fehler else 0)
