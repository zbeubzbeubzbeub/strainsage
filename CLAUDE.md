# StrainSage Pro — contexte du projet pour Claude Code

> Point de départ de chaque session. **Si ce résumé et le code divergent, c'est le code qui fait foi** : signale-moi l'écart.
> Dernière mise à jour : 09/11/2026.

## 1. Le projet

StrainSage Pro est le conseiller variétés de **Culture Indoor Anglet**, mon growshop à Anglet (Pays Basque). Je le développe seul.

- **Chat client** (`index.html`) : le client décrit ce qu'il cherche ; l'IA recommande **uniquement des graines commandables chez le grossiste Garden Seeds Trading**, décrites avec les faits de la base de variétés StrainSage, et les affiche en cartes (packs et prix exacts).
- **Admin** (`admin.html`) : synchro du catalogue Garden Seeds, import de la base de variétés (CSV), rapprochement catalogue ↔ base, qualité du catalogue, stock, statistiques, clients, réglages.
- Usages : tablette en boutique, téléphone et ordinateur chez le client. Les faits produit sont dans `PRODUCT.md`, le système visuel dans `DESIGN.md`.
- À terme : relier StrainSage à ma boutique en ligne **OG's Farm** (`C:\Users\theob\ogs-farm`) pour des liens d'achat de graines (et peut-être CBD). Rien n'est fait, rien ne doit être inventé.

## 2. Stack et architecture

| Élément | Détail |
|---|---|
| Pages | `index.html`, `admin.html` (statiques) |
| Scripts | `gst-core.js` (fonctions pures partagées : découpage des noms, packs, rapprochement), `varietes.js` (base + catalogue côté chat : détection, marques, critères, contexte IA), `lightbox.js` (photos en grand), `gd-reference.js` (cache GrowDiaries, réseau coupé) |
| Style | `theme.css` (couleurs, polices, utilitaires communs aux deux pages), illustrations `assets/illustrations/*.svg` (masques), photos `assets/photos/` (Unsplash, crédits + `.json` de provenance) |
| Dépôt | GitHub `zbeubzbeubzbeub/strainsage` ; `main` = production |
| Hébergement | Vercel → strainsage.vercel.app (déploiement à chaque push sur `main`) |
| Proxy | Cloudflare Worker `strainsage-proxy` (`worker.js`) : route par défaut (Anthropic), `/search` et `/fetch-page` (Jina), `/gst` (Garden Seeds, GET en liste blanche), `/image`. En-tête `X-Shop-Token`. |
| Données | Firestore : `users`, `strains`, `knowledge`, `shops`, `adminData`, `varietes` + `varietes_index`, `catalogue_gst` + `catalogue_gst_index`, `catalogue_gst_decisions`, `reference` |
| IA | `claude-sonnet-5-5` pour le chat (Haiku 5.5 testé puis écarté : erreurs de chiffres) |
| Tests | `node test/run-tests.js` (80 tests, Firestore simulé, aucun réseau) · `test/bench-chat.js` (banc coût/rapidité, à coller dans la console de index.html : vrais appels IA ≈ 0,15 $, écritures bloquées) |
| Local | `python -m http.server 8765 --directory C:\Users\theob\strainsage` (config `strainsage-static` dans `ogs-farm/.claude/launch.json`) |

## 3. Ce qui est en production (main = 739c267, mis en ligne le 09/11/2026)

**Catalogue et données**
- Synchro Garden Seeds différentielle et reprenable (cadence 1,2 s, nouvelles tentatives sur 429), articles disparus marqués « Retiré ».
- Découpage des noms piloté par des règles modifiables (« Réglages du catalogue ») ; packs « 3+1 », vrac (Granel) masqué par défaut.
- Rapprochement catalogue ↔ base à 3 niveaux + acronymes (SAD = Sweet Afghani Delicious), décisions manuelles, alias, simulation sans écriture, inspection d'une variété, audit « Qualité du catalogue ».
- Import CSV : noms numériques acceptés, listes non appariées conservées, extraits des caractères mal décodés affichés ; garde-fous de coût Firestore (estimation, confirmation au-delà de 5 000 écritures).

**Chat**
- Recommandations limitées au catalogue ; recherche par nom ou acronyme dans tout le catalogue ; variétés absentes ou en rupture signalées clairement ; variétés déjà présentées réinjectées (pas de fausse auto-correction).
- **Recherche par marque** : « Fast Buds », « 420 Fastbuds », « Barney's »… filtrent d'abord le catalogue sur ce breeder (toutes écritures et collaborations), marque absente signalée ; bandeau « Filtres de cette question » (marque, budget du profil) retirable par ×.
- Floraison des autos comparée de façon cohérente (durée graine → récolte = floraison demandée + 3 semaines).
- Efficacité mesurée : premier mot en ~1,5 s, ~0,017 $ par message (texte d'abord, cartes allégées, réflexion coupée, cache du prompt, contexte resserré).
- Cartes : données du catalogue puis de la base, l'IA seulement en complément (signalé « estim. IA ») ; photos agrandissables (lightbox, HD Garden Seeds 600 px chargée à la demande).

**Design (refonte du 27/10, variante « Noir et or » retenue)**
- Même maison qu'OG's Farm : noir par défaut (ivoire en thème clair), or pour l'action, cuivre pour les prix, vert sapin pour le stock ; Bodoni Moda + Hanken Grotesk ; filets et double filet or ; photos étalonnées et créditées ; illustrations graine, trichome, feuille, pousse.
- Geste signature : packs et prix en lignes de catalogue « 4 graines (3 + 1 offerte) ······ 24,00 € ».
- Logo « strainsage » (pousse en point du i) : clic = retour à l'accueil (chat) ou au tableau de bord (admin).
- Contrat de direction : `.impeccable/surfaces/index-html.md`.

## 4. En attente ou à faire

- **Sécurité, avant d'ouvrir l'app plus largement** : plan prêt (Worker, clés, accès admin, règles Firestore, visibilité du dépôt). Rien n'a été appliqué : chaque étape demande mon accord (redéploiement du Worker, secrets, suppression de données).
- **Clé Jina** à ajouter au Worker (la recherche web est coupée pour la session après un refus).
- **Liens d'achat vers OG's Farm** sur les cartes : à concevoir quand la boutique en ligne sera prête.
- Petits défauts connus : le comparateur affiche « 9–10 sem, » ; le modal de profil vouvoie alors que le chat tutoie ; certains effets de la base restent en anglais sur les cartes (traduits dans les réponses de l'IA).
- Optionnel dans l'admin : réimporter le CSV pour récupérer les noms numériques et les noms/URL non appariés, puis recalculer le rapprochement.

## 5. Règles à respecter absolument

- **Ne jamais redéployer le Worker ni toucher à un secret sans mon accord explicite** (un redéploiement a déjà fait perdre `ANTHROPIC_API_KEY`). Avant et après : `wrangler secret list` ; s'arrêter si wrangler propose d'écraser la config du dashboard.
- **Pas de fusion dans `main`, pas de push sur `main` (= mise en ligne Vercel) sans mon accord.** Travailler sur une branche, je valide en local.
- Ne jamais exposer de clé API dans le front ni dans un commit. Le dépôt est public : pas de détails de sécurité dans les fichiers versionnés.
- N'ouvre pas et n'analyse pas toi-même le CSV ni le catalogue : c'est l'app qui les interprète (écrans d'inspection et d'audit).
- Règles pilotées par les données : aucun cas particulier codé en dur pour une variété ou un breeder.
- Écritures Firestore groupées (batch) et uniquement quand une donnée change. Les tests du chat qui passent par `send()` écrivent dans le vrai Firestore : bloquer les écritures (`test/bench-chat.js` le fait).
- Fonctions appelées depuis un `onclick` : `window.fn = function(){…}` (jamais `async window.fn`).
- Modifications ciblées, vérifiées par `grep -n`, puis `node test/run-tests.js`.
- Bibliothèques externes depuis cdnjs ; polices depuis Google Fonts.
- Ne jamais contourner une protection anti-bot (GrowDiaries reste coupé, `NETWORK=false`).
- Économiser les crédits : peu d'agents, peu de captures, travail groupé.

## 6. Ma façon de travailler

- Je parle français : réponds en français.
- J'aime comprendre les compromis avant une décision d'architecture : propose les options.
- Après une modification, dis clairement ce qui a changé, ce que je voyais avant et ce que je vois maintenant, et ce qui est en ligne ou non.
