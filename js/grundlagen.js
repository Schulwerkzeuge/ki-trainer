// SPDX-License-Identifier: Apache-2.0 · © 2026 St.-Antonius-Gymnasium Lüdinghausen
// KI-Trainer – Konstanten, Hilfsfunktionen, Speicher, Kamera, MobileNet, Export
'use strict';

// ═══════════════════════════════════════════════════════
//  FESTWERTE
// ═══════════════════════════════════════════════════════
const KLASSEN_FARBEN  = ['#4f6ef7', '#f43f5e', '#22c55e', '#f59e0b'];
const MAX_KLASSEN   = 4;
const MIN_PROBEN   = 5;
const VORSCHAU_GRENZE   = 12;

const POSE_VERBINDUNGEN = [
  [0,1],[0,2],[1,3],[2,4],[5,6],[5,7],[7,9],[6,8],[8,10],
  [5,11],[6,12],[11,12],[11,13],[13,15],[12,14],[14,16]
];

// ═══════════════════════════════════════════════════════
//  HILFSFUNKTIONEN
// ═══════════════════════════════════════════════════════

/** Nutzereingaben entschärfen, bevor sie in HTML eingesetzt werden */
function entschaerfeHtml(zeichenkette) {
  return String(zeichenkette)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Show a non-blocking toast notification */
let meldeTimer = null;
function melde(meldung) {
  const el = document.getElementById('toast');
  el.textContent = meldung;
  el.classList.add('is-visible');
  clearTimeout(meldeTimer);
  meldeTimer = setTimeout(() => el.classList.remove('is-visible'), 3000);
}

/** Statuspunkt und Statustext eines Moduls setzen */
function setzeStatus(modulId, zustand, meldung) {
  const fleck  = document.getElementById(`dot-${modulId}`);
  const text = document.getElementById(`status-${modulId}`);
  if (fleck) fleck.className = `dot${zustand === 'on' ? ' is-on' : zustand === 'loading' ? ' is-loading' : ''}`;
  if (text && meldung) text.textContent = meldung;
}

/** Text in die Zwischenablage kopieren */
async function kopiereInZwischenablage(text) {
  try {
    await navigator.clipboard.writeText(text);
    melde('✅ Code kopiert!');
  } catch {
    melde('⚠️ Kopieren fehlgeschlagen.');
  }
}

/** CSS-Variable als konkreten Farbwert auflösen (Canvas versteht kein var(--…)) */
function cssWert(name, ersatz) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || ersatz;
}

/* ── IndexedDB-Mini-Wrapper für den Autosave ──────────────
   Gespeichert werden Klassennamen, Einstellungen und Proben aus Zahlenwerten
   (Ton, Pose, Mimik, Daten) – nie Kamerabilder oder Zeichnungen. Alles bleibt
   auf dem Gerät. Fehler werden geschluckt: Autosave ist Komfort, keine Pflicht. */
const SPEICHER_NAME = 'ki-trainer';
// Bis Version 1.4 lagen im Speicher „aki-store“ auch Kamerabilder. Er wird beim ersten Start entfernt.
try { indexedDB.deleteDatabase('aki-store'); } catch (_) { /* ohne Folgen */ }

function speicherOeffne() {
  return new Promise((resolve, reject) => {
    const anfrage = indexedDB.open(SPEICHER_NAME, 1);
    anfrage.onupgradeneeded = () => anfrage.result.createObjectStore('modules');
    anfrage.onsuccess = () => resolve(anfrage.result);
    anfrage.onerror   = () => reject(anfrage.error);
  });
}
async function speicherSchreibe(schluessel, wert) {
  try {
    const db = await speicherOeffne();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('modules', 'readwrite');
      tx.objectStore('modules').put(wert, schluessel);
      tx.oncomplete = resolve;
      tx.onerror    = () => reject(tx.error);
    });
    db.close();
  } catch (_) { /* Autosave optional */ }
}
async function speicherLies(schluessel) {
  try {
    const db = await speicherOeffne();
    const wert = await new Promise(resolve => {
      const anfrage = db.transaction('modules').objectStore('modules').get(schluessel);
      anfrage.onsuccess = () => resolve(anfrage.result);
      anfrage.onerror   = () => resolve(null);
    });
    db.close();
    return wert;
  } catch (_) { return null; }
}
async function speicherLoesche(schluessel) {
  try {
    const db = await speicherOeffne();
    await new Promise(resolve => {
      const tx = db.transaction('modules', 'readwrite');
      tx.objectStore('modules').delete(schluessel);
      tx.oncomplete = resolve;
      tx.onerror    = resolve;
    });
    db.close();
  } catch (_) { /* ignorieren */ }
}

/** Video-Constraints: bevorzugt eine konkret gewählte Kamera (deviceId),
 *  sonst die grobe Richtung (facingMode). */
function videoVorgaben(modul) {
  const grundwert = { width: { ideal: 640 }, height: { ideal: 480 } };
  return modul._deviceId
    ? { deviceId: { exact: modul._deviceId }, ...grundwert }
    : { facingMode: modul._kameraRichtung, ...grundwert };
}


/** Ladezustand des "Kamera starten"-Buttons im Overlay umschalten –
 *  verhindert wildes Weiterklicken, während Stream/Modell laden. */
function zeigeKameraLaedt(knopfId, laedt) {
  const knopf = document.getElementById(knopfId);
  if (!knopf) return;
  if (laedt) {
    knopf.dataset.label = knopf.dataset.label || knopf.textContent;
    knopf.disabled = true;
    knopf.textContent = '⏳ Kamera startet…';
  } else {
    knopf.disabled = false;
    if (knopf.dataset.label) knopf.textContent = knopf.dataset.label;
  }
}

/** Kamera wechseln: zyklisch durch ALLE Videogeräte (Laptops haben oft
 *  mehrere Kameras, wo der reine Front/Rück-Flip ins Leere greift). */
async function naechsteKamera(modul) {
  try {
    const geraete = (await navigator.mediaDevices.enumerateDevices())
      .filter(d => d.kind === 'videoinput');
    if (geraete.length <= 1) { melde('ℹ️ Nur eine Kamera gefunden.'); return; }
    const aktuelleId = modul._kameraStrom?.getVideoTracks()[0]?.getSettings().deviceId;
    const index  = Math.max(0, geraete.findIndex(d => d.deviceId === aktuelleId));
    const naechstes = geraete[(index + 1) % geraete.length];
    modul._deviceId = naechstes.deviceId;
    // Spiegel-Logik grob aus dem Gerätenamen ableiten (Rückkamera nicht spiegeln)
    modul._kameraRichtung = /back|rear|rück|environment/i.test(naechstes.label) ? 'environment' : 'user';
    await modul.starteKamera();
    if (naechstes.label) melde(`📷 ${naechstes.label}`);
  } catch (fehler) {
    console.warn('Kamerawechsel fehlgeschlagen:', fehler);
    modul._deviceId = null; // zurück auf facingMode-Modus
    melde('⚠️ Kamerawechsel fehlgeschlagen.');
  }
}

// ═══════════════════════════════════════════════════════
//  KONFIGURATION: Modell-Hosting
// ═══════════════════════════════════════════════════════
// Die Modelle liegen im Ordner models/ und werden vom eigenen Server geladen –
// zur Laufzeit geht keine Anfrage an Google, TF-Hub oder Kaggle. Woher die
// Dateien stammen, steht in der Datei NOTICE.
// Hinweis: null führt bewusst zu einer Fehlermeldung im jeweiligen Modul.
const MOBILENET_ADRESSE        = './models/mobilenet/model.json';
const MOVENET_ADRESSE          = './models/movenet/model.json';
const GESICHTSFINDER_ADRESSE    = './models/face-detector/model.json';
const GESICHTSNETZ_ADRESSE        = './models/face-mesh/model.json';

// ═══════════════════════════════════════════════════════
//  GEMEINSAM: MOBILENET (wird nur einmal geladen)
// ═══════════════════════════════════════════════════════
let _mobileNet        = null;
let _mobileNetVersprechen = null;

async function holeMobileNet() {
  if (_mobileNet) return _mobileNet;
  if (!_mobileNetVersprechen) {
    if (!MOBILENET_ADRESSE) {
      throw new Error('LOCAL_MOBILENET_URL nicht gesetzt – das Modell muss im Ordner models/ liegen.');
    }
    const ladeOptionen = { version: 2, alpha: 0.5, modelUrl: MOBILENET_ADRESSE };
    _mobileNetVersprechen = tf.ready()
      .then(() => mobilenet.load(ladeOptionen))
      .then(modell => { _mobileNet = modell; return modell; });
  }
  return _mobileNetVersprechen;
}

/** Merkmale eines Bildes mit MobileNet berechnen; liefert einen Tensor */
async function berechneMerkmale(ursprung) {
  const netz = await holeMobileNet();
  return tf.tidy(() => netz.infer(tf.browser.fromPixels(ursprung), true));
}

// ═══════════════════════════════════════════════════════
//  GEMEINSAM: MODELL-DATEI
// ═══════════════════════════════════════════════════════
async function verpackeKnn(knn, klassen, art, meta = {}) {
  const datensatz = knn.getClassifierDataset();
  if (!datensatz || Object.keys(datensatz).length === 0) return null;

  const verpackt = await Promise.all(
    Object.entries(datensatz).map(async ([klassenId, tensor]) => ({
      classId: parseInt(klassenId, 10),
      data:    Array.from(await tensor.data()),
      shape:   tensor.shape,
    }))
  );

  return {
    version:  '2.0',
    type: art,
    created:  new Date().toISOString(),
    classes:  klassen.map(c => ({ id: c.id, name: c.name })),
    dataset:  verpackt,
    meta: {
      totalSamples: verpackt.reduce((s, d) => s + d.shape[0], 0),
      featureSize:  verpackt[0]?.shape[1] ?? null,
      ...meta,
    },
  };
}

function ladeJsonHerunter(daten, dateiname) {
  const blob = new Blob([JSON.stringify(daten, null, 2)], { type: 'application/json' });
  const adresse  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: adresse, download: dateiname });
  a.click();
  URL.revokeObjectURL(adresse);
}

/** Kennung der Klasse mit der höchsten Sicherheit */
function siegerId(sicherheiten) {
  return Object.entries(sicherheiten)
    .reduce((bester, [id, v]) => v > bester.v ? { id: parseInt(id, 10), v } : bester,
            { id: null, v: -1 }).id;
}

// ═══════════════════════════════════════════════════════
//  HILFE: Bild aus einer data:-Adresse laden
// ═══════════════════════════════════════════════════════
function ladeBild(quelle) {
  return new Promise((resolve, reject) => {
    const bild = new Image();
    bild.onload  = () => resolve(bild);
    bild.onerror = reject;
    bild.src     = quelle;
  });
}
