// SPDX-License-Identifier: Apache-2.0 · © 2026 St.-Antonius-Gymnasium Lüdinghausen
// KI-Trainer – Module anlegen, Navigation, Bedienelemente, Design
'use strict';

const module = {
  img:   new BildModul(),
  audio: new TonModul(),
  pose:  new PoseModul(),
  draw:  new ZeichenModul(),
  face:  new MimikModul(),
  data:  new DatenModul(),
};

function zeigeSeite(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('is-active'));
  document.getElementById(id).classList.add('is-active');
}

function oeffneModul(modulId) {
  zeigeSeite(`mod-${modulId}`);
  module[modulId]?.starte(); // die Info-Seite hat kein Modul-Objekt – ?. überspringt sie
}

function zurStartseite() {
  Object.values(module).forEach(m => m.raeumeAuf());
  zeigeSeite('home');
}

// ── Navigation verdrahten ────────────────────────────────
document.querySelectorAll('[data-open]').forEach(el => {
  if (el.classList.contains('is-idea')) return;
  el.addEventListener('click', () => oeffneModul(el.dataset.open));
  // Tastaturbedienung: Eingabe- oder Leertaste öffnet die Karte
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      oeffneModul(el.dataset.open);
    }
  });
});
document.querySelectorAll('[data-go-home]').forEach(el => {
  el.addEventListener('click', zurStartseite);
});

// ── Reiter der Info-Seite ──────────────────────────
document.querySelectorAll('.info-tab').forEach(reiter => {
  reiter.addEventListener('click', () => {
    const name = reiter.dataset.infoTab;
    document.querySelectorAll('.info-tab').forEach(t => {
      t.classList.toggle('is-active', t.dataset.infoTab === name);
      t.setAttribute('aria-selected', String(t.dataset.infoTab === name));
    });
    document.querySelectorAll('.info-pane').forEach(p => {
      p.classList.toggle('is-active', p.id === `info-pane-${name}`);
    });
  });
});

// ── Unterreiter „Für Fortgeschrittene“ ─────────────────────────
document.querySelectorAll('.adv-subtab').forEach(reiter => {
  reiter.addEventListener('click', () => {
    const name = reiter.dataset.advTab;
    document.querySelectorAll('.adv-subtab').forEach(t => {
      t.classList.toggle('is-active', t.dataset.advTab === name);
    });
    document.querySelectorAll('.adv-pane').forEach(p => {
      p.classList.toggle('is-active', p.id === `adv-pane-${name}`);
    });
  });
});

// ── Hilfe-Bereiche ───────────────────────────────
['img', 'audio', 'pose', 'draw'].forEach(modul => {
  const knopf   = document.getElementById(`help-btn-${modul}`);
  const bereich = document.getElementById(`help-panel-${modul}`);
  if (knopf && bereich) {
    knopf.addEventListener('click', () => {
      const geoeffnet = bereich.classList.toggle('is-open');
      knopf.setAttribute('aria-expanded', String(geoeffnet));
    });
  }
});

// ── OSS badge opens info/license tab ──────────────
document.querySelector('[data-info-tab-preset="license"]')?.addEventListener('click', e => {
  e.preventDefault();
  oeffneModul('info');
  // After opening, activate license tab
  setTimeout(() => {
    const lizenzReiter = document.querySelector('[data-info-tab="license"]');
    if (lizenzReiter) lizenzReiter.click();
  }, 50);
});

// ── Knöpfe der Module ──────────────────
function verdrahteKnopf(id, behandler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', behandler);
}

// Image module
verdrahteKnopf('img-cam-btn',         () => module.img.starteKamera());
verdrahteKnopf('img-flip-btn',        () => module.img.wechsleKamera());
verdrahteKnopf('img-mirror-btn',      () => module.img.schalteSpiegelung());
verdrahteKnopf('img-capture-all-btn', () => module.img.nimmAlleAuf());
verdrahteKnopf('img-add-class-btn',   () => module.img.neueKlasse());
verdrahteKnopf('img-train-btn',       () => module.img.trainiere());
verdrahteKnopf('img-live-btn',        () => module.img.schalteLive());
verdrahteKnopf('img-dl-btn',          () => module.img.ladeHerunter());
verdrahteKnopf('img-info-btn',        () => module.img.schalteInfo());

// Audio module
verdrahteKnopf('audio-mic-btn',       () => module.audio.starteMikrofon());
verdrahteKnopf('audio-add-class-btn', () => module.audio.neueKlasse());
verdrahteKnopf('audio-train-btn',     () => module.audio.trainiere());
verdrahteKnopf('audio-live-btn',      () => module.audio.schalteLive());
verdrahteKnopf('audio-dl-btn',        () => module.audio.ladeHerunter());
verdrahteKnopf('audio-info-btn',      () => module.audio.schalteInfo());

// Pose module
verdrahteKnopf('pose-cam-btn',        () => module.pose.starteKamera());
verdrahteKnopf('pose-flip-btn',       () => module.pose.wechsleKamera());
verdrahteKnopf('pose-add-class-btn',  () => module.pose.neueKlasse());
verdrahteKnopf('pose-train-btn',      () => module.pose.trainiere());
verdrahteKnopf('pose-live-btn',       () => module.pose.schalteLive());
verdrahteKnopf('pose-dl-btn',         () => module.pose.ladeHerunter());
verdrahteKnopf('pose-info-btn',       () => module.pose.schalteInfo());

// Draw module
verdrahteKnopf('draw-clear-btn',      () => module.draw.leereZeichenflaeche());
verdrahteKnopf('draw-undo-btn',       () => module.draw.rueckgaengig());
verdrahteKnopf('draw-add-class-btn',  () => module.draw.neueKlasse());
verdrahteKnopf('draw-train-btn',      () => module.draw.trainiere());
verdrahteKnopf('draw-live-btn',       () => module.draw.schalteLive());
verdrahteKnopf('draw-dl-btn',         () => module.draw.ladeHerunter());
verdrahteKnopf('draw-info-btn',       () => module.draw.schalteInfo());

// ── Mimik-Modul ──────────────────────────────
verdrahteKnopf('face-cam-btn',        () => module.face.starteKamera());
verdrahteKnopf('face-flip-btn',       () => module.face.wechsleKamera());
verdrahteKnopf('face-mirror-btn',     () => module.face.schalteSpiegelung());
verdrahteKnopf('face-add-class-btn',  () => module.face.neueKlasse());
verdrahteKnopf('face-train-btn',      () => module.face.trainiere());
verdrahteKnopf('face-live-btn',       () => module.face.schalteLive());
verdrahteKnopf('face-dl-btn',         () => module.face.ladeHerunter());

// Face tab switching
document.querySelectorAll('.face-tab').forEach(knopf => {
  knopf.addEventListener('click', () => module.face.wechsleReiter(knopf.dataset.faceTab));
});

// Face model upload
document.getElementById('face-upload-model')?.addEventListener('change', function() {
  if (this.files[0]) module.face.ladeModell(this.files[0]);
});

// ── Daten-Modul ──────────────────────────────
verdrahteKnopf('data-load-btn',       () => module.data.ladePinguine());
verdrahteKnopf('data-add-feature-btn',() => module.data.neuesMerkmal());
verdrahteKnopf('data-add-class-btn',  () => module.data.neueKlasse());
verdrahteKnopf('data-train-btn',      () => module.data.trainiere());
verdrahteKnopf('data-predict-btn',    () => module.data.klassifiziereEingabe());
verdrahteKnopf('data-dl-btn',         () => module.data.ladeHerunter());
verdrahteKnopf('data-csv-confirm-btn',() => module.data.uebernimmCsv());

// CSV file upload
document.getElementById('data-csv-input')?.addEventListener('change', function() {
  if (this.files[0]) module.data.ladeCsv(this.files[0]);
});

// Data model upload
document.getElementById('data-upload-model')?.addEventListener('change', function() {
  if (this.files[0]) module.data.ladeModell(this.files[0]);
});

// Hilfe-Bereiche von Mimik und Zahlendaten
['face', 'data'].forEach(modul => {
  const knopf   = document.getElementById(`help-btn-${modul}`);
  const bereich = document.getElementById(`help-panel-${modul}`);
  if (knopf && bereich) {
    knopf.addEventListener('click', () => {
      const geoeffnet = bereich.classList.toggle('is-open');
      knopf.setAttribute('aria-expanded', String(geoeffnet));
    });
  }
});

// Stroke size buttons
document.querySelectorAll('.btn-stroke').forEach(knopf => {
  knopf.addEventListener('click', () => {
    document.querySelectorAll('.btn-stroke').forEach(b => b.classList.remove('is-active'));
    knopf.classList.add('is-active');
    module.draw.setzeStrichstaerke(parseInt(knopf.dataset.stroke, 10));
  });
});

// ── Reiter der Info-Bereiche ──────────────────────────
document.querySelectorAll('.usage-panel').forEach(bereich => {
  // Kennung des Moduls über die umgebende Modulseite bestimmen
  const modulSeite = bereich.closest('.screen');
  const modulId     = modulSeite?.id.replace('mod-', '');
  if (!modulId) return;

  bereich.querySelectorAll('.usage-tab').forEach(reiter => {
    reiter.addEventListener('click', () => module[modulId]?.wechsleReiter(reiter.dataset.tab));
  });
});

// ── Knöpfe „Code kopieren“ ─────────────────────────
document.querySelectorAll('.btn-copy-code').forEach(knopf => {
  knopf.addEventListener('click', () => {
    const block = knopf.closest('.code-block');
    // Text ohne die Beschriftung des Knopfs
    const text = block.innerText.replace(/^Kopieren\n?/, '').trim();
    kopiereInZwischenablage(text);
  });
});

// Versionsnummer in der Fußzeile (steht einmal im <meta name="version">)
{
  const v = document.querySelector('meta[name="version"]'), ziel = document.getElementById('app-version');
  if (v && ziel) ziel.textContent = v.content;
}

// ── TensorFlow.js im Hintergrund vorbereiten ───────────────────
tf.ready().catch(fehler => console.warn('TF.js preload failed:', fehler));

// ── HELL/DUNKEL ────────────────────────────────────
(function() {
  const DESIGN_SCHLUESSEL = 'ki-trainer-theme';
  const html   = document.documentElement;
  const knopf    = document.getElementById('theme-toggle');
  const symbol   = document.getElementById('theme-icon');

  function setzeDesign(design) {
    html.setAttribute('data-theme', design);
    symbol.textContent = design === 'light' ? '☀️' : '🌙';
    knopf.setAttribute('aria-pressed', design === 'light');
    try { localStorage.setItem(DESIGN_SCHLUESSEL, design); } catch(_) {}
  }

  // Start: gemerkte Einstellung oder Vorgabe des Systems
  const gemerkt = (() => {
    try {
      const alt = localStorage.getItem('aki-theme');          // Name bis Version 1.4
      if (alt) { localStorage.setItem(DESIGN_SCHLUESSEL, alt); localStorage.removeItem('aki-theme'); }
      return localStorage.getItem(DESIGN_SCHLUESSEL);
    } catch(_) { return null; }
  })();
  const bevorzugt = gemerkt || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  setzeDesign(bevorzugt);

  knopf.addEventListener('click', () => {
    setzeDesign(html.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
  });
})();

