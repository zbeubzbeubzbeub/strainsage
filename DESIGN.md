# Design

StrainSage (chat client `index.html`, admin `admin.html`) appartient à la même maison que la boutique en ligne OG's Farm : l'app se lit comme un catalogue de graines qui répond. Ce document décrit le système tel qu'il est construit ; les valeurs font foi dans `theme.css`.

## Monde

- Noir dominant (thème par défaut), ivoire en thème clair. Or pour l'action, le focus, les filets et les intertitres ; cuivre pour les prix ; vert sapin pour le stock ; rouge brique pour la rupture et les erreurs.
- Typographie : **Bodoni Moda** pour les noms de variétés, titres et chiffres mis en avant (intertitres en italique or), **Hanken Grotesk** pour l'interface et le texte. Chiffres tabulaires partout où l'on compare (prix, THC, tableaux).
- Coins quasi carrés (2 à 4 px), filets or fins, **double filet** (2 px + 1 px) pour ouvrir un bloc important, pas d'ombre décorative.
- Photographie étalonnée (`.photo-etalonnee` : désaturée, assombrie, légèrement ambrée, grain fin), toujours créditée en petit.
- Illustrations vectorielles monochromes (graine, trichome, feuille, pousse, semis), teintées par le thème via `mask-image`.

## Geste signature

Chaque pack et chaque prix est une **ligne de catalogue** : `nom ······ prix`, prix en cuivre à chiffres tabulaires (`.cat-line`, `.cat-dots`, `.cat-price`). On la retrouve sur les cartes variétés, le tampon de prix, l'étagère d'accueil, les statistiques et le comparateur.

## Couleurs (theme.css)

| Rôle | Sombre (défaut) | Clair |
|---|---|---|
| Fond `--paper` | #171614 | #f2eee3 |
| Panneau `--surface` | #201f1c | #faf8f2 |
| Retrait `--sunken` | #121211 | #e8e3d5 |
| Encre `--ink` / `--ink2` / `--ink3` | #f2eee3 / #cbc5b8 / #a39e93 | #1a1a1a / #3d3a34 / #5f5a50 |
| Or `--gold` (aplats, focus) | #d4af37 | #d4af37 |
| Or texte `--gold-text` | #e0bd52 | #7a5c0e |
| Filet `--rule` | #d4af37 | #b8952a |
| Cuivre `--copper` (prix) | #d08a4a | #9a5524 |
| Vert `--green` (stock) | #8bb86a | #2d5016 |
| Rouge `--red` (rupture) | #e8836f | #a3321f |
| Bouton principal `--action` / `--action-ink` | #d4af37 / #171614 | #1a1a1a / #f2eee3 |
| Types de variété `--t-indica` / `--t-sativa` / `--t-hybride` | #4b2f5e / #8a4f1c / #2d5016 (texte ivoire) | idem |

Les anciens noms (`--bg*`, `--text*`, `--accent*`, `--badge-*`, `--pill-*`…) restent des alias : ne pas les supprimer, le code les lit.

## Composants

- **Navigation** : barre latérale sur `--surface` ; élément actif = fond or teinté + losange or (pas de bordure gauche épaisse). Modes du chat en onglets soulignés d'or.
- **Boutons** : principal en aplat `--action`, secondaire à filet `--line2` qui passe à l'or au survol, danger en rouge au trait. Hauteur 40 px minimum.
- **Champs** : fond `--sunken`, filet `--line2`, focus or (`--focus`).
- **Registres** (tableaux admin) : en-têtes en petites capitales, lignes séparées par des filets fins, chiffres tabulaires ; chiffres clés du tableau de bord en registre ouvert par un double filet, pas en tuiles.
- **Cartes variétés** : bandeau à la couleur du type (nom en Bodoni, type en petites capitales, lignée en italique), tampon de prix encadré or, frise de floraison or, bloc « À commander » en lignes de catalogue.
- **Toasts** : panneau ouvert par un double filet or.
- **Logo** : « strainsage » en Bodoni minuscules, le point du i remplacé par la pousse (masque `pousse.svg`, or ; filet or foncé en clair). Cliquer dessus ramène à l'accueil (chat) ou au tableau de bord (admin).

## Règles

- Pas d'emoji en guise d'icône, pas de surtitre au-dessus d'un titre, pas de dégradé de texte, pas de verre décoratif.
- Contraste : texte courant ≥ 4,5:1 dans les deux thèmes ; l'or pâle n'est jamais du texte sur ivoire (utiliser `--gold-text`).
- Mouvement : sorties en courbe exponentielle (`cubic-bezier(.16,1,.3,1)`), coupé sous `prefers-reduced-motion`.

## Images et provenance

- Photos : `assets/photos/` (Unsplash, crédits dans `credits.txt`, provenance dans chaque `.json`).
- Illustrations : `assets/illustrations/*.svg`, dessinées en code pour StrainSage, monochromes ; aperçu dans `assets/illustrations/apercu.html`.
