// Entry point. Phase 2 scope: initialize theme + open the unified fitmi
// IndexedDB + run the one-time legacy migration. The real app shell is
// wired in phase 3.

import { Theme, showToast, confirmModal } from './core/ui.js';
import { DB } from './core/db.js';
import { initFitmiDB, FITMI_DB_NAME, FITMI_DB_VERSION } from './core/schema.js';
import { runMigrationIfNeeded, migrationStatus } from './core/migration.js';

const statusEl = () => document.getElementById('status');

function setStatus(line) {
  const el = statusEl();
  if (el) el.textContent = line;
}

async function legacyDetected() {
  // Light reuse of the detection logic: opening each candidate DB and
  // checking for stores. Avoids exporting the private detect function.
  const names = ['mealplanner', 'habitstack', 'budgetflow'];
  const found = [];
  for (const name of names) {
    await new Promise((resolve) => {
      const req = indexedDB.open(name);
      req.onsuccess = (e) => {
        const db = e.target.result;
        if (db.objectStoreNames.length > 0) found.push(name);
        db.close();
        resolve();
      };
      req.onerror = () => resolve();
    });
  }
  return found;
}

async function main() {
  Theme.init();
  initFitmiDB();

  setStatus('Ouverture de la base fit.mi…');
  try {
    await DB.open();
  } catch (err) {
    console.error('[main] DB open failed', err);
    setStatus('Erreur : impossible d\'ouvrir la base.');
    return;
  }

  const status = migrationStatus();
  if (!status.done) {
    const candidates = await legacyDetected();
    if (candidates.length > 0) {
      const list = candidates.join(', ');
      const go = await confirmModal(
        `Des données d'anciennes apps (${list}) ont été détectées. ` +
        `Les importer dans fit.mi v2 ? Un backup JSON sera téléchargé avant l'import.`,
        { confirmText: 'Importer', cancelText: 'Plus tard' },
      );
      if (!go) {
        setStatus(`Import reporté — ${list}`);
        return;
      }
      setStatus('Migration en cours…');
      const result = await runMigrationIfNeeded({
        onProgress: ({ step }) => {
          const label = {
            dump: 'Lecture des anciennes données…',
            backup: 'Téléchargement du backup JSON…',
            import: 'Copie dans fit.mi…',
            cleanup: 'Nettoyage…',
          }[step] || step;
          setStatus(label);
        },
      });
      if (result.migrated) {
        const total = Object.values(result.totals || {}).reduce((a, b) => a + b, 0);
        setStatus(`Migration terminée — ${total} entrées importées`);
        showToast(`Migration OK : ${total} entrées importées depuis ${result.legacy.length} base(s).`);
      } else if (result.error) {
        setStatus('Migration échouée — voir console');
      }
    } else {
      setStatus('Base vierge, prête.');
    }
  } else {
    setStatus(`Base prête — ${FITMI_DB_NAME} v${FITMI_DB_VERSION}`);
  }
}

main().catch((err) => {
  console.error('[main] fatal', err);
  setStatus('Erreur fatale — voir console');
});
