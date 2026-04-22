# fit.mi

Life stack — nutrition, training, habits, budget. Une seule app,
local-first dans le navigateur, synchronisée entre iPhone et Mac via
Supabase, optionnellement empaquetée en app iOS avec widgets home
screen.

## Live

https://bovmii.github.io/fitmi-v2/

Chaque push sur `main` redéploie automatiquement via GitHub Actions.

## Stack

- Vanilla JS (ESM, aucun framework, aucun build step pour la partie web)
- IndexedDB comme source primaire — l'app marche **offline** et sur
  iOS sans réseau
- Supabase pour la sync cloud bidirectionnelle (auth email/password,
  RLS, Realtime, postgres_changes)
- GitHub Pages pour la distribution web
- Capacitor 8 pour l'empaquetage iOS (optionnel)
- `capacitor-health` pour Apple HealthKit (pas + calories actives +
  séances Garmin via Santé)
- SwiftUI pour 6 widgets home screen (optionnel, code dans
  `ios-widgets/`)

## Structure

```
.
├── index.html                point d'entrée web
├── main.js                   boot: thème, DB, migration, auth, sync, widgets
├── config.js                 Supabase URL + anon key (PUBLIC)
├── capacitor.config.json     config iOS wrapper (appId, webDir="dist")
├── css/style.css
├── core/                     modules partagés
│   ├── auth.js               Supabase Auth (email/password)
│   ├── db.js                 wrapper IndexedDB + sync outbox
│   ├── schema.js             stores + SETTINGS_KEYS
│   ├── ids.js                UUID v4
│   ├── migration.js          import one-time des legacy PWA
│   ├── sync.js               push/pull + realtime + conflict resolution
│   ├── supabase.js           client singleton (chargé depuis esm.sh)
│   ├── native.js             pont Capacitor (isNative, haptic, statusBar)
│   ├── health.js             wrapper HealthKit (no-op sur web)
│   ├── widgets.js            pushWidgetData + refreshAllWidgets
│   ├── ui.js                 Theme, showToast, confirmModal, haptic
│   ├── icons.js              ~55 SVG Lucide-style (pas d'emoji UI)
│   ├── date.js               helpers date + semaine ISO
│   └── bus.js                pub/sub pour intégrations cross-module
├── modules/
│   ├── auth/                 login / signup / password-reset / change-pw
│   ├── shell/                header, bottom-nav, settings drawer
│   ├── dashboard/            onglet "Aujourd'hui"
│   ├── nutrition/            log + repas + courses (sub-tabs)
│   │   ├── log.js            ring + macros + eau + jeûne + journal
│   │   ├── foods-db.js       46 aliments FR avec macros
│   │   ├── tdee.js           calculateur Mifflin-St Jeor
│   │   ├── scanner.js        code-barres (BarcodeDetector + ZXing)
│   │   ├── off-api.js        lookup Open Food Facts
│   │   ├── water.js          tracker + chips + progression
│   │   └── fasting.js        timer jeûne intermittent
│   ├── meals/                planner hebdo + recettes + shopping
│   ├── training/             workouts + exercises + sets + rest timer
│   │   ├── seed.js           32 exercices pré-seedés
│   │   └── templates.js      modèles de séance réutilisables
│   ├── budget/               dépenses + catégories + subs + épargne
│   ├── habits/               habitudes + auto-triggers + savingsBoost
│   └── stats/                5 sections avec charts SVG custom
├── db/
│   └── schema.sql            à coller dans Supabase SQL editor
├── ios/                      projet Xcode (généré par `cap add ios`)
├── ios-widgets/              Swift code + README Xcode pour les widgets
├── scripts/
│   └── build-dist.js         copie assets → dist/ pour Capacitor
├── .github/workflows/
│   └── pages.yml             auto-deploy GitHub Pages
├── DISTRIBUTION.md           guide installation iPhone (free + paid)
└── CLAUDE.md                 spec originale (archi a évolué depuis)
```

## Quickstart local

```bash
python3 -m http.server 8000
# ou
node scripts/dev-server.js  # si tu l'as
```

Ouvre http://localhost:8000.

Si `config.js` contient des URLs Supabase vides, l'app tourne en
mode local pur (aucun login, juste IndexedDB). Sinon elle te propose
connexion / création de compte / reset mdp.

## Supabase setup

1. Crée un projet sur https://supabase.com
2. Colle `db/schema.sql` dans SQL Editor → Run
3. Authentication → Providers → Email activé (désactive "Confirm
   email" pour simplifier si tu veux)
4. Authentication → URL Configuration → Site URL =
   `https://bovmii.github.io/fitmi-v2/`
5. Settings → API → copie Project URL + anon key dans `config.js`

## iOS (optionnel)

```bash
# une fois:
brew install cocoapods

# ensuite:
npm install
npm run sync            # build + cap sync ios
npm run open:ios        # ouvre Xcode
```

Puis:
- Suis `DISTRIBUTION.md` pour faire tourner sur iPhone
- Suis `ios-widgets/README.md` pour ajouter les widgets home screen

## Commandes npm

| Script | Effet |
|--------|-------|
| `npm run build` | Copie les assets web dans `dist/` |
| `npm run sync` | build + `npx cap sync ios` |
| `npm run open:ios` | sync + ouvre Xcode |

## Architecture sync

Chaque écriture (`DB.put`, `DB.delete`) :
1. Persiste en local (IndexedDB, source primaire)
2. Enqueue la row dans le store `_outbox` (une entrée par record)
3. Émet un événement `db.put`/`db.delete` sur le bus

Le moteur `core/sync.js` :
1. À chaque event de DB ou au retour en ligne, push la queue vers
   la table `public.records` de Supabase (typed columns +
   jsonb data)
2. Pull les rows `updated_at > lastPullAt` côté serveur
3. Merge local ↔ remote avec last-write-wins sur `updatedAt`
4. Subscribe en temps réel via postgres_changes → les modifs faites
   sur un autre device remontent dans la seconde

Les widgets iOS (phase 7) reçoivent les données via un plugin
Capacitor custom qui écrit dans un App Group UserDefaults partagé,
puis `WidgetCenter.reloadAllTimelines()` rafraîchit les tuiles.

## Crédit

Fusion de trois projets du même auteur :

- [fit.mi](https://github.com/bovmii/fit.mi) — nutrition, repas, training, stats
- [habitstack](https://github.com/bovmii/habitstack) — habitudes, streaks
- [budgetflow](https://github.com/bovmii/budgetflow) — dépenses, budget, épargne

v2 ajoute la sync multi-device et l'empaquetage iOS sans rien casser
de l'UX existante.
