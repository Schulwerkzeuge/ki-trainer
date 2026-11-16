// SPDX-License-Identifier: Apache-2.0 · © 2026 St.-Antonius-Gymnasium Lüdinghausen
// KI-Trainer – Modul Zeichenerkennung
'use strict';

// ═══════════════════════════════════════════════════════
//  MODUL: ZEICHENERKENNUNG
// ═══════════════════════════════════════════════════════
class ZeichenModul extends LernModul {
  constructor() {
    super({ id: 'draw', startKlassen: ['Kreis', 'Dreieck'], probenSpeichern: false });
    this._flaeche     = document.getElementById('draw-canvas');
    this._stift        = this._flaeche.getContext('2d');
    this._zeichnet    = false;
    this._verlauf    = [];
    this._strichstaerke = 6;
    this._nimmtGeradeAuf = false; // Guard against double-tap adding duplicate samples
  }

  async _richteEin() {
    setzeStatus(this.id, 'loading', 'Lade KI-Modell…');
    await holeMobileNet();
    setzeStatus(this.id, 'on', 'Bereit');
    this._richteZeichenflaecheEin();
  }

  get _aufnahmeText() { return '📷 Zur Klasse hinzufügen'; }

  _richteZeichenflaecheEin() {
    if (this._flaecheBereit) return; // verhindert doppelte Listener bei Setup-Retry
    this._flaecheBereit = true;
    const huelle = this._flaeche.parentElement;
    const sz   = huelle.offsetWidth || 280;
    this._flaeche.width  = sz;
    this._flaeche.height = sz;
    this._leereZeichenflaeche();
    this._flaeche.addEventListener('pointerdown', e => this._beiDruck(e));
    this._flaeche.addEventListener('pointermove', e => this._beiBewegung(e));
    this._flaeche.addEventListener('pointerup',   () => this._beiLoslassen());
    this._flaeche.addEventListener('pointerleave',() => this._beiLoslassen());
  }

  _position(e) {
    const r = this._flaeche.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (this._flaeche.width  / r.width),
      y: (e.clientY - r.top)  * (this._flaeche.height / r.height),
    };
  }
  _beiDruck(e) { this._zeichnet = true; const p = this._position(e); this._stift.beginPath(); this._stift.moveTo(p.x, p.y); }
  _beiBewegung(e) {
    if (!this._zeichnet) return;
    const p = this._position(e);
    this._stift.lineTo(p.x, p.y);
    this._stift.strokeStyle = '#111';
    this._stift.lineWidth   = this._strichstaerke;
    this._stift.lineCap     = 'round';
    this._stift.lineJoin    = 'round';
    this._stift.stroke();
  }
  _beiLoslassen() {
    if (!this._zeichnet) return;
    this._zeichnet = false;
    this._verlauf.push(this._flaeche.toDataURL());
    if (this._verlauf.length > 30) this._verlauf.shift();
  }

  leereZeichenflaeche() {
    this._leereZeichenflaeche();
    this._verlauf = [];
  }
  _leereZeichenflaeche() {
    this._stift.fillStyle = 'white';
    this._stift.fillRect(0, 0, this._flaeche.width, this._flaeche.height);
  }

  rueckgaengig() {
    if (this._verlauf.length < 2) { this.leereZeichenflaeche(); return; }
    this._verlauf.pop();
    ladeBild(this._verlauf[this._verlauf.length - 1])
      .then(bild => this._stift.drawImage(bild, 0, 0))
      .catch(() => melde('⚠️ Rückgängig fehlgeschlagen.'));
  }

  setzeStrichstaerke(groesse) { this._strichstaerke = groesse; }

  // Override: single click adds current drawing as sample
  starteAufnahme(klassenId) { this._nimmZeichnungAuf(klassenId); }
  stoppeAufnahme() {}

  async _nimmZeichnungAuf(klassenId) {
    if (this._nimmtGeradeAuf) return;
    this._nimmtGeradeAuf = true;
    try {
      const klasse = this._klasse(klassenId);
      if (!klasse) return;
      const quelle   = this._flaeche.toDataURL('image/jpeg', 0.9);
      const bildElement = await ladeBild(quelle);
      const merkmal  = await berechneMerkmale(bildElement);
      try {
        this.knn.addExample(merkmal, klassenId);
        klasse.samples.push(quelle);
        this.trainiert = false;
        this._zeigeVorschauen(klasse);
        this._aktualisiereTrainierKnopf();
        this._speichere();
        melde('✅ Zeichnung hinzugefügt');
        this.leereZeichenflaeche();
      } finally {
        merkmal.dispose();
      }
    } finally {
      this._nimmtGeradeAuf = false;
    }
  }

  async _probeZuTensor(quelle) {
    const bild = await ladeBild(quelle);
    return berechneMerkmale(bild);
  }

  // Das Zeichen-Modul erkennt einmal auf Knopfdruck, nicht fortlaufend
  schalteLive() {
    if (!this.trainiert) { melde('⚠️ Erst trainieren!'); return; }
    this._erkenneEinmal();
  }

  _starteLive() {} // Not used for draw
  stoppeLive()    {} // Not used for draw

  async _erkenneEinmal() {
    const quelle   = this._flaeche.toDataURL('image/jpeg', 0.9);
    const bildElement = await ladeBild(quelle);
    const merkmal  = await berechneMerkmale(bildElement);
    try {
      const ergebnis = await this._klassifiziere(merkmal);
      this._zeigeWahrscheinlichkeiten(ergebnis.confidences);
    } catch (fehler) {
      console.error('[draw] Prediction error:', fehler);
    } finally {
      merkmal.dispose();
    }
  }
}
