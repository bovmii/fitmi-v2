# fit.mi v2 — Spec d'intégration

Ce document est le cahier des charges pour Claude Code. Il décrit la fusion de trois PWA
existantes en une seule application iOS native (via Capacitor) avec widgets home screen.

---

## Contexte

Trois PWAs du même auteur (bovmii), même stack technique (Vanilla JS + IndexedDB +
auth GitHub OAuth via Cloudflare Worker + Service Worker) à fusionner :

- **fit.mi** : https://github.com/bovmii/fit.mi.git
  - Nutrition (calories, macros, TDEE, eau, jeûne intermittent)
  - Repas (planner hebdo, recettes, liste de courses, explorer TheMealDB)
  - Training (workouts, exercices via WGER, sets, templates)
  - Stats (poids, charts calories, progression exercices)
- **habitstack** : https://github.com/bovmii/habitstack.git
  - Habitudes quotidiennes avec streaks, rappels, couleurs, stats
- **budgetflow** : https://github.com/bovmii/budgetflow.git
  - Dépenses catégorisées, budget mensuel, plafonds, abonnements récurrents,
    objectifs d'épargne, convertisseur de devises

Objectif : **une seule app fit.mi web (PWA)** déployée sur GitHub Pages, qui
fusionne les trois. L'enrobage iOS natif (Capacitor, widgets, HealthKit) est
une phase ultérieure **optionnelle** qui se branche par-dessus sans rien casser.

**Ordre de priorité** :
1. Phases 0 à 5 : version web complète, déployée, utilisable au quotidien
2. Phases 6 à 8 (plus tard) : wrapper iOS natif si l'envie des widgets et du
   podomètre Garmin revient

La version web suffit pour 95% des besoins quotidiens : add-to-home-screen sur
iPhone donne plein écran, offline, icône propre. Les seules vraies limitations
PWA sur iOS sont les widgets home screen et HealthKit.

---

## Contraintes de design (NE PAS modifier)

La direction artistique de fit.mi est conservée telle quelle.

**Nom et branding**
- Nom : `fit.mi` (ne pas renommer)
- Logo : SVG existant (rectangle arrondi + texte "fit.mi" avec accent sur ".mi")
- Tagline : "Nutrition · Training · Suivi" peut évoluer vers "Body · Mind · Money"
  mais reste discret

**Palette (à reprendre à l'identique)**
- Background dark : `#0a0a0a`
- Background light : `#f5f2ec`
- Accent dark : `#c4a87a`
- Accent light : `#8b7355`
- Border dark : `#1e1e1e`
- Border light : `#e0dbd0`
- Text dark : `#f5f2ec`
- Text light : `#1a1814`

**Typographie**
- Titres : Outfit, 700/800
- Corps : DM Sans, 400/500/600/700
- Chargées depuis Google Fonts comme actuellement

**Règles UI strictes**
- **Aucun emoji** dans l'interface. Utiliser des SVG inline, style Lucide,
  stroke 1.5 à 2, rayons arrondis. Le projet actuel fit.mi est déjà conforme ;
  habitstack et budgetflow ont des emojis à remplacer pendant le merge.
- Design mobile-first, coins arrondis, dark/light auto via `prefers-color-scheme`,
  toggle manuel persistant en localStorage
- Les composants existants (modal, toast, btn-primary/outline/icon, cal-ring,
  macro-bar, filter-chip) sont la source de vérité. Réutiliser, ne pas réinventer.

---

## Phase 0 — Bootstrap

**0.1 Créer le repo distant et la structure locale**

```bash
mkdir fitmi-v2 && cd fitmi-v2
git init
git clone https://github.com/bovmii/fit.mi.git _sources/fit.mi
git clone https://github.com/bovmii/habitstack.git _sources/habitstack
git clone https://github.com/bovmii/budgetflow.git _sources/budgetflow
```

Créer un `.gitignore` à la racine incluant au minimum :

```
_sources/
node_modules/
.DS_Store
ios/
.env
*.log
```

**0.2 Créer le repo GitHub `fitmi-v2`**

Utiliser la CLI GitHub (préférée) :

```bash
gh repo create bovmii/fitmi-v2 --public --source=. --description "Life stack: nutrition, training, habits, budget - merged from fit.mi + habitstack + budgetflow"
```

Si `gh` n'est pas disponible, demander à l'utilisateur de créer le repo
manuellement sur github.com puis :

```bash
git remote add origin https://github.com/bovmii/fitmi-v2.git
```

**0.3 Activer GitHub Pages**

Après le premier push (fin de phase 1 ou quand une `index.html` minimale existe) :

```bash
gh repo edit bovmii/fitmi-v2 --enable-pages --pages-branch main --pages-path /
```

Si `gh` ne supporte pas ce flag, instructions manuelles à afficher à
l'utilisateur :
- Settings → Pages → Source : Deploy from branch → `main` / `/` (root) → Save

**0.4 Callback OAuth GitHub**

L'app utilise l'OAuth GitHub de fit.mi (`clientId: 'Ov23lilWpiYpbnJaIm1w'`).
Pour que le login fonctionne sur GitHub Pages, l'utilisateur doit ajouter
l'URL de Pages comme callback URL autorisée :

1. github.com → Settings → Developer settings → OAuth Apps → fit.mi app
2. Authorization callback URL : ajouter `https://bovmii.github.io/fitmi-v2/`
   (en plus des URLs existantes)
3. Save

**Important** : l'URL doit se terminer par `/` et correspondre exactement à
ce que le navigateur voit. Le code actuel calcule le redirect_uri comme
`window.location.origin + window.location.pathname`.

**0.5 Structure cible du projet**

```
fitmi-v2/
├── index.html
├── manifest.json
├── sw.js
├── css/
│   └── style.css           (merge + dédoublonnage)
├── core/
│   ├── auth.js             (OAuth GitHub, identique dans les 3)
│   ├── db.js               (wrapper IndexedDB générique)
│   ├── sync.js             (optionnel : backup GitHub Gist)
│   ├── ui.js               (toast, modal, theme toggle, haptics)
│   ├── date.js             (todayStr, getWeekKey, formatDateFr, etc.)
│   ├── icons.js            (bibliothèque SVG centralisée)
│   └── bus.js              (event bus pour cross-module)
├── modules/
│   ├── dashboard/          (NOUVEAU — écran "Aujourd'hui")
│   ├── nutrition/
│   │   ├── calories.js     (split de l'actuel 2000 lignes)
│   │   ├── foods-db.js     (LOCAL_FOODS extrait)
│   │   ├── tdee.js
│   │   ├── fasting.js
│   │   ├── water.js
│   │   └── custom-foods.js
│   ├── meals/
│   │   ├── planner.js
│   │   ├── recipes.js
│   │   ├── shopping.js
│   │   └── explorer.js
│   ├── training/
│   │   └── training.js
│   ├── habits/
│   │   └── habits.js       (port de habitstack)
│   ├── budget/
│   │   ├── expenses.js
│   │   ├── subscriptions.js
│   │   ├── savings.js
│   │   └── converter.js
│   └── stats/
│       └── stats.js        (étendu pour habits + budget)
├── _sources/               (ignoré par git, référence)
├── README.md
└── CLAUDE.md
```

Créer un `README.md` minimal à ce stade avec :
- Titre, tagline
- Stack (vanilla JS, IndexedDB, PWA, GitHub OAuth)
- Comment lancer en local (`python3 -m http.server 8000`)
- Lien vers la version déployée (`https://bovmii.github.io/fitmi-v2/`)
- Crédit des projets sources

Commit initial : `chore: bootstrap monorepo structure`
Push sur `main`.

---

## Phase 1 — Core partagé

Les trois apps ont ~80% de code commun. Cette phase l'extrait.

**`core/auth.js`** : unifier les trois `auth.js`. Le `clientId` et le `workerUrl`
restent ceux de fit.mi. Enlever le stockage du `access_token` en localStorage
(seul `login`, `name`, `avatar_url` sont utilisés).

**`core/db.js`** : wrapper IndexedDB unique. Lire les trois implémentations
(`DB` dans habitstack/budgetflow, les fonctions libres `dbGetAll` etc. dans
fit.mi) et unifier.

**`core/ui.js`** : factoriser `showToast`, `confirmModal`, gestion du theme
(remplacer le `location.reload()` sur `matchMedia change` par un swap de
`data-theme` sur `<html>`).

**`core/date.js`** : `todayStr`, `dateStr(d)`, `getWeekKey`, `getMonday`,
`shiftWeek`, `formatWeekRange`, `getTodayDayIndex`, `daysBetween`, `addDays`.

**`core/icons.js`** : toutes les icônes SVG inline utilisées dans les trois HTML
extraites comme constantes JS ou comme une fonction `icon(name, opts)`.

Commit : `refactor: extract shared core`

---

## Phase 2 — Base de données unifiée

Une seule IndexedDB `fitmi` (version à incrémenter pour le schéma fusionné).

**Stores finaux** :

Nutrition :
- `food_log` (index `date`)
- `custom_foods` (index `name`, `category`)
- `water_log` (index `date`)

Repas :
- `meals` (index `weekKey`)
- `recipes`
- `shopping_extra` (index `weekKey`)
- `favorites`

Training :
- `exercises` (index `muscleGroup`)
- `workouts` (index `startedAt`)
- `sets` (index `workoutId`, `exerciseId`)
- `templates`

Tracking :
- `weight_log` (index `date`)

Habits (nouveau) :
- `habits` (index `order`)
- `completions` (index `habitId`, `date`, `habitDate` composite)

Budget (nouveau) :
- `expenses` (index `date`, `category`)
- `subscriptions`
- `savings`

Commun :
- `settings` (keyPath `key`) — clés namespacées : `nutrition.tdee`,
  `habits.autoTriggers`, `budget.monthly`, `ui.theme`, etc.

**Migration automatique** : au premier lancement de la v2, si les DBs
`mealplanner`, `habitstack`, `budgetflow` existent dans le navigateur de l'utilisateur,
lire leur contenu et l'importer dans `fitmi`. Flag en localStorage pour ne pas refaire.
Supprimer les anciennes DBs après migration réussie.

Commit : `feat: unified IndexedDB with auto-migration from legacy DBs`

---

## Phase 3 — Shell applicatif unifié

**Navigation bas d'écran, 5 onglets (SVG icons uniquement)** :

1. **Aujourd'hui** — dashboard (icône `home`)
2. **Nutrition** — avec sous-onglets internes : Log / Repas / Courses (icône `utensils`)
3. **Training** — inchangé (icône `dumbbell`)
4. **Budget** — port de budgetflow (icône `wallet`)
5. **Stats** — étendu (icône `bar-chart`)

**Où vont les habitudes ?**
Elles vivent principalement dans le dashboard (strip horizontal en haut) et
une vue "Toutes mes habitudes" accessible depuis le bouton "Voir tout" du
dashboard ou depuis Réglages. Pas d'onglet dédié dans la nav — c'est un
compagnon transverse.

**Header** : logo fit.mi à gauche, theme toggle + avatar + logout à droite.
Identique à l'actuel.

**Réglages** : accessibles via icône engrenage en haut à droite ou depuis chaque
module. Contient : profil TDEE, budget mensuel, plafonds par catégorie,
abonnements, objectifs d'épargne, liens auto-complétion habitudes, export/import,
reset, à propos.

Commit : `feat: unified navigation and shell`

---

## Phase 4 — Dashboard "Aujourd'hui"

Vue scrollable unique, mobile-first. L'utilisateur ouvre l'app → voit sa journée
complète en un coup d'œil.

**Sections dans l'ordre vertical** :

**4.1 Greeting**
```
Bonjour [prénom ou login GitHub]
lundi 21 avril · semaine 17
```
Petit, sobre, pas de banner.

**4.2 Habitudes du jour** (strip horizontal scrollable)
- Row de cercles tappables : SVG icon centré, nom en dessous (2 lignes max)
- État coché : rempli de la couleur de l'habitude, outline sinon
- Barre de progression fine au-dessus (`3/5`)
- "Voir tout" à la fin du strip

**4.3 Nutrition**
- La cal-ring existante (consumed / target / burned)
- Les 3 cal-macro bars existantes
- Tap sur la carte → onglet Nutrition

**4.4 Training**
- Si workout en cours : carte "Séance en cours — dos/biceps, 32 min" avec CTA "Reprendre"
- Si séance planifiée : "Aujourd'hui : pecs/triceps" + CTA "Commencer"
- Sinon : "Repos" discret
- (Phase 5 ajoutera les pas HealthKit ici)

**4.5 Budget**
- Ligne 1 : "Aujourd'hui : -23,40 €"
- Ligne 2 : "Ce mois : 820 € / 1 500 €" + barre fine
- Si abonnement dû aujourd'hui : "Prélèvement : Loyer 850 €" en accent
- Tap → onglet Budget

**4.6 Eau** (optionnel si espace)
- Water tracker en chips tappables grandes

**Quick actions — FAB bas droite**
Bouton `+` qui déplie en radial :
- Logger un repas (ouvre le search nutrition)
- Ajouter une dépense (ouvre formulaire budget)
- Saisir poids (modale rapide)
- Nouvelle habitude (ouvre form habits)

**Carte bilan hebdo (dimanche soir seulement)**
Après 18h le dimanche, la dashboard affiche en tête une carte dismissable
"Bilan de la semaine" :
- Habitudes complétées : X/Y jours
- Moyenne calories
- Poids évolution depuis lundi
- Nombre de séances
- Dépensé cette semaine vs budget hebdo (budget mensuel / 4.33)
Swipe horizontal pour dismiss. Flag en IndexedDB pour ne pas réafficher la même semaine.

Commit : `feat: dashboard Aujourd'hui`

---

## Phase 5 — Intégrations cross-module

**5.1 Auto-complétion des habitudes**

Extension du schéma `habits` : champ optionnel `autoTrigger` avec valeurs :
- `water_goal` — auto-coche quand l'objectif eau du jour est atteint
- `workout` — auto-coche quand un workout est loggé aujourd'hui
- `fasting_done` — auto-coche quand le jeûne du jour est complété avec succès
- `calories_ok` — auto-coche quand les calories du jour sont dans la fourchette TDEE ± 10%
- `weight_logged` — auto-coche quand un poids est saisi aujourd'hui
- `expense_under_daily` — auto-coche si dépenses du jour < budget quotidien (budget mensuel / 30)

Dans le formulaire d'édition d'habitude, ajouter un select "Auto-complétion"
avec ces options et "Manuel (défaut)".

Implémentation via `core/bus.js` : chaque module émet des events (`water.goal_reached`,
`workout.logged`, `fasting.completed`, `calories.day_closed`, etc.). Un listener
central dans `habits.js` écoute et marque les completions.

**5.2 Courses → Budget**

Dans la vue Liste de courses (onglet Repas), bouton principal en bas :
```
[J'ai fait les courses]
```

Au tap, modale :
- Montant total (€) — input numérique, focus auto
- Magasin (optionnel, texte libre, autocomplete des derniers)
- Date (défaut aujourd'hui)
- Case "Marquer tous les articles comme achetés" (default coché)

Au submit :
- Crée une dépense `{category: 'Alimentation', amount, description: 'Courses — semaine du [lundi]' + (magasin ? ' · ' + magasin : ''), date}`
- Vide ou marque comme coché la liste de courses courante
- Toast : "Dépense enregistrée : X,XX €"

**5.3 Coût estimé de la semaine**

Champ optionnel `pricePerServing` sur les recettes (€, décimal).
Dans le weekly meal planner, calculer la somme des pricePerServing × portions
pour tous les repas de la semaine et afficher en header :
```
Semaine du 21 au 27 avril · Coût estimé ≈ 47 €
```
Discret, juste informatif.

**5.4 Habitudes "anti-dépense"**

Nouveau type d'habitude : `savingsBoost`. Config : un objectif d'épargne cible
et un montant virtuel par check. Exemple : "Pas de café acheté — 5 €".
Chaque check incrémente le `currentAmount` de l'objectif d'épargne lié.
Pas de mouvement d'argent réel, juste un compteur motivant qui visualise
l'économie potentielle.

Commit : `feat: cross-module integrations`
Push. **La version web est maintenant fonctionnelle, testable sur
`https://bovmii.github.io/fitmi-v2/`. Les phases suivantes sont optionnelles.**

---

## Phase 5.5 — Déploiement continu (recommandé)

Workflow GitHub Actions pour auto-déployer sur Pages à chaque push sur `main`.
Créer `.github/workflows/pages.yml` :

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: .
      - id: deployment
        uses: actions/deploy-pages@v4
```

À partir de là, chaque `git push origin main` déploie automatiquement.

**Tester sur iPhone sans rien installer** :
1. Ouvrir `https://bovmii.github.io/fitmi-v2/` dans Safari iOS
2. Bouton Partage → "Sur l'écran d'accueil"
3. L'app se comporte comme une app native : plein écran, icône, offline
4. Les service workers, les notifications push (iOS 16.4+), les
   `prefers-color-scheme`, tout fonctionne

Commit : `ci: auto-deploy to GitHub Pages`

---

## Phases 6 à 8 — OPTIONNEL : wrapper iOS natif

**À lire avant de démarrer** : ces phases ne sont à entreprendre que si tu
veux spécifiquement les widgets home screen et/ou l'intégration HealthKit
(podomètre, Garmin via Santé). Sinon la version web suffit amplement.

Avantages de passer iOS natif :
- Widgets home screen (indisponibles en PWA sur iOS)
- HealthKit : pas, calories actives, séances Garmin
- Notifications plus riches et fiables
- Distribution via TestFlight

Inconvénients :
- Xcode obligatoire
- Cert à renouveler tous les 7 jours (version gratuite) ou 99 €/an (TestFlight)
- Un peu de Swift à écrire pour les widgets

---

## Phase 6 — Wrapper iOS avec Capacitor

**Installation**

```bash
npm init -y
npm install @capacitor/core @capacitor/cli
npx cap init "fit.mi" "com.bovmii.fitmi" --web-dir="."
npm install @capacitor/ios
npx cap add ios
```

**Plugins**

```bash
npm install @capacitor/app @capacitor/haptics @capacitor/status-bar
npm install @capacitor/local-notifications @capacitor/push-notifications
npm install @capacitor/preferences
npm install @perfood/capacitor-healthkit
```

(Si `@perfood/capacitor-healthkit` n'est plus maintenu au moment de l'exécution,
chercher une alternative à jour ou écrire un plugin custom minimal.)

**Config `capacitor.config.json`**

```json
{
  "appId": "com.bovmii.fitmi",
  "appName": "fit.mi",
  "webDir": ".",
  "ios": {
    "scheme": "fit.mi",
    "contentInset": "automatic"
  },
  "plugins": {
    "LocalNotifications": {
      "smallIcon": "ic_stat_notify",
      "iconColor": "#c4a87a"
    }
  }
}
```

**Info.plist à éditer** (dans `ios/App/App/Info.plist`)

```xml
<key>NSHealthShareUsageDescription</key>
<string>fit.mi lit vos pas, calories actives et séances de sport depuis Santé pour afficher vos progrès.</string>
<key>NSHealthUpdateUsageDescription</key>
<string>fit.mi enregistre vos séances de musculation dans Santé.</string>
<key>NSCameraUsageDescription</key>
<string>fit.mi utilise la caméra pour scanner les codes-barres des produits alimentaires.</string>
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array><string>fitmi</string></array>
  </dict>
</array>
```

Le scheme `fitmi://` permettra aux widgets de deep-linker vers des écrans précis.

**`core/health.js`** (wrapper HealthKit)

Expose :
- `isAvailable()` — détecte plateforme iOS et HealthKit
- `requestPermissions()` — demande accès steps, activeEnergy, workouts
- `readStepsToday()` → number
- `readActiveCaloriesToday()` → number
- `readWorkouts(fromDate, toDate)` → array
- `writeStrengthWorkout({start, end, calories})` — pour propager les séances fit.mi
  vers Santé

Sur non-iOS : retourne des no-op / fallbacks qui ne cassent pas la web version.

**Intégration dashboard**
- Ligne dans la section Training : "Pas aujourd'hui : 7 842"
- Calories actives HealthKit ajoutées au `cal-burned` du ring nutrition

**Garmin Forerunner 55**
Aucune intégration directe. La Garmin Connect app iOS synchronise déjà vers
Apple Santé → fit.mi lit depuis Santé. Documentation utilisateur à ajouter
dans Réglages : "Connecter Garmin → Activer Santé dans Garmin Connect".

**Notifications locales**

Dans Réglages, section "Rappels" :
- Rappel habitudes non faites (heure configurable, défaut 20h)
- Rappel repas non logué (midi + soir)
- Alerte prélèvement d'abonnement (jour J à 9h)

Toutes programmées via `LocalNotifications.schedule()` au démarrage de l'app
et quand les réglages changent.

Commit : `feat: Capacitor iOS wrapper with HealthKit and notifications`

---

## Phase 7 — Widgets home screen iOS

**Principe**

Les widgets sont écrits en **Swift + SwiftUI** dans une extension WidgetKit
du projet Xcode. Ce n'est pas évitable. Le partage de données entre l'app
web (JS) et le widget se fait via un App Group.

**Setup Xcode**

1. `npx cap sync ios && npx cap open ios` — ouvre Xcode
2. File → New → Target → Widget Extension, nom `FitMiWidgets`
3. Signing & Capabilities : ajouter "App Groups" sur **les deux targets**
   (App et FitMiWidgets), créer le group `group.com.bovmii.fitmi`
4. Cocher "Include Live Activity" : non (pour l'instant)

**Plugin Capacitor custom : WidgetBridge**

Créer `ios/App/App/plugins/WidgetBridge/WidgetBridge.swift` :

```swift
import Capacitor
import WidgetKit

@objc(WidgetBridge)
public class WidgetBridge: CAPPlugin {
    private let suiteName = "group.com.bovmii.fitmi"

    @objc func update(_ call: CAPPluginCall) {
        guard let data = call.getObject("data") else {
            call.reject("data required")
            return
        }
        let defaults = UserDefaults(suiteName: suiteName)
        for (key, value) in data {
            defaults?.set(value, forKey: key)
        }
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }
}
```

Exposer côté JS dans `core/widgets.js` :

```js
import { registerPlugin } from '@capacitor/core';
const WidgetBridge = registerPlugin('WidgetBridge');

export async function pushWidgetData(data) {
  if (Capacitor.getPlatform() !== 'ios') return;
  await WidgetBridge.update({ data });
}
```

Appeler `pushWidgetData({...})` à chaque fois qu'une donnée affichée par un widget change.

**Widgets à construire**

Tous utilisent les couleurs fit.mi (`#0a0a0a`, `#c4a87a`, `#f5f2ec`).
SwiftUI, pas d'emoji, SF Symbols ou vectors simples.

**Widget 1 — Hydratation (small)**
- Cercle de progression accent
- "4/8 verres" au centre
- Tap → `fitmi://water`
- Interactive iOS 17+ : tap sur `+` ajoute un verre via `AppIntent`

**Widget 2 — Calories restantes (small)**
- Grand chiffre : 680
- "kcal restantes"
- Petit ring en bas indiquant % consommé
- Tap → `fitmi://nutrition`

**Widget 3 — Habitudes (medium)**
- Grille 2×3 de cercles (6 habitudes prioritaires)
- État coché/non coché
- Tap sur cercle → `fitmi://habits/{id}` (toggle direct en iOS 17+)

**Widget 4 — Liste de courses (medium)**
- Jusqu'à 5 articles de la liste de la semaine courante
- Police compacte, checkbox visuel
- Tap → `fitmi://shopping`

**Widget 5 — Budget (small)**
- "Reste ce mois"
- Montant en gros
- Barre fine de progression
- Tap → `fitmi://budget`

**Widget 6 — Prochain repas (medium)**
- Slot et nom du prochain repas du planner
- "Déjeuner · Poulet riz courgettes"
- Petite indication kcal estimées
- Tap → ouvre la modale de log du repas

**Stratégie de sync des données**

Chaque module pousse ses données via `pushWidgetData` :

- `water.js` → `{ water: { current: 4, target: 8 } }` au log d'un verre
- `habits.js` → `{ habits: [{id, name, icon, color, done}] }` au toggle
- `shopping.js` → `{ shopping: [{name, done}] }` à la génération de la liste
- `budget/expenses.js` → `{ budget: { monthlyRemaining: 680, monthlyTotal: 1500 } }`
- `calories.js` → `{ calories: { consumed, target, burned } }` au log de repas
- `planner.js` → `{ nextMeal: { slot, name, kcal } }` au changement de planning

Côté Swift, chaque widget provider lit le `UserDefaults(suiteName:)` et
construit sa timeline.

**Interactivité iOS 17+**
Pour le widget eau et le widget habitudes, définir des `AppIntent` qui
écrivent directement dans le shared UserDefaults *et* lancent un background
task qui relance l'app pour persister en IndexedDB au prochain foreground.
Alternative plus simple : marquer l'action en pending dans UserDefaults,
l'app la rejoue au launch.

Commit : `feat: iOS widgets with shared data bridge`

---

## Phase 8 — TestFlight et distribution

**Chemin gratuit** (recommandé au début)
1. Apple ID gratuit, Xcode connecté, Personal Team
2. Build sur device via Xcode Run
3. Cert expire tous les 7 jours, rebuild nécessaire
4. Widgets fonctionnent, HealthKit aussi

**Chemin payant** (99 €/an, si l'usage prend)
1. Apple Developer Program
2. App Store Connect : créer l'app "fit.mi"
3. Archive depuis Xcode → upload
4. TestFlight : invite email, jusqu'à 100 testeurs internes
5. Build valide 90 jours
6. Voie vers App Store si envie

Pas d'App Store au départ. L'app est personnelle.

---

## Checkpoints Git

Commits à la fin de chaque phase, push sur `main` après chaque :

```
chore: bootstrap monorepo structure           (phase 0)
refactor: extract shared core                  (phase 1)
feat: unified IndexedDB with auto-migration    (phase 2)
feat: unified navigation and shell             (phase 3)
feat: dashboard Aujourd'hui                    (phase 4)
feat: cross-module integrations                (phase 5)
ci: auto-deploy to GitHub Pages                (phase 5.5)
---- version web complète, optionnel à partir d'ici ----
feat: Capacitor iOS wrapper with HealthKit     (phase 6)
feat: iOS widgets with shared data bridge      (phase 7)
```

Chaque phase doit laisser l'app dans un état fonctionnel, testable en local
(`python3 -m http.server 8000`) **et déployé sur GitHub Pages** après la
phase 5.5.

---

## Ce qu'il ne faut PAS faire

- Pas de redesign visuel (palette, typo, logo, SVG icons)
- Pas de migration React / Vue / Svelte — on reste vanilla JS
- Pas d'emoji dans l'UI, jamais
- Pas de Tailwind, pas de Bootstrap, pas de framework CSS
- Pas de build step au départ (Vite peut venir plus tard en phase bonus)
- Pas de backend dédié — GitHub OAuth via Cloudflare Worker existant reste
  la seule dépendance serveur
- Pas de casser le mode PWA pur : l'app doit rester utilisable dans le
  navigateur desktop/Android. Les features iOS-only (HealthKit, widgets,
  notifs natives) sont des enhancements progressifs conditionnés à la
  détection de plateforme

---

## Instructions pour Claude Code

1. **Lis d'abord les trois repos dans `_sources/`** avant d'écrire la moindre
   ligne. Comprends ce qui existe.
2. **Procède phase par phase.** À la fin de chaque phase : commit + push sur
   `main`, puis demande confirmation avant de passer à la suivante. Les phases
   critiques qui demandent confirmation explicite : phase 2 (migration DB),
   phase 6 et 7 (iOS).
3. **Push régulièrement** pour que GitHub Pages déploie et que l'utilisateur
   puisse tester en continu depuis son iPhone.
4. **Préserve les commentaires et la voix du code existant.** L'auteur écrit
   en français dans les strings UI, en anglais dans les commentaires — garder
   ce pattern.
5. **Réutilise agressivement.** Les composants CSS existants (`cal-ring`,
   `habit-card`, `meal-slot`, etc.) sont la base. Ne recrée rien qui existe.
6. **Teste au fur et à mesure.** Après chaque module migré, l'app doit se
   lancer sans erreur console. Un seul bug bloquant = rollback, on diagnostique.
7. **Écris en français pour l'utilisateur** (strings UI, toasts, labels) mais
   en anglais pour le code (noms de fonctions, commentaires, git messages).
8. **Ne démarre jamais les phases 6-8 sans validation explicite.** La version
   web est suffisante pour la plupart des usages, et les phases iOS demandent
   du Xcode qui n'est pas forcément souhaité.

Bon build.
