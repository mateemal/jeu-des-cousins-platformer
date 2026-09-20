# Jeu des cousins — Platformer

Prototype web 3 joueurs en défilement automatique.

## Commandes

- Héros 1 : `A`
- Héros 2 : `G`
- Héros 3 : `L`
- Afficher ou masquer le panneau de réglages : `D`
- Mettre en pause ou reprendre : `P`

Maintenir la touche prolonge le saut. Relâcher rend immédiatement à la gravité sa valeur normale. Un héros repoussé vers l’arrière récupère progressivement sa position X de référence uniquement lorsqu’il saute.

## Lancer en local

Le jeu utilise des modules JavaScript et doit être servi par un petit serveur HTTP :

```bash
python -m http.server 8000
```

Puis ouvrir `http://localhost:8000`.

## Patterns

Les patterns sont des grilles JSON 3 × 3. Les lignes vont du haut vers le bas :

- `0` : vide
- `1` : bleu
- `2` : orange
- `3` : vert
- `4` : rose

Ils peuvent être modifiés directement dans des grilles visuelles 3 × 3 dans le panneau de réglages. Chaque modification est appliquée et enregistrée immédiatement.
