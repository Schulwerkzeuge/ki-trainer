// SPDX-License-Identifier: Apache-2.0 · © 2026 St.-Antonius-Gymnasium Lüdinghausen
// KI-Trainer – Modul Poseerkennung
'use strict';

// ═══════════════════════════════════════════════════════
//  MODUL: POSEERKENNUNG
// ═══════════════════════════════════════════════════════
class PoseModul extends LernModul {
  constructor() {
    super({ id: 'pose', startKlassen: ['Pose 1', 'Pose 2'], aufnahmeAbstand: 200 });
    this._erkenner   = null;
    this._kameraStrom     = null;
    this._kameraRichtung = 'user';
    this._video      = document.getElementById('pose-video');
    this._ueberlagerung    = document.getElementById('pose-overlay');
    this._ueberlagerungStift = this._ueberlagerung.getContext('2d');
    this._zeichenRaf    = null;
    this._letztePosen  = null;       // Shared between skeleton loop and prediction
    this._skelettLaeuft = false; // Guards async teardown race in _skeletonLoop
  }

  async _richteEin() {
    setzeStatus(this.id, 'loading', 'Lade Pose-Modell…');
    try {
      if (!MOVENET_ADRESSE) throw new Error('LOCAL_MOVENET_URL nicht gesetzt – Modell muss lokal bereitgestellt werden. Siehe download-models.sh.');
      await tf.ready();
      const erkennerEinstellung = {
        modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
        modelUrl: MOVENET_ADRESSE,
      };
      this._erkenner = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        erkennerEinstellung
      );
      setzeStatus(this.id, 'on', 'Bereit – Kamera starten');
    } catch (fehler) {
      console.error('[pose] Model error:', fehler);
      setzeStatus(this.id, '', `Fehler: ${fehler.message}`);
    }
  }

  get _aufnahmeText() { return '📸 Gedrückt halten'; }

  async starteKamera() {
    zeigeKameraLaedt('pose-cam-btn', true);
    try {
      this._stoppeKamera();
      this._kameraStrom = await navigator.mediaDevices.getUserMedia({
        video: videoVorgaben(this),
        audio: false,
      });
      this._video.srcObject = this._kameraStrom;
      await warteAufVideo(this._video);
      document.getElementById('pose-overlay-ui').style.display = 'none';
      zeigeKameraLaedt('pose-cam-btn', false);
      setzeStatus(this.id, 'on', 'Kamera aktiv');
      this._skelettLaeuft = true;
      this._skelettSchleife();
    } catch (fehler) {
      zeigeKameraLaedt('pose-cam-btn', false);
      this._stoppeKamera();
      console.error('[pose] Camera error:', fehler);
      melde(`⚠️ Kamera: ${fehler.message}`);
    }
  }

  _stoppeKamera() {
    this._skelettLaeuft = false;
    if (this._zeichenRaf) { cancelAnimationFrame(this._zeichenRaf); this._zeichenRaf = null; }
    this._kameraStrom?.getTracks().forEach(t => t.stop());
    this._kameraStrom = null;
  }

  raeumeAuf() {
    super.raeumeAuf();
    this._stoppeKamera();
    this._letztePosen = null;
    // Kamera-Overlay wieder einblenden, sonst fehlt beim erneuten
    // Öffnen des Moduls der "Kamera starten"-Button
    const ueberlagerung = document.getElementById('pose-overlay-ui');
    if (ueberlagerung) ueberlagerung.style.display = '';
    zeigeKameraLaedt('pose-cam-btn', false);
    const statusText = document.getElementById('pose-status-txt');
    if (statusText) statusText.textContent = 'Warte auf Kamera…';
    if (this.gestartet) setzeStatus(this.id, '', 'Kamera gestoppt');
  }

  async wechsleKamera() {
    if (!this._kameraStrom) return;
    await naechsteKamera(this);   // zyklisch durch alle Videogeräte (nicht nur vorn/hinten)
  }

  /** Ersatzweg: die Pose direkt aus dem Videobild bestimmen */
  async _poseVektor() {
    if (!this._erkenner || !this._video.videoWidth) return null;
    try {
      const posen = await this._erkenner.estimatePoses(this._video);
      if (!posen?.length) return null;
      return this._poseZuVektor(posen[0].keypoints);
    } catch { return null; }
  }

  async _skelettSchleife() {
    if (!this._kameraStrom || !this._skelettLaeuft) return;
    const { videoWidth: w, videoHeight: h } = this._video;
    if (w) {
      // Zeichenfläche nur anpassen, wenn sich die Größe wirklich ändert
      if (this._ueberlagerung.width !== w || this._ueberlagerung.height !== h) {
        this._ueberlagerung.width  = w;
        this._ueberlagerung.height = h;
      }
      this._ueberlagerungStift.clearRect(0, 0, w, h);
      try {
        if (!this._erkenner) {
          // Kamera läuft, aber das Pose-Modell fehlt – ehrlich sagen statt
          // fälschlich "Keine Person erkannt" anzuzeigen
          document.getElementById('pose-status-txt').textContent =
            '⚠️ Pose-Modell nicht geladen – Skelett-Erkennung inaktiv';
        } else {
          const posen = await this._erkenner.estimatePoses(this._video);
          // After an async await, re-check that we're still running
          if (!this._skelettLaeuft) return;
          this._letztePosen = posen ?? null; // Share result with _predictOnce
          if (posen?.length) {
            this._zeichneSkelett(posen[0].keypoints);
            document.getElementById('pose-status-txt').textContent = 'Person erkannt ✓';
          } else {
            document.getElementById('pose-status-txt').textContent = 'Keine Person erkannt';
          }
        }
      } catch { /* ignore frame errors */ }
    }
    if (this._skelettLaeuft) {
      this._zeichenRaf = requestAnimationFrame(() => this._skelettSchleife());
    }
  }

  _zeichneSkelett(punkte) {
    const stift = this._ueberlagerungStift;
    stift.lineWidth   = 2.5;
    stift.strokeStyle = 'rgba(34,197,94,.85)';
    POSE_VERBINDUNGEN.forEach(([a, b]) => {
      const ka = punkte[a], kb = punkte[b];
      if ((ka?.score ?? 1) > 0.3 && (kb?.score ?? 1) > 0.3) {
        stift.beginPath(); stift.moveTo(ka.x, ka.y); stift.lineTo(kb.x, kb.y); stift.stroke();
      }
    });
    stift.fillStyle = '#22c55e';
    punkte.forEach(punkt => {
      if ((punkt?.score ?? 1) > 0.3) {
        stift.beginPath(); stift.arc(punkt.x, punkt.y, 4, 0, Math.PI * 2); stift.fill();
      }
    });
  }

  async _nimmAuf(klassenId) {
    const klasse = this._klasse(klassenId);
    if (!klasse) return;
    // Am liebsten eine frische Pose; sonst die letzte aus der Skelett-Schleife
    let vektor = null;
    if (this._letztePosen?.length) {
      vektor = this._poseZuVektor(this._letztePosen[0].keypoints);
    } else {
      vektor = await this._poseVektor();
    }
    if (!vektor) { melde('⚠️ Keine Person erkannt'); return; }

    klasse.samples.push(vektor);
    this.trainiert = false;
    const tensor = tf.tensor2d([vektor]);
    try {
      this.knn.addExample(tensor, klassenId);
    } finally {
      tensor.dispose();
    }

    const zaehler = document.getElementById(`${this.id}-cnt-${klassenId}`);
    if (zaehler) zaehler.textContent = `${klasse.samples.length} Proben`;
    this._aktualisiereTrainierKnopf();
  }

  async _probeZuTensor(vektor) { return tf.tensor2d([vektor]); }

  /** Pose-Proben haben kein Vorschaubild */
  _zeigeVorschauen(_kl) { /* no-op: keypoint vectors have no image representation */ }

  /** Pose: kein Hochladen von Bildern */
  async _verarbeiteUpload() { /* no-op */ }

  async _erkenneEinmal() {
    // Die Pose aus der Skelett-Schleife dieses Bildes wiederverwenden
    // (avoids a second estimatePoses() call at 60 fps)
    if (!this._letztePosen?.length) return;
    const vektor = this._poseZuVektor(this._letztePosen[0].keypoints);
    if (!vektor) return;
    const tensor = tf.tensor2d([vektor]);
    try {
      const ergebnis = await this._klassifiziere(tensor);
      this._zeigeWahrscheinlichkeiten(ergebnis.confidences);
    } catch { /* ignore */ }
    finally { tensor.dispose(); }
  }

  _poseZuVektor(punkte) {
    if (!punkte?.length) return null;
    const ls    = punkte[5], rs = punkte[6];
    if (!ls || !rs) return null;
    const cx    = (ls.x + rs.x) / 2;
    const cy    = (ls.y + rs.y) / 2;
    const massstab = Math.max(1, Math.hypot(rs.x - ls.x, rs.y - ls.y));
    return punkte.flatMap(k => [(k.x - cx) / massstab, (k.y - cy) / massstab, k.score ?? 0]);
  }
}
