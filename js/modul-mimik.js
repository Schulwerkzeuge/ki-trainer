// SPDX-License-Identifier: Apache-2.0 · © 2026 St.-Antonius-Gymnasium Lüdinghausen
// KI-Trainer – Modul Mimikerkennung
'use strict';

// ═══════════════════════════════════════════════════════
//  MODUL: MIMIKERKENNUNG
// ═══════════════════════════════════════════════════════
class MimikModul extends LernModul {
  constructor() {
    super({ id: 'face', startKlassen: ['Lächeln', 'Neutral', 'Überrascht'], aufnahmeAbstand: 200 });
    this._kameraStrom      = null;
    this._kameraRichtung  = 'user';
    this._gespiegelt      = true;
    this._erkenner    = null;
    this._rafId       = null;
    this._schleifeLaeuft = false;
    this._letztePunkte     = null;
    this._aktiverReiter   = 'spiegel';
    // Die Elemente der Seite werden erst in _richteEin() gesucht – beim Anlegen des Objekts gibt es sie noch nicht
    this._video       = null;
    this._punkteFlaeche    = null;
    this._punkteStift       = null;
    this._avatarFlaeche= null;
    this._avatarStift   = null;
  }

  async _richteEin() {
    // Jetzt die Elemente der Seite suchen – beim Aufruf von starte() sind sie vorhanden
    this._video        = document.getElementById('face-video');
    this._punkteFlaeche     = document.getElementById('face-kp-canvas');
    this._punkteStift        = this._punkteFlaeche.getContext('2d');
    this._avatarFlaeche = document.getElementById('face-avatar-canvas');
    this._avatarStift    = this._avatarFlaeche.getContext('2d');

    this._erkennerLaedt = true;
    setzeStatus('face', 'loading', 'Lade Gesichtsmodell…');
    try {
      if (!GESICHTSFINDER_ADRESSE || !GESICHTSNETZ_ADRESSE) {
        throw new Error('LOCAL_FACE_DETECTOR_URL / LOCAL_FACE_MESH_URL nicht gesetzt – die Modelle müssen im Ordner models/ liegen.');
      }
      const erkennerEinstellung = {
        runtime: 'tfjs',
        refineLandmarks: false,
        maxFaces: 1,
        detectorModelUrl: GESICHTSFINDER_ADRESSE,
        landmarkModelUrl: GESICHTSNETZ_ADRESSE,
      };
      this._erkenner = await faceLandmarksDetection.createDetector(
        faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
        erkennerEinstellung
      );
      // Aufwärmen: Die erste Erkennung übersetzt die Rechenprogramme für den
      // Grafikchip und dauert auf iPads mehrere Sekunden – besser jetzt als
      // nach dem Kamerastart
      setzeStatus('face', 'loading', 'Bereite Gesichtsmodell vor…');
      try {
        const probe = document.createElement('canvas');
        probe.width = probe.height = 256;
        await this._erkenner.estimateFaces(probe);
      } catch (_) { /* Aufwärmen ist optional */ }
    } catch(e) {
      console.error('[face] detector init failed:', e);
      // Präzise Diagnose: liegen die Modell-Dateien überhaupt auf dem Server?
      // (Mimik nutzt NICHT das Pose-Modell: eigene Ordner face-detector/ + face-mesh/,
      //  Installation über download-models-face.sh)
      let meldung = e.message.length < 80 ? e.message : 'Modell-Fehler – LOCAL_FACE_*_URL prüfen';
      try {
        const [d, m] = await Promise.all([
          fetch(GESICHTSFINDER_ADRESSE, { method: 'HEAD' }).then(r => r.ok).catch(() => false),
          fetch(GESICHTSNETZ_ADRESSE,     { method: 'HEAD' }).then(r => r.ok).catch(() => false),
        ]);
        if (!d || !m) {
          const fehlend = [!d && 'face-detector', !m && 'face-mesh'].filter(Boolean).join(' + ');
          meldung = `Modell fehlt auf dem Server: ${fehlend} – download-models-face.sh ausführen`;
          melde(`⚠️ Mimik-Modelle fehlen (${fehlend}). Auf dem Server download-models-face.sh ausführen.`);
        }
      } catch(_) { /* Diagnose optional */ }
      setzeStatus('face', 'off', meldung);
    }
    this._erkennerLaedt = false;
    // Avatar-Bereich nie leer lassen – Hinweis passend zum Zustand
    if (!this._erkenner) {
      this._zeichneAvatarPlatzhalter('⚠️ Gesichtsmodell nicht geladen');
    } else if (this._kameraStrom) {
      // Kamera wurde schon während des Ladens gestartet
      setzeStatus('face', 'loading', 'Kamera aktiv – Erkennung startet…');
      this._zeichneAvatarPlatzhalter('Einen Moment – die Erkennung startet …');
    } else {
      setzeStatus('face', 'on', 'Bereit – Kamera starten');
      this._zeichneAvatarPlatzhalter('Kamera starten – die Katze ahmt dich nach');
    }
  }

  get _aufnahmeText() { return '😊 Gedrückt halten'; }

  async starteKamera() {
    zeigeKameraLaedt('face-cam-btn', true);
    try {
      this._stoppeKamera();
      this._kameraStrom = await navigator.mediaDevices.getUserMedia({
        video: videoVorgaben(this),
        audio: false,
      });
      this._video.srcObject = this._kameraStrom;
      await warteAufVideo(this._video);
      this._gespiegelt = (this._kameraRichtung === 'user');
      this._video.style.transform = this._gespiegelt ? 'scaleX(-1)' : '';
      document.getElementById('face-cam-overlay').style.display = 'none';
      zeigeKameraLaedt('face-cam-btn', false);
      if (this._erkenner) {
        setzeStatus('face', 'loading', 'Kamera aktiv – Erkennung startet…');
        this._zeichneAvatarPlatzhalter('Einen Moment – die Erkennung startet …');
      } else if (this._erkennerLaedt) {
        setzeStatus('face', 'loading', 'Kamera aktiv – Gesichtsmodell lädt…');
        this._zeichneAvatarPlatzhalter('Gesichtsmodell lädt …');
      } else {
        // Kamera läuft, aber ohne Modell bleibt der Avatar stumm – ehrlich sagen
        setzeStatus('face', 'on', 'Kamera aktiv');
        melde('⚠️ Gesichtsmodell nicht geladen – Avatar bleibt inaktiv');
        this._zeichneAvatarPlatzhalter('⚠️ Gesichtsmodell nicht geladen');
      }
      this._ersteErkennung = true;
      this._starteSchleife();
    } catch(fehler) {
      zeigeKameraLaedt('face-cam-btn', false);
      this._stoppeKamera();
      console.error('[face] camera error:', fehler);
      melde(`⚠️ Kamera: ${fehler.message}`);
    }
  }

  async wechsleKamera() {
    if (!this._kameraStrom) return;
    await naechsteKamera(this);   // zyklisch durch alle Videogeräte (nicht nur vorn/hinten)
  }

  schalteSpiegelung() {
    this._gespiegelt = !this._gespiegelt;
    this._video.style.transform = this._gespiegelt ? 'scaleX(-1)' : '';
  }

  _stoppeKamera() {
    this._kameraStrom?.getTracks().forEach(t => t.stop());
    this._kameraStrom = null;
  }

  raeumeAuf() {
    super.raeumeAuf();
    this._schleifeLaeuft = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._stoppeKamera();
    // Kamera-Overlay wieder einblenden, sonst fehlt beim erneuten
    // Öffnen des Moduls der "Kamera starten"-Button
    const ueberlagerung = document.getElementById('face-cam-overlay');
    if (ueberlagerung) ueberlagerung.style.display = '';
    zeigeKameraLaedt('face-cam-btn', false);
    if (this.gestartet) setzeStatus(this.id, '', 'Kamera gestoppt');
    if (this._avatarFlaeche) this._zeichneAvatarPlatzhalter();
  }

  _starteSchleife() {
    if (this._schleifeLaeuft) return;
    this._schleifeLaeuft = true;
    this._schleife();
  }

  async _schleife() {
    if (!this._schleifeLaeuft || !this._kameraStrom) return;
    // Ältere iPads: Face Mesh nur jede 2. Frame auswerten – halbiert die
    // Rechenlast, der Avatar bleibt für das Auge flüssig
    this._bildWechsel = !this._bildWechsel;
    if (!this._bildWechsel) {
      this._rafId = requestAnimationFrame(() => this._schleife());
      return;
    }
    try {
      if (this._video.readyState >= 2 && this._erkenner) {
        if (this._video.width !== this._video.videoWidth) { this._video.width = this._video.videoWidth; this._video.height = this._video.videoHeight; } // tfjs liest die Bildgröße aus width/height
        const gesichter = await this._erkenner.estimateFaces(this._video, { flipHorizontal: this._gespiegelt });
        if (this._ersteErkennung) {
          this._ersteErkennung = false;
          setzeStatus('face', 'on', 'Kamera aktiv');
        }
        if (gesichter.length > 0) {
          this._letztePunkte = gesichter[0].keypoints;
          this._zeichneAvatar(this._letztePunkte);
          this._zeichnePunkte(this._letztePunkte);
          if (this._aktiverReiter === 'erkunden') this._aktualisiereMimikBalken(this._letztePunkte);
        } else {
          this._letztePunkte = null;
          this._leereAvatar();
          this._leerePunkteAnzeige();
        }
      }
    } catch(e) { /* frame skipped */ }
    this._rafId = requestAnimationFrame(() => this._schleife());
  }

  /** Keypoint-Overlay auf dem Kamerabild – macht sichtbar, WOMIT die
   *  Mimikerkennung arbeitet (Messpunkte, keine "Gefühle"). */
  _zeichnePunkte(punkte) {
    const flaeche = this._punkteFlaeche;
    if (!flaeche || !this._video.videoWidth) return;
    const vw = this._video.videoWidth, vh = this._video.videoHeight;
    if (flaeche.width !== vw || flaeche.height !== vh) { flaeche.width = vw; flaeche.height = vh; }
    const stift = this._punkteStift;
    stift.clearRect(0, 0, vw, vh);
    // Kein CSS-Flip auf dem Canvas: estimateFaces(…, { flipHorizontal }) liefert
    // die Koordinaten bereits passend zum (per CSS gespiegelten) Videobild.
    flaeche.style.transform = '';
    stift.fillStyle = 'rgba(120, 220, 170, .85)';
    // Nur jeden 4. der 468 Punkte zeichnen – genug fürs Verständnis, ruhiger fürs Auge
    for (let i = 0; i < punkte.length; i += 4) {
      stift.fillRect(punkte[i].x - 1, punkte[i].y - 1, 2, 2);
    }
  }

  _leerePunkteAnzeige() {
    if (this._punkteStift && this._punkteFlaeche?.width) {
      this._punkteStift.clearRect(0, 0, this._punkteFlaeche.width, this._punkteFlaeche.height);
    }
  }

  // ── Hilfen für Gesichtspunkte ──────────────────────────────
  _punkt(punkte, index) { return punkte[index] || { x: 0, y: 0, z: 0 }; }

  _abstand(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  }

  _berechneMimik(punkte) {
    // MediaPipe face mesh landmark indices
    const mundOffen  = this._abstand(this._punkt(punkte,13), this._punkt(punkte,14)) /
                       Math.max(1, this._abstand(this._punkt(punkte,61), this._punkt(punkte,291)));
    const laechelnL     = this._punkt(punkte,61).y - this._punkt(punkte,13).y;
    const laechelnR     = this._punkt(punkte,291).y - this._punkt(punkte,13).y;
    const laecheln      = Math.max(0, -(laechelnL + laechelnR) / 2 /
                       Math.max(1, this._abstand(this._punkt(punkte,10), this._punkt(punkte,152)))) * 8;
    const brauenHoeheL      = this._punkt(punkte,105).y - this._punkt(punkte,159).y;
    const brauenHoeheR      = this._punkt(punkte,334).y - this._punkt(punkte,386).y;
    const brauenHoch    = Math.max(0, -(brauenHoeheL + brauenHoeheR) / 2 /
                       Math.max(1, this._abstand(this._punkt(punkte,10), this._punkt(punkte,152)))) * 12;
    const augeOffenL   = this._abstand(this._punkt(punkte,159), this._punkt(punkte,145)) /
                       Math.max(1, this._abstand(this._punkt(punkte,33), this._punkt(punkte,133)));
    const augeOffenR   = this._abstand(this._punkt(punkte,386), this._punkt(punkte,374)) /
                       Math.max(1, this._abstand(this._punkt(punkte,362), this._punkt(punkte,263)));
    const augeOffen    = Math.min(1, (augeOffenL + augeOffenR) / 2 * 3);
    return {
      'Lächeln':          Math.min(1, laecheln),
      'Mundöffnung':      Math.min(1, mundOffen * 1.5),
      'Augenbrauen hoch': Math.min(1, brauenHoch),
      'Augen offen':      augeOffen,
    };
  }

  _aktualisiereMimikBalken(punkte) {
    const mimik = this._berechneMimik(punkte);
    const farben = ['#f43f5e', '#f59e0b', '#a78bfa', '#22c55e'];
    const behaelter = document.getElementById('face-expr-bars');
    if (!behaelter) return;
    if (!behaelter.children.length) {
      Object.keys(mimik).forEach((beschriftung, i) => {
        const zeile  = document.createElement('div');
        zeile.className = 'pred-row';
        zeile.innerHTML = `
          <div class="pred-label">${entschaerfeHtml(beschriftung)}</div>
          <div class="pred-track"><div class="pred-fill" id="face-expr-${i}" style="width:0%;background:${farben[i]}"></div></div>
          <div class="pred-pct" id="face-expr-pct-${i}">0%</div>`;
        behaelter.appendChild(zeile);
      });
    }
    Object.values(mimik).forEach((wert, i) => {
      const prozent = Math.round(wert * 100);
      const fuellung = document.getElementById(`face-expr-${i}`);
      const beschriftungsFeld  = document.getElementById(`face-expr-pct-${i}`);
      if (fuellung) fuellung.style.width = prozent + '%';
      if (beschriftungsFeld)  beschriftungsFeld.textContent  = prozent + '%';
    });
  }

  // ── Katzen-Avatar ────────────────────────────────────
  _zeichneAvatar(punkte) {
    const ziel = { ...this._berechneMimik(punkte), ...this._berechneKopfhaltung(punkte) };
    // Glätten: kleine Messschwankungen sollen die Katze nicht zittern lassen
    if (!this._avatarZustand) this._avatarZustand = { ...ziel };
    const s = this._avatarZustand;
    for (const schluessel of Object.keys(ziel)) s[schluessel] += (ziel[schluessel] - s[schluessel]) * 0.45;
    this._zeichneAvatarGesicht(s);
  }

  /** Kopfhaltung sowie Augen und Brauen je Seite aus den Keypoints.
   *  Links/rechts beziehen sich auf das Bild, wie es auf dem Bildschirm
   *  erscheint – so bewegt sich die Katze wie ein Spiegelbild. */
  _berechneKopfhaltung(punkte) {
    const k = i => this._punkt(punkte, i);
    const a = k(33), b = k(263);                     // äußere Augenwinkel
    const aLinks = a.x <= b.x;
    const links = aLinks ? a : b, rechts = aLinks ? b : a;
    const abstand = Math.max(1, this._abstand(links, rechts));
    const ux = (rechts.x - links.x) / abstand, uy = (rechts.y - links.y) / abstand;
    const mx = (links.x + rechts.x) / 2, my = (links.y + rechts.y) / 2;
    const nase = k(1);
    const dx = nase.x - mx, dy = nase.y - my;
    const quer   = (dx * ux + dy * uy) / abstand;    // Nase seitlich versetzt → Kopf gedreht
    const laengs = (dy * ux - dx * uy) / abstand;    // Nase höher/tiefer → Kopf nickt

    const offen = (o, u, w1, w2) =>
      Math.min(1, this._abstand(k(o), k(u)) / Math.max(1, this._abstand(k(w1), k(w2))) * 3);
    const augeA = offen(159, 145, 33, 133), augeB = offen(386, 374, 362, 263);
    const braueA = this._abstand(k(105), k(159)) / abstand;
    const braueB = this._abstand(k(334), k(386)) / abstand;

    // Neutrale Haltung langsam mitlernen: Nicken und Brauen werden relativ dazu gemessen
    const roh = { nicken: laengs, braueA, braueB };
    if (!this._basis) this._basis = { ...roh };
    for (const schluessel in roh) this._basis[schluessel] += (roh[schluessel] - this._basis[schluessel]) * 0.006;
    const grenze = v => Math.max(-1, Math.min(1, v));
    const bA = grenze((braueA - this._basis.braueA) * 8);
    const bB = grenze((braueB - this._basis.braueB) * 8);

    return {
      neigung: Math.max(-0.7, Math.min(0.7, Math.atan2(rechts.y - links.y, rechts.x - links.x))),
      drehung: grenze(quer * 3),
      nicken:  grenze((laengs - this._basis.nicken) * 5),
      augeL:   aLinks ? augeA : augeB,
      augeR:   aLinks ? augeB : augeA,
      braueL:  aLinks ? bA : bB,
      braueR:  aLinks ? bB : bA,
    };
  }

  /** Platzhalter: neutrale Katze + Hinweistext – so ist der Avatar-Bereich
   *  nie leer und man versteht sofort, was hier passieren wird. */
  _zeichneAvatarPlatzhalter(hinweis = 'Kamera starten – die Katze ahmt dich nach') {
    this._avatarZustand = null;   // nach Gesichtsverlust neu einschwingen
    this._basis = null;         // neutrale Haltung neu lernen
    this._zeichneAvatarGesicht({
      'Lächeln': 0.25, 'Mundöffnung': 0,
      'Augenbrauen hoch': 0.1, 'Augen offen': 0.85,
    });
    const flaeche = this._avatarFlaeche;
    if (!flaeche) return;
    const stift = this._avatarStift;
    const W = flaeche.width, H = flaeche.height;
    stift.fillStyle = 'rgba(0,0,0,.55)';
    const balkenHoehe = Math.max(26, H * 0.14);
    stift.fillRect(0, H - balkenHoehe, W, balkenHoehe);
    stift.fillStyle = '#fff';
    stift.font = `600 ${Math.max(11, W * 0.045)}px sans-serif`;
    stift.textAlign = 'center';
    stift.textBaseline = 'middle';
    stift.fillText(hinweis, W / 2, H - balkenHoehe / 2, W - 16);
  }

  _zeichneAvatarGesicht(w) {
    const flaeche = this._avatarFlaeche;
    if (!flaeche) return;
    const stift = this._avatarStift;
    const W = flaeche.offsetWidth || 200;
    const H = flaeche.offsetHeight || 200;
    flaeche.width = W; flaeche.height = H;
    stift.clearRect(0, 0, W, H);

    const laecheln     = w['Lächeln'] ?? 0;
    const mundOffen = w['Mundöffnung'] ?? 0;
    const offen     = w['Augen offen'] ?? 0.85;
    const augeL     = w.augeL ?? offen, augeR  = w.augeR ?? offen;
    const braueL    = w.braueL ?? 0,    braueR = w.braueR ?? 0;
    const neigung   = w.neigung ?? 0,   drehung = w.drehung ?? 0, nicken = w.nicken ?? 0;

    const r  = Math.min(W, H) * 0.34;
    // Gesichtszüge wandern beim Drehen/Nicken weiter als der Kopfumriss – das wirkt räumlich
    const fx = drehung * r * 0.3;
    const fy = nicken * r * 0.2;

    stift.save();
    stift.translate(W / 2 + drehung * r * 0.1, H / 2 + nicken * r * 0.06);
    stift.rotate(neigung);

    // Ohren – stellen sich auf, wenn die Brauen hochgehen
    const ohrHoch = Math.max(0, (braueL + braueR) / 2) * r * 0.14;
    const ohrBreite = r * 0.38, ohrHoehe = r * 0.45;
    [-1, 1].forEach(seite => {
      const ex = seite * r * 0.6 - fx * 0.25;
      const ey = -r * 0.82 - ohrHoch;
      stift.fillStyle = '#f59e0b';
      stift.beginPath();
      stift.moveTo(ex, ey + ohrHoehe);
      stift.lineTo(ex - ohrBreite / 2, ey - ohrHoehe * 0.3);
      stift.lineTo(ex + ohrBreite / 2, ey - ohrHoehe * 0.3);
      stift.closePath(); stift.fill();
      stift.fillStyle = '#fda4af';
      stift.beginPath();
      stift.moveTo(ex, ey + ohrHoehe * 0.6);
      stift.lineTo(ex - ohrBreite * 0.25, ey - ohrHoehe * 0.1);
      stift.lineTo(ex + ohrBreite * 0.25, ey - ohrHoehe * 0.1);
      stift.closePath(); stift.fill();
    });

    // Kopf – beim Drehen etwas schmaler
    stift.fillStyle = '#f59e0b';
    stift.beginPath();
    stift.ellipse(0, 0, r * (1 - Math.abs(drehung) * 0.06), r * 0.92, 0, 0, Math.PI * 2);
    stift.fill();

    // Augen – einzeln (Zwinkern), das abgewandte Auge wird schmaler
    const augenY = -r * 0.1 + fy;
    [[-1, augeL, 1 - Math.max(0, -drehung) * 0.35],
     [ 1, augeR, 1 - Math.max(0,  drehung) * 0.35]].forEach(([seite, auf, breite]) => {
      const ex = seite * r * 0.35 + fx;
      const eh = Math.max(r * 0.012, r * 0.18 * (0.08 + auf * 0.92));
      stift.fillStyle = '#1c1912';
      stift.beginPath();
      stift.ellipse(ex, augenY, r * 0.13 * breite, eh, 0, 0, Math.PI * 2);
      stift.fill();
      if (auf > 0.3) {
        // Lichtpunkt folgt der Blickrichtung
        stift.fillStyle = 'white';
        stift.beginPath();
        stift.arc(ex + r * 0.04 * breite + drehung * r * 0.04,
                augenY - eh * 0.3 + nicken * r * 0.03, r * 0.03, 0, Math.PI * 2);
        stift.fill();
      }
    });

    // Augenbrauen – jede Seite einzeln
    stift.strokeStyle = '#92400e'; stift.lineWidth = r * 0.06; stift.lineCap = 'round';
    [[-1, braueL], [1, braueR]].forEach(([seite, b]) => {
      const bx = seite * r * 0.35 + fx;
      const by = augenY - r * 0.24 - b * r * 0.09;
      stift.beginPath();
      stift.moveTo(bx - r * 0.12, by + r * 0.04);
      stift.quadraticCurveTo(bx, by - Math.max(0, b) * r * 0.03, bx + r * 0.12, by + r * 0.04);
      stift.stroke();
    });

    // Nase
    const nx = fx * 1.15, ny = r * 0.1 + fy * 1.1;
    stift.fillStyle = '#fda4af';
    stift.beginPath();
    stift.ellipse(nx, ny, r * 0.07, r * 0.05, 0, 0, Math.PI * 2);
    stift.fill();

    // Schnurrhaare – heben sich beim Lächeln
    stift.strokeStyle = 'rgba(255,255,255,0.7)'; stift.lineWidth = 1.5;
    [[-1, 1], [-1, -1], [1, 1], [1, -1]].forEach(([sx, sy]) => {
      stift.beginPath();
      stift.moveTo(nx + sx * r * 0.1, ny + r * 0.02);
      stift.lineTo(sx * r * 0.65 + fx * 0.6, ny + r * 0.02 + sy * r * 0.08 - laecheln * r * 0.05);
      stift.stroke();
    });

    // Mund
    const mx = fx, mundY = r * 0.28 + fy;
    const oeffnungsHoehe  = r * 0.22 * mundOffen;
    const laechelnBreite = r * 0.22 * (1 + laecheln * 0.5);
    stift.strokeStyle = '#92400e'; stift.lineWidth = r * 0.05;
    stift.beginPath();
    stift.moveTo(mx - laechelnBreite, mundY);
    stift.quadraticCurveTo(mx, mundY + r * 0.12 * (1 + laecheln) + oeffnungsHoehe, mx + laechelnBreite, mundY);
    stift.stroke();
    if (mundOffen > 0.15) {
      stift.fillStyle = '#991b1b';
      stift.beginPath();
      stift.moveTo(mx - laechelnBreite * 0.7, mundY + r * 0.04);
      stift.quadraticCurveTo(mx, mundY + r * 0.1 * (1 + laecheln) + oeffnungsHoehe * 1.2, mx + laechelnBreite * 0.7, mundY + r * 0.04);
      stift.closePath(); stift.fill();
      if (mundOffen > 0.55) {
        // Zunge bei weit geöffnetem Mund
        stift.fillStyle = '#f472b6';
        stift.beginPath();
        stift.ellipse(mx, mundY + r * 0.05 + oeffnungsHoehe * 0.5, r * 0.08, r * 0.05, 0, 0, Math.PI * 2);
        stift.fill();
      }
    }
    stift.restore();
  }

  _leereAvatar() {
    // Statt leerer Fläche: neutrale Katze mit Hinweis (Canvas kann keine
    // CSS-Variablen als Farben verarbeiten – daher der frühere „leere" Avatar)
    this._zeichneAvatarPlatzhalter('Kein Gesicht erkannt');
  }

  // ── Aufnahme für den KNN (überschrieben) ──────────
  async _nimmAuf(klassenId) {
    const klasse = this._klasse(klassenId);
    if (!klasse || !this._letztePunkte) { melde('⚠️ Kein Gesicht erkannt'); return; }
    const vektor = this._punkteZuVektor(this._letztePunkte);
    klasse.samples.push(vektor);
    this.trainiert = false;
    this._zeigeVorschauen(klasse);
    this._aktualisiereTrainierKnopf();
  }

  _punkteZuVektor(punkte) {
    // Auf den Rahmen um das Gesicht normieren; liefert eine flache Liste aus x- und y-Werten
    const xs = punkte.map(k => k.x), ys = punkte.map(k => k.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const spanneX = maxX - minX || 1, spanneY = maxY - minY || 1;
    const flach = [];
    punkte.forEach(k => { flach.push((k.x - minX) / spanneX, (k.y - minY) / spanneY); });
    return flach;
  }

  async _probeZuTensor(vektor) {
    return tf.tensor(vektor, [vektor.length]);
  }

  async _erkenneEinmal() {
    if (!this._letztePunkte) return;
    const vektor = this._punkteZuVektor(this._letztePunkte);
    let t;
    try {
      t = tf.tensor(vektor, [vektor.length]);
      const ergebnis = await this._klassifiziere(t);
      this._zeigeWahrscheinlichkeiten(ergebnis.confidences);
    } catch(e) { /* skip */ } finally { t?.dispose(); }
  }

  _zeigeVorschauen(klasse) {
    const behaelter = document.getElementById(`face-thumbs-${klasse.id}`);
    const zaehler   = document.getElementById(`face-cnt-${klasse.id}`);
    if (!behaelter) return;
    behaelter.innerHTML = '';
    if (zaehler) zaehler.textContent = `${klasse.samples.length} Proben`;
    // Mimik hat keine Vorschaubilder – nur Marken mit der Nummer der Probe
    klasse.samples.slice(-VORSCHAU_GRENZE).forEach((_, i) => {
      const marke = document.createElement('span');
      marke.className = 'data-sample-num';
      marke.textContent = `#${klasse.samples.length - Math.min(VORSCHAU_GRENZE, klasse.samples.length) + i + 1}`;
      behaelter.appendChild(marke);
    });
  }

  wechsleReiter(reiter) {
    this._aktiverReiter = reiter;
    document.querySelectorAll('.face-tab').forEach(t =>
      t.classList.toggle('is-active', t.dataset.faceTab === reiter));
    document.querySelectorAll('.face-pane').forEach(p =>
      p.classList.toggle('is-active', p.id === `face-pane-${reiter}`));
    // Kurze Erklärung des aktiven Modus – hilft bei der Orientierung
    const hinweise = {
      spiegel:    'Der Katzen-Avatar neben dem Kamerabild ahmt deine Gesichtsbewegungen live nach.',
      erkunden:   'Aus den Gesichts-Keypoints werden Ausdruckswerte (Lächeln, Mundöffnung …) berechnet und als Balken angezeigt.',
      trainieren: 'Lege Klassen an (z.\u202fB. „Lächeln", „Neutral"), nimm Proben deiner Mimik auf und trainiere eine eigene KI.',
    };
    const hinweisElement = document.getElementById('face-tab-hint');
    if (hinweisElement && hinweise[reiter]) hinweisElement.textContent = hinweise[reiter];
  }

  // Das Mimik-Modul baut seine Klassenkarten anders (kein Knopf zum Hochladen von Bildern)
  _baueKlassenKarte(klasse, index, behaelter) {
    const farbe = KLASSEN_FARBEN[index % KLASSEN_FARBEN.length];
    const karte = document.createElement('div');
    karte.className = 'cls-card';

    const kopf = document.createElement('div');
    kopf.className = 'cls-hd';
    const streifen = document.createElement('div');
    streifen.className = 'cls-stripe';
    streifen.style.background = farbe;
    const namensFeld = document.createElement('input');
    namensFeld.className = 'cls-name'; namensFeld.type = 'text';
    namensFeld.value = klasse.name; namensFeld.maxLength = 40;
    namensFeld.addEventListener('change', () => this.benenneKlasseUm(klasse.id, namensFeld.value));
    const anzahl = document.createElement('span');
    anzahl.className = 'cls-count'; anzahl.id = `face-cnt-${klasse.id}`;
    anzahl.textContent = `${klasse.samples.length} Proben`;
    kopf.append(streifen, namensFeld, anzahl);
    if (this.klassen.length > 2) {
      const loeschKnopf = document.createElement('button');
      loeschKnopf.type = 'button'; loeschKnopf.className = 'cls-del'; loeschKnopf.textContent = '✕';
      loeschKnopf.addEventListener('click', () => this.loescheKlasse(klasse.id));
      kopf.appendChild(loeschKnopf);
    }

    const aktionen = document.createElement('div');
    aktionen.className = 'cls-act';
    const halteKnopf = document.createElement('button');
    halteKnopf.type = 'button'; halteKnopf.className = 'btn-hold';
    halteKnopf.style.cssText = `background:${farbe}15;color:${farbe};border:1px solid ${farbe}40`;
    halteKnopf.textContent = '😊 Gedrückt halten';
    halteKnopf.title = 'Gedrückt halten – per Maus, Touch oder Leertaste';
    halteKnopf.addEventListener('pointerdown', () => this.starteAufnahme(klasse.id));
    halteKnopf.addEventListener('pointerup', () => this.stoppeAufnahme());
    halteKnopf.addEventListener('pointerleave', () => this.stoppeAufnahme());
    // Touch-Geräte: Abbruch durch Scrollen/System beendet die Aufnahme,
    // Langdruck darf kein Kontextmenü öffnen
    halteKnopf.addEventListener('pointercancel', () => this.stoppeAufnahme());
    halteKnopf.addEventListener('contextmenu', e => e.preventDefault());
    // Barrierefreiheit: Aufnahme auch per Tastatur (Leertaste/Enter halten)
    halteKnopf.addEventListener('keydown', e => {
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); this.starteAufnahme(klasse.id); }
    });
    halteKnopf.addEventListener('keyup', e => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); this.stoppeAufnahme(); }
    });
    halteKnopf.addEventListener('blur', () => this.stoppeAufnahme());
    const leerenKnopf = document.createElement('button');
    leerenKnopf.type = 'button'; leerenKnopf.className = 'btn-clear-cls';
    leerenKnopf.textContent = '🗑'; leerenKnopf.title = 'Proben löschen';
    leerenKnopf.addEventListener('click', () => this.leereKlasse(klasse.id));
    aktionen.append(halteKnopf, leerenKnopf);

    const vorschauen = document.createElement('div');
    vorschauen.className = 'cls-thumbs';
    vorschauen.id = `face-thumbs-${klasse.id}`;

    karte.append(kopf, aktionen, vorschauen);
    behaelter.appendChild(karte);
    this._zeigeVorschauen(klasse);
  }

  _zeigeKlassen() {
    const behaelter = document.getElementById('face-classes');
    if (!behaelter) return;
    behaelter.innerHTML = '';
    this.klassen.forEach((klasse, index) => this._baueKlassenKarte(klasse, index, behaelter));
    this._aktualisiereTrainierKnopf();
  }
}
