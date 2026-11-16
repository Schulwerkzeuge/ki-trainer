// SPDX-License-Identifier: Apache-2.0 · © 2026 St.-Antonius-Gymnasium Lüdinghausen
// KI-Trainer – Modul Zahlendaten
'use strict';

// ═══════════════════════════════════════════════════════
//  MODUL: ZAHLENDATEN
// ═══════════════════════════════════════════════════════
class DatenModul extends LernModul {
  constructor() {
    super({ id: 'data', startKlassen: ['Klasse A', 'Klasse B'], aufnahmeAbstand: 999999 });
    this._merkmale = ['Merkmal 1', 'Merkmal 2'];
    this._csvSpalten = [];
    this._csvZeilen    = [];
  }

  async _richteEin() {
    setzeStatus('data', 'on', 'Bereit');
    this.zeigeMerkmale();
  }

  // Merkmalsnamen gehören zum Datensatz – ohne sie wären wiederhergestellte
  // Proben nach einem Reload falsch beschriftet
  _speichereZusatz() { return { features: this._merkmale }; }
  /** Ein geladenes Modell muss zur Anzahl der Merkmale passen – sonst die Merkmale neutral neu anlegen */
  _pruefeGeladenesModell(daten) {
    const n = daten.dataset[0].shape[1];
    if (n > 20) throw new Error('Die Modell-Datei hat zu viele Merkmale.');
    if (n !== this._merkmale.length) {
      this._merkmale = Array.from({ length: n }, (_, i) => `Merkmal ${i + 1}`);
      this.zeigeMerkmale();
    }
  }
  _stelleZusatzWiederHer(zusatz) {
    if (zusatz?.features?.length) {
      this._merkmale = zusatz.features;
      this.zeigeMerkmale();
    }
  }

  get _aufnahmeText() { return '+ Beispiel hinzufügen'; }

  // Überschrieben: Das Daten-Modul hat keine Kamera
  async starteKamera() {}
  raeumeAuf() { super.raeumeAuf(); }

  _zeigeVorschauen(klasse) {
    const behaelter = document.getElementById(`data-thumbs-${klasse.id}`);
    const zaehler   = document.getElementById(`data-cnt-${klasse.id}`);
    if (zaehler) zaehler.textContent = `${klasse.samples.length} Proben`;
    if (!behaelter) return;
    behaelter.innerHTML = '';
    klasse.samples.slice(-8).forEach((vektor, i) => {
      const marke = document.createElement('span');
      marke.className = 'data-sample-num';
      marke.title = vektor.map((v,j) => `${this._merkmale[j]||j}: ${v}`).join(', ');
      marke.textContent = vektor.map(v => typeof v === 'number' ? v.toFixed(1) : v).join(' | ');
      behaelter.appendChild(marke);
    });
  }

  async _probeZuTensor(vektor) {
    return tf.tensor(vektor.map(Number), [vektor.length]);
  }

  async _nimmAuf(klassenId) {
    // Aufnahme von Hand – liest die Werte aus den Eingabefeldern
    const klasse = this._klasse(klassenId);
    if (!klasse) return;
    const eingaben = document.querySelectorAll('#data-predict-inputs input');
    const vektor = Array.from(eingaben).map(eingabe => parseFloat(eingabe.value));
    if (vektor.some(isNaN)) { melde('⚠️ Bitte alle Felder ausfüllen'); return; }
    klasse.samples.push(vektor);
    this.trainiert = false;
    this._zeigeVorschauen(klasse);
    this._aktualisiereTrainierKnopf();
    melde(`✓ Beispiel zu „${klasse.name}" hinzugefügt`);
  }

  async _erkenneEinmal() { /* handled manually */ }

  async klassifiziereEingabe() {
    if (!this.trainiert) { melde('Bitte erst trainieren'); return; }
    const eingaben = document.querySelectorAll('#data-predict-inputs input');
    const vektor = Array.from(eingaben).map(eingabe => parseFloat(eingabe.value));
    if (vektor.some(isNaN)) { melde('⚠️ Bitte alle Felder ausfüllen'); return; }
    let t;
    try {
      t = tf.tensor(vektor, [vektor.length]);
      const ergebnis = await this._klassifiziere(t);
      this._zeigeWahrscheinlichkeiten(ergebnis.confidences);
    } finally { t?.dispose(); }
  }

  zeigeMerkmale() {
    const liste = document.getElementById('data-features-list');
    if (!liste) return;
    liste.innerHTML = '';
    this._merkmale.forEach((name, i) => {
      const zeile = document.createElement('div');
      zeile.className = 'data-feature-row';
      const eingabe = document.createElement('input');
      eingabe.className = 'data-feature-name'; eingabe.type = 'text';
      eingabe.value = name; eingabe.maxLength = 40;
      eingabe.addEventListener('change', () => {
        this._merkmale[i] = eingabe.value;
        this.zeigeEingabefelder();
      });
      const loeschKnopf = document.createElement('button');
      loeschKnopf.type = 'button'; loeschKnopf.className = 'data-feature-del'; loeschKnopf.textContent = '✕';
      loeschKnopf.addEventListener('click', () => {
        this._merkmale.splice(i, 1);
        this.zeigeMerkmale();
        this.zeigeEingabefelder();
      });
      zeile.append(eingabe, loeschKnopf);
      liste.appendChild(zeile);
    });
    this.zeigeEingabefelder();
  }

  neuesMerkmal() {
    this._merkmale.push(`Merkmal ${this._merkmale.length + 1}`);
    this.zeigeMerkmale();
  }

  zeigeEingabefelder() {
    const raster = document.getElementById('data-predict-inputs');
    if (!raster) return;
    raster.innerHTML = '';
    this._merkmale.forEach(name => {
      const feld = document.createElement('div');
      feld.className = 'data-input-field';
      const beschriftungsFeld = document.createElement('label');
      beschriftungsFeld.textContent = name;
      const eingabe = document.createElement('input');
      eingabe.type = 'number'; eingabe.step = 'any'; eingabe.placeholder = '0.0';
      feld.append(beschriftungsFeld, eingabe);
      raster.appendChild(feld);
    });
  }

  ladePinguine() {
    this._merkmale = [...PENGUINS_DATA.features];
    this.klassen = [];
    this.knn.clearAllClasses();
    this.trainiert = false;
    // Klassen aus den verschiedenen Werten der Klassenspalte bilden
    const klassenMenge = [...new Set(PENGUINS_DATA.rows.map(r => r[PENGUINS_DATA.labelColumn]))];
    klassenMenge.forEach(beschriftung => {
      const id = this._naechsteId++;
      const zeilen = PENGUINS_DATA.rows.filter(r => r[PENGUINS_DATA.labelColumn] === beschriftung);
      const proben = zeilen.map(r => PENGUINS_DATA.features.map(f => r[f]));
      this.klassen.push({ id, name: beschriftung, samples: proben });
    });
    this.zeigeMerkmale();
    this._zeigeKlassen();
    this._speichere();
    const notiz = document.getElementById('data-dataset-note');
    if (notiz) {
      notiz.style.display = 'block';
      notiz.innerHTML = `<strong>🐧 ${PENGUINS_DATA.name}</strong><br>
        ${PENGUINS_DATA.note}<br>
        Quelle: ${entschaerfeHtml(PENGUINS_DATA.source)} · 3 Arten · 4 Merkmale · 150 Zeilen`;
    }
    melde(`🐧 ${PENGUINS_DATA.rows.length} Pinguine geladen`);
  }

  ladeCsv(datei) {
    Papa.parse(datei, {
      header: true, skipEmptyLines: true,
      complete: (ergebnisse) => {
        this._csvSpalten = ergebnisse.meta.fields || [];
        this._csvZeilen    = ergebnisse.data;
        const auswahl = document.getElementById('data-label-col');
        auswahl.innerHTML = '';
        this._csvSpalten.forEach(spalte => {
          const option = document.createElement('option');
          option.value = spalte; option.textContent = spalte;
          auswahl.appendChild(option);
        });
        const einstellung = document.getElementById('data-csv-config');
        if (einstellung) einstellung.style.display = 'flex';
        melde(`📁 ${ergebnisse.data.length} Zeilen geladen – Label-Spalte wählen`);
      },
      error: (fehler) => melde(`⚠️ CSV-Fehler: ${fehler.message}`)
    });
  }

  uebernimmCsv() {
    const klassenSpalte = document.getElementById('data-label-col')?.value;
    if (!klassenSpalte) return;
    const merkmalSpalten = this._csvSpalten.filter(c => c !== klassenSpalte);
    this._merkmale = merkmalSpalten;
    this.klassen = [];
    this.knn.clearAllClasses();
    this.trainiert = false;
    const klassenMenge = [...new Set(this._csvZeilen.map(r => r[klassenSpalte]))];
    klassenMenge.forEach(beschriftung => {
      const id = this._naechsteId++;
      const zeilen = this._csvZeilen.filter(r => r[klassenSpalte] === beschriftung);
      const proben = zeilen.map(r => merkmalSpalten.map(f => parseFloat(r[f])));
      this.klassen.push({ id, name: beschriftung, samples: proben });
    });
    const einstellung = document.getElementById('data-csv-config');
    if (einstellung) einstellung.style.display = 'none';
    this.zeigeMerkmale();
    this._zeigeKlassen();
    melde(`✓ ${this._csvZeilen.length} Zeilen, ${klassenMenge.length} Klassen übernommen`);
  }

  _zeigeKlassen() {
    const behaelter = document.getElementById('data-classes');
    if (!behaelter) return;
    behaelter.innerHTML = '';
    this.klassen.forEach((klasse, index) => {
      const farbe = KLASSEN_FARBEN[index % KLASSEN_FARBEN.length];
      const karte = document.createElement('div');
      karte.className = 'cls-card';
      const kopf = document.createElement('div');
      kopf.className = 'cls-hd';
      const streifen = document.createElement('div');
      streifen.className = 'cls-stripe'; streifen.style.background = farbe;
      const namensFeld = document.createElement('input');
      namensFeld.className = 'cls-name'; namensFeld.type = 'text';
      namensFeld.value = klasse.name; namensFeld.maxLength = 40;
      namensFeld.addEventListener('change', () => this.benenneKlasseUm(klasse.id, namensFeld.value));
      const anzahl = document.createElement('span');
      anzahl.className = 'cls-count'; anzahl.id = `data-cnt-${klasse.id}`;
      anzahl.textContent = `${klasse.samples.length} Proben`;
      kopf.append(streifen, namensFeld, anzahl);
      if (this.klassen.length > 2) {
        const loeschKnopf = document.createElement('button');
        loeschKnopf.type = 'button'; loeschKnopf.className = 'cls-del'; loeschKnopf.textContent = '✕';
        loeschKnopf.addEventListener('click', () => { this.loescheKlasse(klasse.id); this._zeigeKlassen(); });
        kopf.appendChild(loeschKnopf);
      }
      const aktionen = document.createElement('div');
      aktionen.className = 'cls-act';
      const neuKnopf = document.createElement('button');
      neuKnopf.type = 'button'; neuKnopf.className = 'btn-hold';
      neuKnopf.style.cssText = `background:${farbe}15;color:${farbe};border:1px solid ${farbe}40`;
      neuKnopf.textContent = '+ Aktuelle Werte hinzufügen';
      neuKnopf.addEventListener('click', () => this._nimmAuf(klasse.id));
      const leerenKnopf = document.createElement('button');
      leerenKnopf.type = 'button'; leerenKnopf.className = 'btn-clear-cls';
      leerenKnopf.textContent = '🗑'; leerenKnopf.title = 'Alle Proben löschen';
      leerenKnopf.addEventListener('click', () => { this.leereKlasse(klasse.id); this._zeigeVorschauen(klasse); });
      aktionen.append(neuKnopf, leerenKnopf);
      const vorschauen = document.createElement('div');
      vorschauen.className = 'cls-thumbs'; vorschauen.id = `data-thumbs-${klasse.id}`;
      karte.append(kopf, aktionen, vorschauen);
      behaelter.appendChild(karte);
      this._zeigeVorschauen(klasse);
    });
    this._aktualisiereTrainierKnopf();
    this.zeigeEingabefelder();
  }
}
