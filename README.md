# fit.mi

Life stack — nutrition, training, habits, budget. Une seule app, un seul écran
d'accueil, toutes les données au même endroit.

## Stack

- Vanilla JS, pas de framework
- IndexedDB pour la persistance locale
- PWA : service worker, manifest, offline-first
- GitHub OAuth via Cloudflare Worker
- Déployée sur GitHub Pages

## Lancer en local

```bash
python3 -m http.server 8000
```

Ouvrir http://localhost:8000.

## Version déployée

https://bovmii.github.io/fitmi-v2/

Sur iPhone : Safari → Partage → "Sur l'écran d'accueil" pour l'avoir
en plein écran avec son icône.

## Crédit

Fusion de trois projets du même auteur :

- [fit.mi](https://github.com/bovmii/fit.mi) — nutrition, repas, training, stats
- [habitstack](https://github.com/bovmii/habitstack) — habitudes et streaks
- [budgetflow](https://github.com/bovmii/budgetflow) — dépenses, budget, épargne
