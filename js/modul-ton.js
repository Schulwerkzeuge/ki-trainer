// SPDX-License-Identifier: Apache-2.0 · © 2026 St.-Antonius-Gymnasium Lüdinghausen
// KI-Trainer – Modul Tonerkennung
'use strict';

// ═══════════════════════════════════════════════════════
//  MODUL: TONERKENNUNG
// ═══════════════════════════════════════════════════════
class TonModul extends LernModul {
  constructor() {
    super({ id: 'audio', startKlassen: ['Stille', 'Klatschen'], aufnahmeAbstand: 400 });
    this._tonKontext  = null;
    this._analysator  = null;
    this._mikrofonStrom = null;
    this._anzeigeRaf    = null;
    this._anzeigeLaeuft = false;
    this._anzeigeFlaeche = document.getElementById('audio-viz');
    this._anzeigeStift    = this._anzeigeFlaeche.getContext('2d');
    // Größe der Zeichenfläche merken, statt sie in jedem Bild neu zu messen
    this._anzeigeBreite = 0; this._anzeigeHoehe = 0;
    new ResizeObserver(() => this._merkeAnzeigeGroesse()).observe(this._anzeigeFlaeche);
  }

  async _richteEin() {
    setzeStatus(this.id, 'on', 'Mikrofon starten');
  }

  get _aufnahmeText() { return '🎙 Gedrückt halten'; }

  /** Ton: kein Hochladen von Bildern */
  async _verarbeiteUpload() { /* no-op */ }

  _merkeAnzeigeGroesse() {
    this._anzeigeBreite = this._anzeigeFlaeche.offsetWidth  || 300;
    this._anzeigeHoehe = this._anzeigeFlaeche.offsetHeight || 80;
    this._anzeigeFlaeche.width  = this._anzeigeBreite;
    this._anzeigeFlaeche.height = this._anzeigeHoehe;
  }

  async starteMikrofon() {
    if (this._mikrofonStrom) return; // Already active
    try {
      this._mikrofonStrom = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false },
        video: false,
      });
      this._tonKontext = new (window.AudioContext || window.webkitAudioContext)();
      this._analysator = this._tonKontext.createAnalyser();
      this._analysator.fftSize = 512;
      this._tonKontext.createMediaStreamSource(this._mikrofonStrom).connect(this._analysator);
      document.getElementById('audio-mic-btn').textContent = '🎙️ Mikrofon aktiv';
      setzeStatus(this.id, 'on', 'Mikrofon aktiv');
      this._merkeAnzeigeGroesse();
      this._anzeigeLaeuft = true;
      this._anzeigeSchleife();
    } catch (fehler) {
      console.error('[audio] Mic error:', fehler);
      melde(`⚠️ Mikrofon: ${fehler.message}`);
    }
  }

  _stoppeMikrofon() {
    this._anzeigeLaeuft = false;
    if (this._anzeigeRaf)   { cancelAnimationFrame(this._anzeigeRaf); this._anzeigeRaf = null; }
    this._mikrofonStrom?.getTracks().forEach(t => t.stop());
    this._mikrofonStrom = null;
    this._tonKontext?.close().catch(() => {});
    this._tonKontext = null;
    this._analysator  = null;
  }

  raeumeAuf() {
    super.raeumeAuf();
    this._stoppeMikrofon();
  }

  _merkmalsVektor() {
    if (!this._analysator) return null;
    const puffer = new Float32Array(this._analysator.frequencyBinCount);
    this._analysator.getFloatFrequencyData(puffer);
    return Array.from(puffer, v => Math.max(0, Math.min(1, (v + 140) / 140)));
  }

  _erzeugeVorschau(merkmal) {
    const c   = document.createElement('canvas');
    c.width = 40; c.height = 40;
    const stift = c.getContext('2d');
    stift.fillStyle = '#111';
    stift.fillRect(0, 0, 40, 40);
    stift.fillStyle = '#f43f5e';
    const schritt = Math.floor(merkmal.length / 40);
    for (let i = 0; i < 40; i++) {
      const h = Math.round((merkmal[i * schritt] ?? 0) * 38);
      stift.fillRect(i, 40 - h, 1, h);
    }
    return c.toDataURL();
  }

  _probeZuVorschau(merkmal) { return this._erzeugeVorschau(merkmal); }

  _anzeigeSchleife() {
    if (!this._anzeigeLaeuft) return;
    this._anzeigeStift.fillStyle = '#000';
    this._anzeigeStift.fillRect(0, 0, this._anzeigeBreite, this._anzeigeHoehe);
    const merkmal = this._merkmalsVektor();
    if (merkmal) {
      const w = this._anzeigeBreite / merkmal.length;
      this._anzeigeStift.fillStyle = '#f43f5e';
      merkmal.forEach((v, i) => {
        this._anzeigeStift.globalAlpha = 0.7 + v * 0.3;
        this._anzeigeStift.fillRect(i * w, this._anzeigeHoehe - v * this._anzeigeHoehe, Math.max(1, w - 0.5), v * this._anzeigeHoehe);
      });
      this._anzeigeStift.globalAlpha = 1;
    }
    this._anzeigeRaf = requestAnimationFrame(() => this._anzeigeSchleife());
  }

  async _nimmAuf(klassenId) {
    const klasse  = this._klasse(klassenId);
    const merkmal = this._merkmalsVektor();
    if (!klasse || !merkmal) return;

    klasse.samples.push(merkmal);
    this.trainiert = false;

    const tensor = tf.tensor2d([merkmal]);
    try {
      this.knn.addExample(tensor, klassenId);
    } finally {
      tensor.dispose();
    }

    this._zeigeVorschauen(klasse);
    this._aktualisiereTrainierKnopf();
    document.getElementById('audio-rec').classList.add('is-active');
    setTimeout(() => document.getElementById('audio-rec')?.classList.remove('is-active'), 300);
  }

  async _probeZuTensor(merkmal) {
    return tf.tensor2d([merkmal]);
  }

  async _erkenneEinmal() {
    const merkmal = this._merkmalsVektor();
    if (!merkmal) return;
    const tensor = tf.tensor2d([merkmal]);
    try {
      const ergebnis = await this._klassifiziere(tensor);
      this._zeigeWahrscheinlichkeiten(ergebnis.confidences);
    } catch (fehler) { /* ignore */ }
    finally { tensor.dispose(); }
  }

  _starteLive() {
    this._liveLaeuft = true;
    const knopf = document.getElementById(`${this.id}-live-btn`);
    knopf.textContent = '⏹ Stoppen'; knopf.classList.add('is-live');
    // Async loop avoids setInterval + async race condition
    this._tonLiveSchleife();
  }

  async _tonLiveSchleife() {
    while (this._liveLaeuft) {
      await this._erkenneEinmal();
      await new Promise(r => setTimeout(r, 200));
    }
  }

  stoppeLive() {
    this._liveLaeuft = false; // _audioLiveLoop exits on next iteration
    const knopf = document.getElementById(`${this.id}-live-btn`);
    if (knopf) { knopf.textContent = '▶ Live-Erkennung starten'; knopf.classList.remove('is-live'); }
  }
}
