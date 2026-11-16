// SPDX-License-Identifier: Apache-2.0 · © 2026 St.-Antonius-Gymnasium Lüdinghausen
// KI-Trainer – Basisklasse aller Lernmodule
'use strict';

// ═══════════════════════════════════════════════════════
//  BASISKLASSE ALLER LERNMODULE
// ═══════════════════════════════════════════════════════
class LernModul {
  constructor({ id, startKlassen, aufnahmeAbstand = 150, probenSpeichern = true }) {
    this.id              = id;
    // Proben, die Bilder sind (Kamera, Zeichnung), bleiben nie im Browser liegen – auf geteilten Geräten
    // sähe sonst die nächste Person die Aufnahmen der vorigen. Zahlenwerte (Ton, Pose, Mimik, Daten) dürfen bleiben.
    this._probenSpeichern = probenSpeichern;
    this.klassen         = startKlassen.map((name, i) => this._neueKlasse(i, name));
    this._startKlassen = startKlassen.slice();
    this._naechsteId         = startKlassen.length;
    this.knn             = window.knnClassifier.create();
    this.k               = 3;      // Hyperparameter: Anzahl Nachbarn im KNN (per Regler einstellbar)
    this.trainiert         = false;
    this.gestartet          = false;
    this._liveLaeuft    = false;
    this._rafId          = null;
    this._aufnahmeLaeuft = false;
    this._aufnahmeAbstand = aufnahmeAbstand;
    this._trainingsMerkmale     = null;   // Feature-Vektoren fürs "Warum?"-Panel (nächste Nachbarn)
    this._speicherTimer   = null;
    this._letzteNachbarn   = 0;
    this._letzteAnsage   = 0;
  }

  // ── Start ─────────────────────────────────────
  async starte() {
    if (this.gestartet) return;
    this.gestartet = true;
    setzeStatus(this.id, 'loading', 'Lädt…');
    try {
      await this._richteEin();
    } catch (fehler) {
      // Nicht abgefangene Setup-Fehler (z. B. Netzwerkproblem beim Modell-Laden)
      // dürfen das Modul nicht dauerhaft blockieren – nächster Öffnen-Versuch lädt neu.
      console.error(`[${this.id}] Setup-Fehler:`, fehler);
      setzeStatus(this.id, '', 'Modell konnte nicht geladen werden');
      melde('⚠️ KI-Modell konnte nicht geladen werden – bitte Verbindung prüfen.');
      this.gestartet = false;
    }
    await this._stelleWiederHer();       // Autosave: Proben aus IndexedDB wiederherstellen
    this._fuegeZusatzEin();        // k-Regler, Modelltest, Zurücksetzen, Nachbarn-Panel
    this._zeigeKlassen();
    this._aktualisiereTrainierKnopf();
  }

  /** In den Modulen überschrieben: Modelle laden, Kamera vorbereiten usw. */
  async _richteEin() {}

  // ── Klassen verwalten ──────────────────────────────
  _neueKlasse(id, name) {
    return { id, name, samples: [] };
  }

  neueKlasse() {
    if (this.klassen.length >= MAX_KLASSEN) {
      melde(`⚠️ Maximal ${MAX_KLASSEN} Klassen`);
      return;
    }
    this.klassen.push(this._neueKlasse(this._naechsteId++, `Klasse ${this.klassen.length + 1}`));
    this._zeigeKlassen();
    this._speichere();
  }

  loescheKlasse(klassenId) {
    this.klassen = this.klassen.filter(c => c.id !== klassenId);
    this._verwerfeTraining();
    this._zeigeKlassen();
    this._speichere();
  }

  benenneKlasseUm(klassenId, name) {
    const gekuerzt = String(name).trim().slice(0, 40);
    const klasse = this._klasse(klassenId);
    // Leeren Namen ablehnen – der alte Name bleibt
    if (klasse) klasse.name = gekuerzt || klasse.name;
    this._speichere();
  }

  leereKlasse(klassenId) {
    const klasse = this._klasse(klassenId);
    if (!klasse) return;
    klasse.samples = [];
    this._verwerfeTraining();
    this._zeigeVorschauen(klasse);
    this._aktualisiereTrainierKnopf();
    this._speichere();
  }

  _klasse(id) {
    return this.klassen.find(c => c.id === id) ?? null;
  }

  _verwerfeTraining() {
    this.trainiert = false;
    this.knn.clearAllClasses();
    this._schalteModellKnoepfe(false);
  }

  get _kannTrainieren() {
    return this.klassen.filter(c => c.samples.length >= MIN_PROBEN).length >= 2;
  }

  // ── Aufnahme (eine asynchrone Schleife statt setInterval) ──
  starteAufnahme(klassenId) {
    if (this._aufnahmeLaeuft) return;
    this._aufnahmeLaeuft = true;
    this._aufnahmeSchleife(klassenId);
  }

  stoppeAufnahme() {
    this._aufnahmeLaeuft = false;
    this._speichere();
  }

  async _aufnahmeSchleife(klassenId) {
    while (this._aufnahmeLaeuft) {
      try {
        await this._nimmAuf(klassenId);
      } catch (fehler) {
        // Nicht schlimm – protokollieren und weiter aufnehmen
        console.warn(`[${this.id}] Capture error (skipped frame):`, fehler);
      }
      await new Promise(r => setTimeout(r, this._aufnahmeAbstand));
    }
  }

  /** Überschrieben: eine Probe für die Klasse aufnehmen */
  async _nimmAuf(_klassenId) {}

  // ── Training ──────────────────────────────────────
  async trainiere() {
    if (!this._kannTrainieren) return;
    const knopf      = document.getElementById(`${this.id}-train-btn`);
    const fortschritt = document.getElementById(`${this.id}-progress`);
    const fuellung     = document.getElementById(`${this.id}-progress-fill`);

    knopf.innerHTML = '<div class="spinner"></div> Trainiere…';
    knopf.disabled  = true;
    fortschritt.style.display = 'block';
    fuellung.style.width = '0%';

    try {
      this.knn.clearAllClasses();
      const eintraege = this.klassen.flatMap(klasse => klasse.samples.map(s => ({ cls: klasse, s })));
      let fertig = 0;
      const merkmale = [];   // fürs "Warum?"-Panel: Feature je Trainingsprobe merken

      for (const { cls: klasse, s } of eintraege) {
        const tensor = await this._probeZuTensor(s);
        try {
          merkmale.push({ clsId: klasse.id, feat: tensor.dataSync().slice() });
          this.knn.addExample(tensor, klasse.id);
        } finally {
          tensor.dispose();
        }
        fuellung.style.width = `${(++fertig / eintraege.length) * 100}%`;
        if (fertig % 5 === 0) await tf.nextFrame();
      }
      this._trainingsMerkmale = merkmale;

      this._nachTraining();
    } catch (fehler) {
      console.error(`[${this.id}] Training error:`, fehler);
      melde('❌ Training fehlgeschlagen.');
    } finally {
      knopf.innerHTML = '⚡ Erneut trainieren';
      knopf.disabled  = false;
      setTimeout(() => { fortschritt.style.display = 'none'; }, 1200);
    }
  }

  /** Überschrieben: eine gemerkte Probe in einen tf.Tensor umwandeln */
  async _probeZuTensor(_probe) { throw new Error('Not implemented'); }

  _nachTraining() {
    this.trainiert = true;
    // Null-sicher: nicht jedes Modul hat alle Buttons (z. B. hat das
    // Daten-Modul keine Live-Erkennung)
    this._schalteModellKnoepfe(true);
    this._baueErgebnisZeilen();
    setzeStatus(this.id, 'on', '✅ Training fertig!');
    melde('✅ Training abgeschlossen!');
  }

  /** Knöpfe, die ein trainiertes Modell brauchen: Live-Erkennung bzw. Klassifizieren, Herunterladen */
  _schalteModellKnoepfe(an) {
    ['live-btn', 'predict-btn', 'dl-btn'].forEach(endung => {
      const knopf = document.getElementById(`${this.id}-${endung}`);
      if (knopf) knopf.disabled = !an;
    });
  }

  // ── Live-Erkennung ───────────────────────────────
  schalteLive() {
    if (this._liveLaeuft) {
      this.stoppeLive();
    } else {
      if (!this.trainiert) { melde('⚠️ Erst trainieren!'); return; }
      this._starteLive();
    }
  }

  _starteLive() {
    this._liveLaeuft = true;
    const knopf = document.getElementById(`${this.id}-live-btn`);
    knopf.textContent = '⏹ Stoppen';
    knopf.classList.add('is-live');
    this._liveSchleife();
  }

  stoppeLive() {
    this._liveLaeuft = false;
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    const knopf = document.getElementById(`${this.id}-live-btn`);
    if (knopf) { knopf.textContent = '▶ Live-Erkennung starten'; knopf.classList.remove('is-live'); }
  }

  async _liveSchleife() {
    if (!this._liveLaeuft) return;
    await this._erkenneEinmal();
    this._rafId = requestAnimationFrame(() => this._liveSchleife());
  }

  /** Überschrieben: einmal erkennen und _zeigeWahrscheinlichkeiten aufrufen */
  async _erkenneEinmal() {}

  _zeigeWahrscheinlichkeiten(sicherheiten) {
    const siegerKennung = siegerId(sicherheiten);
    this.klassen.forEach(klasse => {
      const zeile  = document.getElementById(`pred-row-${this.id}-${klasse.id}`);
      const fuellung = document.getElementById(`pred-fill-${this.id}-${klasse.id}`);
      const prozent  = document.getElementById(`pred-pct-${this.id}-${klasse.id}`);
      if (!zeile) return;
      zeile.classList.toggle('is-winner', klasse.id === siegerKennung);
      const verwechslungen = sicherheiten[klasse.id] ?? 0;
      if (fuellung) fuellung.style.width  = `${(verwechslungen * 100).toFixed(1)}%`;
      if (prozent)  prozent.textContent   = `${(verwechslungen * 100).toFixed(0)}%`;
    });
    // Screenreader: Gewinner höchstens alle 2,5 s ansagen (sonst Dauerfeuer)
    const jetzt = performance.now();
    if (jetzt - this._letzteAnsage > 2500) {
      this._letzteAnsage = jetzt;
      const sr = document.getElementById(`${this.id}-sr-winner`);
      const sieger = this._klasse(siegerKennung);
      if (sr && sieger) sr.textContent = `Erkannt: ${sieger.name}, ${Math.round((sicherheiten[siegerKennung] ?? 0) * 100)} Prozent`;
    }
  }

  // ── Klassifikation (zentral: k-Wert + Nachbarn-Erklärung) ──
  async _klassifiziere(tensor) {
    // k darf die Anzahl der Trainingsbeispiele nicht übersteigen
    const anzahlen = this.knn.getClassExampleCount();
    const gesamt  = Object.values(anzahlen).reduce((a, b) => a + b, 0);
    const k      = Math.max(1, Math.min(this.k, gesamt));
    const ergebnis = await this.knn.predictClass(tensor, k);
    this._zeigeNachbarn(tensor);
    return ergebnis;
  }

  /** "Warum?"-Panel: die k ähnlichsten Trainingsproben anzeigen –
   *  Erklärbarkeit zum Anfassen, beim KNN fast geschenkt. */
  _zeigeNachbarn(tensor) {
    const kasten = document.getElementById(`${this.id}-nn-info`);
    if (!kasten || !this._trainingsMerkmale?.length) return;
    const jetzt = performance.now();
    if (jetzt - this._letzteNachbarn < 600) return;   // Drosselung
    this._letzteNachbarn = jetzt;

    const q = tensor.dataSync();
    const bewertet = this._trainingsMerkmale.map(({ clsId: klId, feat: merkmal }) => {
      let d = 0;
      for (let i = 0; i < q.length; i++) { const unterschied = q[i] - merkmal[i]; d += unterschied * unterschied; }
      return { clsId: klId, d };
    });
    bewertet.sort((a, b) => a.d - b.d);
    const oberste = bewertet.slice(0, Math.max(1, Math.min(this.k, bewertet.length)));

    kasten.hidden = false;
    kasten.innerHTML = '<span class="nn-label">Warum? Die ähnlichsten Trainingsproben:</span> ' +
      oberste.map(({ clsId: klId }) => {
        const index = this.klassen.findIndex(c => c.id === klId);
        const klasse = this.klassen[index];
        const farbe = KLASSEN_FARBEN[Math.max(0, index) % KLASSEN_FARBEN.length];
        return `<span class="nn-chip" style="border-color:${farbe};color:${farbe}">${entschaerfeHtml(klasse ? klasse.name : '?')}</span>`;
      }).join(' ');
  }

  // ── Evaluationsmodus: 80/20-Split, Genauigkeit + Konfusionsmatrix ──
  async teste() {
    const knopf = document.getElementById(`${this.id}-eval-btn`);
    const ausgabe = document.getElementById(`${this.id}-eval-result`);
    const brauchbare = this.klassen.filter(c => c.samples.length >= 5);
    if (brauchbare.length < 2) {
      melde('⚠️ Für den Test brauchst du mind. 2 Klassen mit je 5+ Proben.');
      return;
    }
    knopf.disabled = true;
    knopf.innerHTML = '<div class="spinner"></div> Teste…';
    ausgabe.innerHTML = '';
    try {
      // Separater KNN, damit das "echte" Training unangetastet bleibt
      const testKnn = window.knnClassifier.create();
      const testMenge = [];
      let trainingsAnzahl = 0;
      for (const klasse of brauchbare) {
        // Proben mischen, 20 % (mind. 1) als Testdaten zurückhalten
        const index = klasse.samples.map((_, i) => i);
        for (let i = index.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [index[i], index[j]] = [index[j], index[i]];
        }
        const testIndex = new Set(index.slice(0, Math.max(1, Math.round(index.length * 0.2))));
        for (let i = 0; i < klasse.samples.length; i++) {
          if (testIndex.has(i)) {
            testMenge.push({ cls: klasse, s: klasse.samples[i] });
          } else {
            const t = await this._probeZuTensor(klasse.samples[i]);
            try { testKnn.addExample(t, klasse.id); trainingsAnzahl++; } finally { t.dispose(); }
          }
        }
        await tf.nextFrame();
      }

      // Konfusionsmatrix füllen
      const verwechslungen = {};
      brauchbare.forEach(a => { verwechslungen[a.id] = {}; brauchbare.forEach(b => { verwechslungen[a.id][b.id] = 0; }); });
      let richtige = 0;
      const kTest = Math.max(1, Math.min(this.k, trainingsAnzahl));
      for (const { cls: klasse, s } of testMenge) {
        const t = await this._probeZuTensor(s);
        try {
          const r = await testKnn.predictClass(t, kTest);
          const vorhersage = Number(r.label);
          if (verwechslungen[klasse.id]?.[vorhersage] !== undefined) verwechslungen[klasse.id][vorhersage]++;
          if (vorhersage === klasse.id) richtige++;
        } finally { t.dispose(); }
      }
      testKnn.dispose?.();

      this._zeigeTestergebnis(ausgabe, brauchbare, verwechslungen, richtige, testMenge.length);
    } catch (fehler) {
      console.error(`[${this.id}] Evaluation error:`, fehler);
      ausgabe.innerHTML = '<p class="eval-err">❌ Test fehlgeschlagen.</p>';
    } finally {
      knopf.disabled = false;
      knopf.innerHTML = '🧪 Modell testen';
    }
  }

  _zeigeTestergebnis(ausgabe, brauchbare, verwechslungen, richtige, gesamt) {
    const genauigkeit = richtige / gesamt;
    // Größte Verwechslung finden (für den Lern-Tipp)
    let schlimmste = null;
    brauchbare.forEach(a => brauchbare.forEach(b => {
      if (a.id !== b.id && verwechslungen[a.id][b.id] > 0 && (!schlimmste || verwechslungen[a.id][b.id] > schlimmste.n)) {
        schlimmste = { a, b, n: verwechslungen[a.id][b.id] };
      }
    }));
    const kurz = n => entschaerfeHtml(n.length > 10 ? n.slice(0, 9) + '…' : n);
    let html = `<p class="eval-acc">Genauigkeit: <strong>${(genauigkeit * 100).toFixed(0)}\u2009%</strong> (${richtige}/${gesamt} Test-Proben richtig)</p>`;
    html += '<table class="conf-matrix"><caption>Konfusionsmatrix (Zeile = tatsächlich, Spalte = erkannt)</caption><tr><th></th>';
    brauchbare.forEach(c => { html += `<th>${kurz(c.name)}</th>`; });
    html += '</tr>';
    brauchbare.forEach(a => {
      html += `<tr><th>${kurz(a.name)}</th>`;
      brauchbare.forEach(b => {
        const v = verwechslungen[a.id][b.id];
        const klasse = a.id === b.id ? (v > 0 ? 'is-diag' : '') : (v > 0 ? 'is-err' : '');
        html += `<td class="${klasse}">${v}</td>`;
      });
      html += '</tr>';
    });
    html += '</table>';
    if (schlimmste) {
      html += `<p class="eval-tip">💡 Tipp: „${entschaerfeHtml(schlimmste.a.name)}" wurde ${schlimmste.n}× als „${entschaerfeHtml(schlimmste.b.name)}" erkannt – nimm für diese Klassen vielfältigere Proben auf.</p>`;
    } else if (genauigkeit === 1) {
      html += '<p class="eval-tip">💡 Alles richtig! Teste erneut (anderer Zufalls-Split) oder mach es der KI schwerer: neue Blickwinkel, anderes Licht, andere Personen.</p>';
    }
    ausgabe.innerHTML = html;
  }

  // ── Injizierte Zusatz-UI (k-Regler, Test, Nachbarn, Reset) ──
  _fuegeZusatzEin() {
    if (document.getElementById(`${this.id}-extras`)) return; // nur einmal
    const fortschritt = document.getElementById(`${this.id}-progress`);
    if (!fortschritt) return;
    fortschritt.insertAdjacentHTML('afterend', `
      <div class="extras" id="${this.id}-extras">
        <div class="k-row">
          <label for="${this.id}-k-slider">k = <strong id="${this.id}-k-val">${this.k}</strong></label>
          <input type="range" min="1" max="9" step="1" value="${this.k}" id="${this.id}-k-slider"
                 aria-label="k – wie viele gespeicherte Beispiele die KI vergleicht">
        </div>
        <details class="extras-help">
          <summary>Was bedeutet k?</summary>
          <p>Die KI vergleicht eine neue Aufnahme mit allen gespeicherten Beispielen
          und sucht die <strong>k ähnlichsten</strong> heraus. Diese k Beispiele
          „stimmen ab": Aus welcher Klasse die meisten stammen, die gewinnt.
          Beispiel mit k&nbsp;=&nbsp;3: Sind die 3 ähnlichsten Beispiele 2× „Stift"
          und 1× „Radiergummi", sagt die KI „Stift".
          Probiere aus: kleines k reagiert empfindlich auf Ausreißer,
          großes k macht träge Mehrheitsentscheidungen.</p>
        </details>
        <div class="nn-info" id="${this.id}-nn-info" hidden></div>
        <button type="button" class="btn-eval" id="${this.id}-eval-btn">🧪 Modell testen</button>
        <details class="extras-help">
          <summary>Wie funktioniert der Test?</summary>
          <p>Wie eine Klassenarbeit: Die KI übt mit <strong>80&nbsp;%</strong> deiner
          Proben und wird dann mit den restlichen <strong>20&nbsp;%</strong> geprüft –
          Proben, die sie beim Üben <em>nicht</em> gesehen hat. Nur so erkennst du,
          ob sie wirklich gelernt hat oder nur auswendig kann. Das Ergebnis zeigt
          die Genauigkeit und eine Tabelle, welche Klassen verwechselt wurden.</p>
        </details>
        <div class="eval-result" id="${this.id}-eval-result"></div>
        <button type="button" class="btn-reset-mod" id="${this.id}-reset-btn">🗑 Modul zurücksetzen</button>
        <span class="sr-only" aria-live="polite" id="${this.id}-sr-winner"></span>
      </div>`);
    document.getElementById(`${this.id}-k-slider`).addEventListener('input', e => {
      this.k = Number(e.target.value);
      document.getElementById(`${this.id}-k-val`).textContent = this.k;
      this._speichere();
    });
    document.getElementById(`${this.id}-eval-btn`).addEventListener('click', () => this.teste());
    document.getElementById(`${this.id}-reset-btn`).addEventListener('click', () => this.setzeZurueck());
  }

  /** Modul komplett zurücksetzen – für den Gerätewechsel im Klassensatz */
  async setzeZurueck() {
    if (!confirm('Wirklich alle Klassen, Proben und das Training dieses Moduls löschen?')) return;
    this.stoppeLive();
    this.stoppeAufnahme();
    this.klassen    = this._startKlassen.map((name, i) => this._neueKlasse(i, name));
    this._naechsteId    = this._startKlassen.length;
    this.k          = 3;
    this.trainiert    = false;
    this._trainingsMerkmale = null;
    this.knn.clearAllClasses();
    await speicherLoesche(this.id);
    const kRegler = document.getElementById(`${this.id}-k-slider`);
    if (kRegler) { kRegler.value = 3; document.getElementById(`${this.id}-k-val`).textContent = '3'; }
    const testAusgabe = document.getElementById(`${this.id}-eval-result`);
    if (testAusgabe) testAusgabe.innerHTML = '';
    const nachbarnKasten = document.getElementById(`${this.id}-nn-info`);
    if (nachbarnKasten) { nachbarnKasten.hidden = true; nachbarnKasten.innerHTML = ''; }
    this._schalteModellKnoepfe(false);
    this._zeigeKlassen();
    this._aktualisiereTrainierKnopf();
    melde('🗑 Modul zurückgesetzt.');
  }

  // ── Autosave (IndexedDB, lokal auf dem Gerät) ─────────
  _speichere() {
    clearTimeout(this._speicherTimer);
    this._speicherTimer = setTimeout(() => {
      const paket = {
        v: 1,
        k: this.k,
        nextId: this._naechsteId,
        classes: this.klassen.map(c => ({ id: c.id, name: c.name, samples: this._probenSpeichern ? c.samples : [] })),
        extra: this._speichereZusatz?.() ?? null,   // modulspezifisch (z. B. Merkmalsnamen)
      };
      speicherSchreibe(this.id, paket);
    }, 800);
  }

  async _stelleWiederHer() {
    try {
      const gespeichert = await speicherLies(this.id);
      if (!Array.isArray(gespeichert?.classes) || !gespeichert.classes.length) return;
      // Gespeichertes prüfen wie fremde Daten: nur bekannte Felder, begrenzte Anzahl
      const klassen = gespeichert.classes.slice(0, MAX_KLASSEN)
        .filter(c => c && Number.isInteger(c.id) && typeof c.name === 'string')
        .map(c => ({ id: c.id, name: c.name.slice(0, 40), samples: this._probenSpeichern && Array.isArray(c.samples) ? c.samples : [] }));
      if (klassen.length < 1) return;
      this.klassen = klassen;
      this._naechsteId = Math.max(Number.isInteger(gespeichert.nextId) ? gespeichert.nextId : 0, ...klassen.map(c => c.id + 1));
      this.k       = Number.isInteger(gespeichert.k) && gespeichert.k >= 1 && gespeichert.k <= 9 ? gespeichert.k : 3;
      this._stelleZusatzWiederHer?.(gespeichert.extra);
      const gesamt = klassen.reduce((n, c) => n + c.samples.length, 0);
      if (gesamt) melde(`💾 ${gesamt} gespeicherte Proben geladen – zum Erkennen erneut trainieren.`);
    } catch (fehler) {
      console.warn(`[${this.id}] Restore fehlgeschlagen:`, fehler);
    }
  }

  // ── Modell-Datei ──────────────────────────────────────
  async ladeHerunter() {
    if (!this.trainiert) { melde('⚠️ Erst trainieren!'); return; }
    try {
      const daten = await verpackeKnn(this.knn, this.klassen, this.id);
      if (!daten) { melde('⚠️ Keine Daten vorhanden.'); return; }
      ladeJsonHerunter(daten, `ki-trainer-${this.id}-${Date.now()}.json`);
      melde('✅ Modell heruntergeladen!');
    } catch (fehler) {
      console.error(`[${this.id}] Download error:`, fehler);
      melde('❌ Download fehlgeschlagen.');
    }
  }

  /** Ein heruntergeladenes Modell wieder laden (Datei aus „Modell herunterladen“ desselben Moduls) */
  async ladeModell(datei) {
    try {
      if (datei.size > 60 * 1024 * 1024) throw new Error('Die Datei ist zu groß.');
      const daten = JSON.parse(await datei.text());
      if (!daten || daten.version !== '2.0' || daten.type !== this.id) {
        throw new Error('Das ist keine Modell-Datei dieses Moduls.');
      }
      const klassen = Array.isArray(daten.classes) ? daten.classes.slice(0, MAX_KLASSEN) : [];
      const datensatz = Array.isArray(daten.dataset) ? daten.dataset : [];
      const gueltig = klassen.length >= 2
        && klassen.every(c => c && Number.isInteger(c.id) && typeof c.name === 'string')
        && datensatz.length >= 2
        && datensatz.every(d => d && klassen.some(c => c.id === d.classId)
          && Array.isArray(d.shape) && d.shape.length === 2 && d.shape.every(n => Number.isInteger(n) && n > 0)
          && Array.isArray(d.data) && d.data.length === d.shape[0] * d.shape[1]
          && d.data.every(v => typeof v === 'number' && Number.isFinite(v)))
        && datensatz.every(d => d.shape[1] === datensatz[0].shape[1]);
      if (!gueltig) throw new Error('Die Modell-Datei ist unvollständig oder beschädigt.');
      this._pruefeGeladenesModell?.(daten);                 // modulspezifisch (z. B. Anzahl der Merkmale)

      this.stoppeLive();
      this.knn.clearAllClasses();
      this.knn.setClassifierDataset(Object.fromEntries(datensatz.map(d => [d.classId, tf.tensor2d(d.data, d.shape)])));
      this.klassen    = klassen.map(c => ({ id: c.id, name: c.name.slice(0, 40), samples: [] }));
      this._naechsteId    = Math.max(...klassen.map(c => c.id)) + 1;
      this._trainingsMerkmale = null;
      this._zeigeKlassen();
      this._aktualisiereTrainierKnopf();
      this._nachTraining();
      this._speichere();
      melde('✅ Modell geladen – die Proben selbst sind in der Datei nicht enthalten.');
    } catch (fehler) {
      console.warn(`[${this.id}] Modell laden:`, fehler);
      melde(`❌ ${fehler instanceof SyntaxError ? 'Die Datei ist keine gültige Modell-Datei.' : fehler.message}`);
    }
  }

  // ── Anzeige ────────────────────────────────────────
  _zeigeKlassen() {
    const behaelter = document.getElementById(`${this.id}-class-list`);
    behaelter.innerHTML = '';
    this.klassen.forEach((klasse, index) => {
      const farbe = KLASSEN_FARBEN[index % KLASSEN_FARBEN.length];
      const karte  = document.createElement('div');
      karte.className       = 'cls-card';
      karte.dataset.classId = klasse.id;

      // Header
      const kopf    = document.createElement('div');
      kopf.className = 'cls-hd';

      const streifen = document.createElement('div');
      streifen.className = 'cls-stripe';
      streifen.style.background = farbe;

      const namensFeld = document.createElement('input');
      namensFeld.className = 'cls-name';
      namensFeld.type      = 'text';
      namensFeld.value     = klasse.name;
      namensFeld.maxLength = 40;
      namensFeld.setAttribute('aria-label', 'Klassenname');
      namensFeld.addEventListener('change', () => this.benenneKlasseUm(klasse.id, namensFeld.value));

      const anzahl = document.createElement('span');
      anzahl.className = 'cls-count';
      anzahl.id        = `${this.id}-cnt-${klasse.id}`;
      anzahl.textContent = `${klasse.samples.length} Proben`;

      kopf.append(streifen, namensFeld, anzahl);

      if (this.klassen.length > 2) {
        const loeschKnopf = document.createElement('button');
        loeschKnopf.type        = 'button';
        loeschKnopf.className   = 'cls-del';
        loeschKnopf.textContent = '✕';
        loeschKnopf.title       = 'Klasse löschen';
        loeschKnopf.setAttribute('aria-label', `Klasse „${entschaerfeHtml(klasse.name)}" löschen`);
        loeschKnopf.addEventListener('click', () => this.loescheKlasse(klasse.id));
        kopf.appendChild(loeschKnopf);
      }

      // Actions
      const aktionen      = document.createElement('div');
      aktionen.className  = 'cls-act';
      const halteKnopf  = document.createElement('button');
      halteKnopf.type      = 'button';
      halteKnopf.className = 'btn-hold';
      halteKnopf.style.cssText = `background:${farbe}15;color:${farbe};border:1px solid ${farbe}40`;
      halteKnopf.textContent   = this._aufnahmeText;
      halteKnopf.title = 'Gedrückt halten – per Maus, Touch oder Leertaste';
      halteKnopf.addEventListener('pointerdown', () => this.starteAufnahme(klasse.id));
      halteKnopf.addEventListener('pointerup',   () => this.stoppeAufnahme());
      halteKnopf.addEventListener('pointerleave',() => this.stoppeAufnahme());
      // Touch-Geräte: Abbruch durch Scrollen/System beendet die Aufnahme,
      // Langdruck darf kein Kontextmenü öffnen
      halteKnopf.addEventListener('pointercancel', () => this.stoppeAufnahme());
      halteKnopf.addEventListener('contextmenu', e => e.preventDefault());
      // Barrierefreiheit: Aufnahme auch per Tastatur (Leertaste/Enter halten)
      halteKnopf.addEventListener('keydown', e => {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
          e.preventDefault();
          this.starteAufnahme(klasse.id);
        }
      });
      halteKnopf.addEventListener('keyup', e => {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); this.stoppeAufnahme(); }
      });
      halteKnopf.addEventListener('blur', () => this.stoppeAufnahme());

      const leerenKnopf = document.createElement('button');
      leerenKnopf.type        = 'button';
      leerenKnopf.className   = 'btn-clear-cls';
      leerenKnopf.textContent = '🗑';
      leerenKnopf.title       = 'Alle Proben löschen';
      leerenKnopf.setAttribute('aria-label', `Proben von „${entschaerfeHtml(klasse.name)}" löschen`);
      leerenKnopf.addEventListener('click', () => this.leereKlasse(klasse.id));

      // Knopf zum Hochladen (nur bei Modulen mit Bildern)
      const hochladeKnopf = document.createElement('button');
      hochladeKnopf.type      = 'button';
      hochladeKnopf.className = 'btn-upload-cls';
      hochladeKnopf.textContent = '📁 Bilder laden';
      hochladeKnopf.title     = 'Bilder von Gerät hinzufügen';
      const dateiEingabe = document.createElement('input');
      dateiEingabe.type     = 'file';
      dateiEingabe.accept   = 'image/*';
      dateiEingabe.multiple = true;
      dateiEingabe.style.display = 'none';
      dateiEingabe.addEventListener('change', () => this._verarbeiteUpload(klasse.id, dateiEingabe));
      hochladeKnopf.addEventListener('click', () => dateiEingabe.click());

      aktionen.append(halteKnopf, hochladeKnopf, leerenKnopf, dateiEingabe);

      // Thumbs
      const vorschauen = document.createElement('div');
      vorschauen.className = 'cls-thumbs';
      vorschauen.id        = `${this.id}-thumbs-${klasse.id}`;

      karte.append(kopf, aktionen, vorschauen);
      behaelter.appendChild(karte);
      this._zeigeVorschauen(klasse);
    });
    this._aktualisiereTrainierKnopf();
  }

  _zeigeVorschauen(klasse) {
    const behaelter = document.getElementById(`${this.id}-thumbs-${klasse.id}`);
    const zaehler   = document.getElementById(`${this.id}-cnt-${klasse.id}`);
    if (!behaelter) return;
    behaelter.innerHTML = '';
    // Show last THUMB_LIMIT thumbs, but track real sample index
    const versatz = Math.max(0, klasse.samples.length - VORSCHAU_GRENZE);
    klasse.samples.slice(-VORSCHAU_GRENZE).forEach((quelle, i) => {
      const echterIndex = versatz + i;
      const huelle = document.createElement('div');
      huelle.className = 'cls-thumb-wrap';

      const bild = document.createElement('img');
      bild.className = 'cls-thumb';
      bild.alt       = `Probe ${echterIndex + 1}`;
      bild.src       = typeof quelle === 'string' ? quelle : this._probeZuVorschau(quelle);

      const entfernenKnopf = document.createElement('button');
      entfernenKnopf.type      = 'button';
      entfernenKnopf.className = 'cls-thumb-del';
      entfernenKnopf.title     = 'Bild entfernen';
      entfernenKnopf.textContent = '✕';
      entfernenKnopf.addEventListener('click', () => this.entferneProbe(klasse.id, echterIndex));

      huelle.append(bild, entfernenKnopf);
      behaelter.appendChild(huelle);
    });
    if (zaehler) zaehler.textContent = `${klasse.samples.length} Proben`;
  }

  /** Eine einzelne Probe entfernen */
  entferneProbe(klassenId, probenIndex) {
    const klasse = this._klasse(klassenId);
    if (!klasse) return;
    klasse.samples.splice(probenIndex, 1);
    this.trainiert = false;
    this._zeigeVorschauen(klasse);
    this._aktualisiereTrainierKnopf();
  }

  /** Hochgeladene Bilder übernehmen (Module ohne Bilder überschreiben das mit einer leeren Methode) */
  async _verarbeiteUpload(klassenId, eingabeFeld) {
    const klasse = this._klasse(klassenId);
    if (!klasse || !eingabeFeld.files?.length) return;
    const dateien = Array.from(eingabeFeld.files);
    eingabeFeld.value = '';  // reset so same file can be re-selected
    let hinzugefuegt = 0;
    for (const datei of dateien) {
      if (!datei.type.startsWith('image/')) continue;
      const quelle = await new Promise((res, rej) => {
        const leser = new FileReader();
        leser.onload  = e => res(e.target.result);
        leser.onerror = () => rej(new Error('Lesefehler'));
        leser.readAsDataURL(datei);
      });
      klasse.samples.push(quelle);
      hinzugefuegt++;
    }
    if (hinzugefuegt > 0) {
      this.trainiert = false;
      this._zeigeVorschauen(klasse);
      this._aktualisiereTrainierKnopf();
      this._speichere();
      melde(`📁 ${hinzugefuegt} Bild${hinzugefuegt > 1 ? 'er' : ''} hinzugefügt`);
    }
  }

  /** Überschrieben, wenn Proben Bilder sind: liefert die Adresse für das Vorschaubild */
  _probeZuVorschau(_probe) { return ''; }

  _baueErgebnisZeilen() {
    const behaelter = document.getElementById(`${this.id}-preds`);
    behaelter.innerHTML = '';
    this.klassen.forEach((klasse, i) => {
      const farbe = KLASSEN_FARBEN[i % KLASSEN_FARBEN.length];
      const zeile   = document.createElement('div');
      zeile.className = 'pred-row';
      zeile.id        = `pred-row-${this.id}-${klasse.id}`;
      zeile.innerHTML = `
        <div class="pred-label">${entschaerfeHtml(klasse.name)}</div>
        <div class="pred-track">
          <div class="pred-fill" id="pred-fill-${this.id}-${klasse.id}" style="width:0%;background:${farbe}"></div>
        </div>
        <div class="pred-pct" id="pred-pct-${this.id}-${klasse.id}">0%</div>
      `;
      behaelter.appendChild(zeile);
    });
  }

  _aktualisiereTrainierKnopf() {
    const knopf = document.getElementById(`${this.id}-train-btn`);
    if (knopf) knopf.disabled = !this._kannTrainieren;
    const info = document.getElementById(`${this.id}-train-info`);
    if (info) {
      const gesamt = this.klassen.reduce((s, c) => s + c.samples.length, 0);
      // textContent setzt reinen Text – entschaerfeHtml ist hier nicht nötig
      info.textContent = gesamt > 0
        ? `${gesamt} Proben: ` + this.klassen.map(c => `${c.name} (${c.samples.length})`).join(', ')
        : 'Noch kein Training.';
    }
  }

  /** Beschriftung des Aufnahmeknopfs – je Modul überschrieben */
  get _aufnahmeText() { return '📸 Gedrückt halten'; }

  // ── Verlassen des Moduls: aufräumen ──────────────
  /** Von zurStartseite() aufgerufen. Überschrieben, um Kamera, Mikrofon und Schleifen zu stoppen. */
  raeumeAuf() {
    this.stoppeLive();
    this.stoppeAufnahme();
  }

  // ── Info-Bereich „So nutzt du das Modell“ ───────────────────────────────────
  schalteInfo() {
    const bereich  = document.getElementById(`${this.id}-usage`);
    const knopf    = document.getElementById(`${this.id}-info-btn`);
    const istOffen = bereich.classList.toggle('is-open');
    if (knopf) knopf.setAttribute('aria-expanded', String(istOffen));
  }

  wechsleReiter(reiterName) {
    const bereich = document.getElementById(`${this.id}-usage`);
    bereich.querySelectorAll('.usage-tab').forEach(t => {
      t.classList.toggle('is-active', t.dataset.tab === reiterName);
    });
    bereich.querySelectorAll('.usage-pane').forEach(p => {
      p.classList.toggle('is-active', p.dataset.pane === reiterName);
    });
  }
}

// ── Gemeinsame Kamera-Hilfe ──────────────────────────
/** Wartet auf die Maße des Videobilds – mit Zeitgrenze und Fehlerbehandlung.
 *  Robust gegenüber Safari/iOS: dort feuert `loadedmetadata` bei MediaStreams
 *  teils erst nach explizitem play() – autoplay allein reicht nicht immer.
 *  Deshalb: play() aktiv anstoßen, auf mehrere Ready-Events hören und
 *  zusätzlich per Polling auf readyState/videoWidth prüfen. */
function warteAufVideo(video, wartezeitMs = 8000) {
  return new Promise((resolve, reject) => {
    const istBereit = () => video.readyState >= 1 || video.videoWidth > 0;
    if (istBereit()) {
      video.play().catch(() => {}); // sicherstellen, dass das Bild auch läuft
      resolve();
      return;
    }
    const EREIGNISSE = ['loadedmetadata', 'loadeddata', 'canplay', 'playing', 'resize'];
    let timer = null, frageNach = null;
    const aufraeumen = () => {
      clearTimeout(timer);
      clearInterval(frageNach);
      EREIGNISSE.forEach(ereignis => video.removeEventListener(ereignis, beiBereit));
      video.removeEventListener('error', beiFehler);
    };
    const beiBereit = () => { aufraeumen(); resolve(); };
    const beiFehler = () => { aufraeumen(); reject(new Error('Kamera-Fehler')); };
    EREIGNISSE.forEach(ereignis => video.addEventListener(ereignis, beiBereit));
    video.addEventListener('error', beiFehler);
    // Fallback-Polling: falls ein Browser die Events nicht zuverlässig feuert
    frageNach  = setInterval(() => { if (istBereit()) beiBereit(); }, 150);
    timer = setTimeout(() => {
      aufraeumen();
      reject(new Error('Kamera-Timeout: Kein Signal nach 8 s'));
    }, wartezeitMs);
    // Wiedergabe explizit starten (iOS/Safari); Fehler hier sind unkritisch,
    // da das muted-Video vom Polling weiterhin erkannt wird.
    video.play().catch(() => {});
  });
}
