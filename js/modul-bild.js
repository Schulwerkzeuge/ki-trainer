// SPDX-License-Identifier: Apache-2.0 · © 2026 St.-Antonius-Gymnasium Lüdinghausen
// KI-Trainer – Modul Bilderkennung
'use strict';

// ═══════════════════════════════════════════════════════
//  MODUL: BILDERKENNUNG
// ═══════════════════════════════════════════════════════
class BildModul extends LernModul {
  constructor() {
    super({ id: 'img', startKlassen: ['Klasse 1', 'Klasse 2'], aufnahmeAbstand: 160, probenSpeichern: false });
    this._kameraStrom      = null;
    this._kameraRichtung  = 'user';
    this._gespiegelt      = true;   // front cam mirrored by default
    this._aufnahmeFlaeche = document.getElementById('img-canvas');
    this._aufnahmeStift    = this._aufnahmeFlaeche.getContext('2d');
    this._video         = document.getElementById('img-video');
  }

  async _richteEin() {
    setzeStatus(this.id, 'loading', 'Lade KI-Modell…');
    await holeMobileNet();
    setzeStatus(this.id, 'on', 'Bereit – Kamera starten');
  }

  get _aufnahmeText() { return '📸 Gedrückt halten'; }

  _wendeSpiegelungAn() {
    this._video.style.transform = this._gespiegelt ? 'scaleX(-1)' : '';
  }

  async starteKamera() {
    zeigeKameraLaedt('img-cam-btn', true);
    try {
      this._stoppeKamera();
      this._kameraStrom = await navigator.mediaDevices.getUserMedia({
        video: videoVorgaben(this),
        audio: false,
      });
      this._video.srcObject = this._kameraStrom;
      await warteAufVideo(this._video);
      // Automatisch spiegeln: Frontkamera ja, Rückkamera nein
      this._gespiegelt = (this._kameraRichtung === 'user');
      this._wendeSpiegelungAn();
      document.getElementById('img-overlay').style.display = 'none';
      zeigeKameraLaedt('img-cam-btn', false);
      setzeStatus(this.id, 'on', 'Kamera aktiv');
    } catch (fehler) {
      zeigeKameraLaedt('img-cam-btn', false);
      this._stoppeKamera();
      console.error('[img] Camera error:', fehler);
      melde(`⚠️ Kamera: ${fehler.message}`);
    }
  }

  schalteSpiegelung() {
    this._gespiegelt = !this._gespiegelt;
    this._wendeSpiegelungAn();
  }

  _stoppeKamera() {
    this._kameraStrom?.getTracks().forEach(t => t.stop());
    this._kameraStrom = null;
  }

  raeumeAuf() {
    super.raeumeAuf();
    this._stoppeKamera();
    // Kamera-Overlay wieder einblenden, sonst fehlt beim erneuten
    // Öffnen des Moduls der "Kamera starten"-Button
    const ueberlagerung = document.getElementById('img-overlay');
    if (ueberlagerung) ueberlagerung.style.display = '';
    zeigeKameraLaedt('img-cam-btn', false);
    if (this.gestartet) setzeStatus(this.id, '', 'Kamera gestoppt');
  }

  async wechsleKamera() {
    if (!this._kameraStrom) return;
    await naechsteKamera(this);   // zyklisch durch alle Videogeräte (nicht nur vorn/hinten)
  }

  async nimmAlleAuf() {
    for (const c of this.klassen) {
      await this._nimmAuf(c.id);
    }
  }

  _holeBild() {
    const { videoWidth: w, videoHeight: h } = this._video;
    if (!w) return null;
    const flaeche = this._aufnahmeFlaeche;
    const stift = this._aufnahmeStift;
    flaeche.width = w; flaeche.height = h;
    stift.save();
    if (this._kameraRichtung === 'user') { stift.translate(w, 0); stift.scale(-1, 1); }
    stift.drawImage(this._video, 0, 0);
    stift.restore();
    return flaeche;
  }

  async _nimmAuf(klassenId) {
    const klasse = this._klasse(klassenId);
    if (!klasse || !this._kameraStrom) return;
    const einzelbild = this._holeBild();
    if (!einzelbild) return;

    // Nur das Bild merken; trainiere() berechnet die Merkmale, wenn sie gebraucht werden.
    // (Ein Eintrag im KNN ginge beim nächsten knn.clearAllClasses() ohnehin verloren.)
    const quelle = einzelbild.toDataURL('image/jpeg', 0.7);
    klasse.samples.push(quelle);
    this.trainiert = false;
    this._zeigeVorschauen(klasse);
    this._aktualisiereTrainierKnopf();
  }

  async _probeZuTensor(quelle) {
    const bild = await ladeBild(quelle);
    return berechneMerkmale(bild);
  }

  async _erkenneEinmal() {
    if (!this._kameraStrom) return;
    const einzelbild = this._holeBild();
    if (!einzelbild) return;
    let merkmal;
    try {
      merkmal   = await berechneMerkmale(einzelbild);
      const ergebnis = await this._klassifiziere(merkmal);
      this._zeigeWahrscheinlichkeiten(ergebnis.confidences);
    } catch {
      // Einzelbild übersprungen – unkritisch
    } finally {
      merkmal?.dispose();
    }
  }
}
